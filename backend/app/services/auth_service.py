"""Authentication, session and MFA domain logic.

Security properties implemented here:
  * refresh tokens are single-use, stored only as SHA-256 hashes, rotated on every use, and
    chained by ``family_id``; presenting an already-used/revoked token revokes the whole family;
  * access tokens carry the family id (``sid``) so revoking a family ends the session at once;
  * password reset / email verification tokens are random, hashed, expiring and single-use;
  * TOTP secrets are encrypted at rest, codes are replay-protected, recovery codes are hashed;
  * failed sign-ins lock the account temporarily.

State-changing helpers add to the caller's session; helpers that must persist *before* raising
(failure counters, replay revocation) commit explicitly because ``get_db`` rolls back on errors.
"""

import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import totp
from app.core.config import settings
from app.core.permissions import PRIVILEGED_ROLES
from app.core.security import (
    SCOPE_FULL,
    SCOPE_MFA_ENROLLMENT,
    create_access_token,
    create_mfa_ticket,
    decode_token,
    dummy_verify,
    generate_secure_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models.audit_event import AuditActorType
from app.models.auth_tokens import MfaRecoveryCode, RefreshToken, UserToken, UserTokenPurpose
from app.models.user import User
from app.services.audit_service import record_audit_event

logger = logging.getLogger(__name__)

GENERIC_LOGIN_ERROR = "Incorrect email or password"
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alike characters


class AuthError(Exception):
    """Domain error mapped to an HTTP response by the API layer."""

    def __init__(
        self,
        detail: str,
        status_code: int = status.HTTP_401_UNAUTHORIZED,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.headers = headers or {}


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; PostgreSQL returns aware ones. Normalise to aware UTC."""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def normalize_email(email: str) -> str:
    return email.lower().strip()


def email_fingerprint(email: str) -> str:
    """Non-reversible identifier for audit rows about unknown accounts (avoids storing PII)."""
    return hash_token(normalize_email(email))[:16]


# --------------------------------------------------------------------------- sessions


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str | None
    expires_in: int
    refresh_expires_in: int | None
    mfa_enrollment_required: bool = False


def _new_refresh_row(
    user: User,
    *,
    family_id: uuid.UUID,
    mfa_verified: bool,
    raw: str,
    ip: str | None,
    ua: str | None,
) -> RefreshToken:
    return RefreshToken(
        user_id=user.id,
        organization_id=user.organization_id,
        family_id=family_id,
        token_hash=hash_token(raw),
        mfa_verified=mfa_verified,
        expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
        ip_address=ip,
        user_agent=ua[:255] if ua else None,
    )


def issue_session(
    db: Session,
    user: User,
    *,
    mfa_verified: bool,
    family_id: uuid.UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> SessionTokens:
    """Create access + refresh tokens for a fully authenticated session."""
    from app.core.request_context import get_request_context

    ctx = get_request_context()
    ip = ip or ctx.ip_address
    user_agent = user_agent or ctx.user_agent
    family = family_id or uuid.uuid4()
    raw = generate_secure_token(48)
    db.add(
        _new_refresh_row(
            user, family_id=family, mfa_verified=mfa_verified, raw=raw, ip=ip, ua=user_agent
        )
    )
    access = create_access_token(
        subject=user.id,
        organization_id=user.organization_id,
        session_id=family,
        mfa_verified=mfa_verified,
        scope=SCOPE_FULL,
    )
    return SessionTokens(
        access_token=access,
        refresh_token=raw,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_expires_in=settings.refresh_token_expire_days * 86400,
    )


def issue_enrollment_session(user: User) -> SessionTokens:
    """Limited token for privileged users who must enrol MFA before doing anything else."""
    access = create_access_token(
        subject=user.id,
        organization_id=user.organization_id,
        expires_delta=timedelta(minutes=15),
        scope=SCOPE_MFA_ENROLLMENT,
    )
    return SessionTokens(
        access_token=access,
        refresh_token=None,
        expires_in=15 * 60,
        refresh_expires_in=None,
        mfa_enrollment_required=True,
    )


def revoke_family(db: Session, family_id: uuid.UUID, reason: str) -> int:
    result = db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )
    return result.rowcount or 0


def revoke_all_user_sessions(db: Session, user_id: uuid.UUID, reason: str) -> int:
    result = db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )
    return result.rowcount or 0


def is_session_active(db: Session, family_id: uuid.UUID) -> bool:
    """A session lives while its family holds an unused, unrevoked, unexpired refresh token."""
    row = db.scalar(
        select(RefreshToken.id)
        .where(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.used_at.is_(None),
            RefreshToken.expires_at > utcnow(),
        )
        .limit(1)
    )
    return row is not None


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, SessionTokens]:
    row = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token))
        .with_for_update()
    )
    invalid = AuthError("Invalid refresh token")
    if row is None:
        raise invalid

    within_leeway = (
        row.used_at is not None
        and row.revoked_at is None
        and (utcnow() - as_utc(row.used_at)).total_seconds()
        <= settings.refresh_reuse_leeway_seconds
    )
    if within_leeway:
        # Benign race (e.g. parallel requests refreshing together): hand out another pair from the
        # same family without revoking. Outside this window a reuse is treated as theft.
        user = db.get(User, row.user_id)
        if user is not None and user.is_active and user.organization.is_active:
            record_audit_event(
                db,
                action="auth.refresh.reuse_leeway",
                organization_id=row.organization_id,
                actor_type=AuditActorType.ANONYMOUS,
                entity_type="user",
                entity_id=row.user_id,
            )
            return user, issue_session(
                db, user, mfa_verified=row.mfa_verified, family_id=row.family_id
            )

    if row.used_at is not None or row.revoked_at is not None:
        # Replay of a rotated/revoked token: assume theft, end the whole session family.
        revoke_family(db, row.family_id, "reuse_detected")
        record_audit_event(
            db,
            action="auth.refresh.reuse_detected",
            organization_id=row.organization_id,
            actor_type=AuditActorType.ANONYMOUS,
            entity_type="user",
            entity_id=row.user_id,
            after={"family_id": row.family_id},
        )
        db.commit()
        raise invalid

    if as_utc(row.expires_at) <= utcnow():
        row.revoked_at = utcnow()
        row.revoked_reason = "expired"
        db.commit()
        raise invalid

    user = db.get(User, row.user_id)
    if user is None or not user.is_active or not user.organization.is_active:
        revoke_family(db, row.family_id, "user_inactive")
        db.commit()
        raise invalid
    if user.role in PRIVILEGED_ROLES and not row.mfa_verified:
        # Role was elevated after this session started: force a fresh MFA login.
        revoke_family(db, row.family_id, "mfa_required")
        db.commit()
        raise invalid

    row.used_at = utcnow()
    tokens = issue_session(db, user, mfa_verified=row.mfa_verified, family_id=row.family_id)
    return user, tokens


# --------------------------------------------------------------------------- password login


def _locked(user: User) -> bool:
    return user.locked_until is not None and as_utc(user.locked_until) > utcnow()


def _record_failed_attempt(db: Session, user: User, action: str) -> None:
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    locked_now = user.failed_login_attempts >= settings.login_max_failed_attempts
    if locked_now:
        user.locked_until = utcnow() + timedelta(minutes=settings.login_lockout_minutes)
        user.failed_login_attempts = 0
    record_audit_event(
        db,
        action=action,
        actor_type=AuditActorType.ANONYMOUS,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
        after={"locked": locked_now},
    )
    db.commit()


def authenticate_password(db: Session, email: str, password: str) -> User:
    """Verify credentials. Same error for unknown email and wrong password (anti-enumeration)."""
    normalized = normalize_email(email)
    user = db.scalar(select(User).where(User.email == normalized))
    bad_credentials = AuthError(GENERIC_LOGIN_ERROR, headers={"WWW-Authenticate": "Bearer"})

    if user is None:
        dummy_verify()
        record_audit_event(
            db,
            action="auth.login.failed",
            actor_type=AuditActorType.ANONYMOUS,
            after={"email_fingerprint": email_fingerprint(normalized)},
        )
        db.commit()
        raise bad_credentials

    if _locked(user):
        dummy_verify()
        retry = max(1, int((as_utc(user.locked_until) - utcnow()).total_seconds()))
        record_audit_event(
            db,
            action="auth.login.blocked_locked",
            actor_type=AuditActorType.ANONYMOUS,
            organization_id=user.organization_id,
            entity_type="user",
            entity_id=user.id,
        )
        db.commit()
        raise AuthError(
            "Too many failed attempts. Try again later.",
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"Retry-After": str(retry)},
        )

    if not verify_password(password, user.password_hash):
        _record_failed_attempt(db, user, "auth.login.failed")
        raise bad_credentials

    if not user.is_active or not user.organization.is_active:
        raise AuthError("Inactive user or organization")

    if settings.email_verification_required and user.email_verified_at is None:
        raise AuthError("Email address is not verified", status.HTTP_403_FORBIDDEN)

    return user


@dataclass(frozen=True)
class LoginOutcome:
    kind: str  # "session" | "mfa_required" | "mfa_enrollment_required"
    tokens: SessionTokens | None = None
    mfa_ticket: str | None = None


def complete_password_login(db: Session, user: User) -> LoginOutcome:
    """After a correct password, decide between a full session, an MFA challenge or enrolment."""
    if user.mfa_enabled_at is not None:
        return LoginOutcome(
            "mfa_required", mfa_ticket=create_mfa_ticket(user.id, user.organization_id)
        )
    if user.role in PRIVILEGED_ROLES:
        record_audit_event(
            db,
            action="auth.login.mfa_enrollment_required",
            actor=user,
            entity_type="user",
            entity_id=user.id,
        )
        db.commit()
        return LoginOutcome("mfa_enrollment_required", tokens=issue_enrollment_session(user))
    return LoginOutcome("session", tokens=_finish_login(db, user, mfa_verified=False))


def _finish_login(db: Session, user: User, *, mfa_verified: bool) -> SessionTokens:
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    tokens = issue_session(db, user, mfa_verified=mfa_verified)
    record_audit_event(
        db,
        action="auth.login.success",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        after={"mfa": mfa_verified},
    )
    db.commit()
    return tokens


# --------------------------------------------------------------------------- MFA


def _generate_recovery_codes(db: Session, user: User) -> list[str]:
    db.execute(
        update(MfaRecoveryCode)
        .where(MfaRecoveryCode.user_id == user.id, MfaRecoveryCode.used_at.is_(None))
        .values(used_at=utcnow())
    )
    codes: list[str] = []
    for _ in range(settings.mfa_recovery_code_count):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
        db.add(
            MfaRecoveryCode(
                user_id=user.id,
                organization_id=user.organization_id,
                code_hash=hash_token(raw),
            )
        )
    return codes


def _normalize_recovery(code: str) -> str:
    return code.replace("-", "").replace(" ", "").strip().lower()


def mfa_begin_setup(db: Session, user: User) -> tuple[str, str]:
    """Create (or replace) a pending TOTP secret. MFA is not active until confirmed."""
    if user.mfa_enabled_at is not None:
        raise AuthError("MFA is already enabled", status.HTTP_409_CONFLICT)
    secret = totp.generate_secret()
    user.totp_secret_encrypted = secret
    user.totp_last_step = None
    db.commit()
    return secret, totp.provisioning_uri(secret, user.email, settings.mfa_issuer)


def mfa_enable(db: Session, user: User, code: str) -> list[str]:
    if user.mfa_enabled_at is not None:
        raise AuthError("MFA is already enabled", status.HTTP_409_CONFLICT)
    if not user.totp_secret_encrypted:
        raise AuthError("Start MFA setup first", status.HTTP_400_BAD_REQUEST)
    step = totp.verify_totp(user.totp_secret_encrypted, code)
    if step is None:
        _record_failed_attempt(db, user, "auth.mfa.enable_failed")
        raise AuthError("Invalid verification code", status.HTTP_400_BAD_REQUEST)
    user.mfa_enabled_at = utcnow()
    user.totp_last_step = step
    codes = _generate_recovery_codes(db, user)
    record_audit_event(
        db, action="auth.mfa.enabled", actor=user, entity_type="user", entity_id=user.id
    )
    # Pre-existing sessions never proved MFA; require a fresh login everywhere.
    revoke_all_user_sessions(db, user.id, "mfa_enabled")
    db.commit()
    return codes


def verify_second_factor(
    db: Session, user: User, *, code: str | None, recovery_code: str | None
) -> str:
    """Validate a TOTP or recovery code. Returns "totp" or "recovery"; raises AuthError."""
    if _locked(user):
        raise AuthError(
            "Too many failed attempts. Try again later.", status.HTTP_429_TOO_MANY_REQUESTS
        )
    if code and user.totp_secret_encrypted:
        step = totp.verify_totp(user.totp_secret_encrypted, code, last_step=user.totp_last_step)
        if step is not None:
            user.totp_last_step = step
            return "totp"
    elif recovery_code:
        row = db.scalar(
            select(MfaRecoveryCode)
            .where(
                MfaRecoveryCode.user_id == user.id,
                MfaRecoveryCode.code_hash == hash_token(_normalize_recovery(recovery_code)),
                MfaRecoveryCode.used_at.is_(None),
            )
            .with_for_update()
        )
        if row is not None:
            row.used_at = utcnow()
            return "recovery"
    _record_failed_attempt(db, user, "auth.mfa.failed")
    raise AuthError("Invalid verification code")


def mfa_complete_login(
    db: Session, ticket: str, *, code: str | None, recovery_code: str | None
) -> SessionTokens:
    try:
        claims = decode_token(ticket, "mfa_ticket")
        user = db.get(User, uuid.UUID(claims["sub"]))
    except Exception as exc:
        raise AuthError("Invalid or expired MFA ticket") from exc
    if user is None or not user.is_active or not user.organization.is_active:
        raise AuthError("Invalid or expired MFA ticket")
    if str(user.organization_id) != claims.get("organization_id") or user.mfa_enabled_at is None:
        raise AuthError("Invalid or expired MFA ticket")

    method = verify_second_factor(db, user, code=code, recovery_code=recovery_code)
    if method == "recovery":
        record_audit_event(
            db,
            action="auth.mfa.recovery_code_used",
            actor=user,
            entity_type="user",
            entity_id=user.id,
        )
    return _finish_login(db, user, mfa_verified=True)


def mfa_regenerate_recovery_codes(db: Session, user: User, code: str) -> list[str]:
    if user.mfa_enabled_at is None:
        raise AuthError("MFA is not enabled", status.HTTP_400_BAD_REQUEST)
    verify_second_factor(db, user, code=code, recovery_code=None)
    codes = _generate_recovery_codes(db, user)
    record_audit_event(
        db,
        action="auth.mfa.recovery_codes_regenerated",
        actor=user,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    return codes


def reset_user_mfa(db: Session, target: User, *, actor: User | None, reason: str) -> None:
    """Controlled recovery: clear MFA so the user re-enrols on next login. Always audited."""
    target.totp_secret_encrypted = None
    target.mfa_enabled_at = None
    target.totp_last_step = None
    db.execute(
        update(MfaRecoveryCode)
        .where(MfaRecoveryCode.user_id == target.id, MfaRecoveryCode.used_at.is_(None))
        .values(used_at=utcnow())
    )
    revoke_all_user_sessions(db, target.id, "mfa_reset")
    record_audit_event(
        db,
        action="auth.mfa.reset",
        actor=actor,
        actor_type=None if actor else AuditActorType.SYSTEM,
        organization_id=target.organization_id,
        entity_type="user",
        entity_id=target.id,
        after={"reason": reason},
    )


# --------------------------------------------------------------------------- one-time tokens


def create_user_token(db: Session, user: User, purpose: UserTokenPurpose, ttl: timedelta) -> str:
    """Create a single-use token; earlier unused tokens of the same purpose are invalidated."""
    db.execute(
        update(UserToken)
        .where(
            UserToken.user_id == user.id,
            UserToken.purpose == purpose,
            UserToken.used_at.is_(None),
        )
        .values(used_at=utcnow())
    )
    raw = generate_secure_token(32)
    db.add(
        UserToken(
            user_id=user.id,
            organization_id=user.organization_id,
            purpose=purpose,
            token_hash=hash_token(raw),
            expires_at=utcnow() + ttl,
        )
    )
    return raw


def consume_user_token(db: Session, raw: str, purpose: UserTokenPurpose) -> User:
    """Validate and burn a one-time token, returning its user. Raises AuthError if unusable."""
    invalid = AuthError("Invalid or expired token", status.HTTP_400_BAD_REQUEST)
    row = db.scalar(
        select(UserToken)
        .where(UserToken.token_hash == hash_token(raw), UserToken.purpose == purpose)
        .with_for_update()
    )
    if row is None or row.used_at is not None or as_utc(row.expires_at) <= utcnow():
        raise invalid
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise invalid
    row.used_at = utcnow()
    return user


def request_password_reset(db: Session, email: str) -> tuple[User, str] | None:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not user.is_active:
        return None
    raw = create_user_token(
        db,
        user,
        UserTokenPurpose.PASSWORD_RESET,
        timedelta(minutes=settings.password_reset_ttl_minutes),
    )
    record_audit_event(
        db,
        action="auth.password_reset.requested",
        actor=user,
        actor_type=AuditActorType.ANONYMOUS,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    return user, raw


def complete_password_reset(db: Session, raw_token: str, new_password: str) -> User:
    user = consume_user_token(db, raw_token, UserTokenPurpose.PASSWORD_RESET)
    user.password_hash = get_password_hash(new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    # A reset proves mailbox ownership, which also verifies the address.
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    revoked = revoke_all_user_sessions(db, user.id, "password_reset")
    record_audit_event(
        db,
        action="auth.password_reset.completed",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        after={"sessions_revoked": revoked},
    )
    db.commit()
    return user


def start_email_verification(db: Session, user: User) -> str:
    return create_user_token(
        db,
        user,
        UserTokenPurpose.EMAIL_VERIFICATION,
        timedelta(hours=settings.email_verification_ttl_hours),
    )


def complete_email_verification(db: Session, raw_token: str) -> User:
    user = consume_user_token(db, raw_token, UserTokenPurpose.EMAIL_VERIFICATION)
    user.email_verified_at = user.email_verified_at or utcnow()
    record_audit_event(
        db, action="auth.email.verified", actor=user, entity_type="user", entity_id=user.id
    )
    db.commit()
    return user


def describe_for_log(user: User) -> dict[str, Any]:
    """Non-PII identifiers safe for logs."""
    return {"user_id": str(user.id), "organization_id": str(user.organization_id)}
