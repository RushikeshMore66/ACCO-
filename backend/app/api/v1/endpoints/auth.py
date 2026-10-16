from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_mfa_setup_user
from app.core.security import get_password_hash, hash_token
from app.db.session import get_db
from app.models.audit_event import AuditActorType
from app.models.auth_tokens import RefreshToken
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.auth import (
    EmailRequest,
    LogoutRequest,
    MessageResponse,
    MfaChallenge,
    MfaCodeRequest,
    MfaEnableResponse,
    MfaRecoveryCodesResponse,
    MfaSetupResponse,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    Token,
    TokenRequest,
    UserResponse,
)
from app.services import auth_email, auth_service
from app.services.audit_service import record_audit_event
from app.services.auth_service import AuthError, SessionTokens

router = APIRouter()

NEUTRAL_RESET_MESSAGE = "If an account exists for that address, a reset link has been sent."
NEUTRAL_VERIFY_MESSAGE = "If the address needs verification, a new link has been sent."


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail, headers=exc.headers)


def _token_response(tokens: SessionTokens) -> Token:
    return Token(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        refresh_token=tokens.refresh_token,
        refresh_expires_in=tokens.refresh_expires_in,
        mfa_enrollment_required=tokens.mfa_enrollment_required,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    email_normalized = auth_service.normalize_email(request.email)

    if db.query(User).filter(User.email == email_normalized).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    if db.query(Organization).filter(Organization.slug == request.organization_slug).first():
        raise HTTPException(status_code=409, detail="Organization slug already taken")

    org = Organization(name=request.organization_name, slug=request.organization_slug)
    db.add(org)

    user = User(
        email=email_normalized,
        full_name=request.full_name,
        password_hash=get_password_hash(request.password),
        organization=org,
        role=UserRole.OWNER,
    )
    db.add(user)

    try:
        db.flush()  # assigns ids and surfaces uniqueness conflicts before tokens are created
        verification_token = auth_service.start_email_verification(db, user)
        record_audit_event(
            db,
            action="auth.register",
            actor=user,
            organization_id=user.organization_id,
            entity_type="user",
            entity_id=user.id,
        )
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflict during registration")

    background.add_task(
        auth_email.send_verification_email, user.email, user.full_name, verification_token
    )
    return user


@router.post("/login", response_model=Token, responses={202: {"model": MfaChallenge}})
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    OAuth2 compatible login. The `username` field carries the email address.

    * 200 + tokens: signed in.
    * 200 + `mfa_enrollment_required`: privileged user must enrol TOTP (limited token, no refresh).
    * 202 + `mfa_ticket`: submit a TOTP/recovery code to `/auth/mfa/verify`.
    """
    try:
        user = auth_service.authenticate_password(db, form_data.username, form_data.password)
        outcome = auth_service.complete_password_login(db, user)
    except AuthError as exc:
        raise _http(exc)

    if outcome.kind == "mfa_required":
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=MfaChallenge(mfa_ticket=outcome.mfa_ticket).model_dump(),
        )
    return _token_response(outcome.tokens)


@router.post("/refresh", response_model=Token)
def refresh(request: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new pair. Each refresh token works exactly once."""
    try:
        _, tokens = auth_service.rotate_refresh_token(db, request.refresh_token)
    except AuthError as exc:
        raise _http(exc)
    db.commit()
    return _token_response(tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: LogoutRequest, db: Session = Depends(get_db)):
    """Revoke the session that owns the presented refresh token. Idempotent."""
    if request.refresh_token:
        row = db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(request.refresh_token))
        )
        if row is not None:
            auth_service.revoke_family(db, row.family_id, "logout")
            record_audit_event(
                db,
                action="auth.logout",
                actor_type=AuditActorType.USER,
                organization_id=row.organization_id,
                entity_type="user",
                entity_id=row.user_id,
            )
            db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ----------------------------------------------------------------- email verification


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(request: TokenRequest, db: Session = Depends(get_db)):
    try:
        auth_service.complete_email_verification(db, request.token)
    except AuthError as exc:
        raise _http(exc)
    return MessageResponse(detail="Email address verified.")


@router.post(
    "/resend-verification", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED
)
def resend_verification(
    request: EmailRequest, background: BackgroundTasks, db: Session = Depends(get_db)
):
    user = db.scalar(select(User).where(User.email == auth_service.normalize_email(request.email)))
    if user is not None and user.is_active and user.email_verified_at is None:
        token = auth_service.start_email_verification(db, user)
        db.commit()
        background.add_task(auth_email.send_verification_email, user.email, user.full_name, token)
    return MessageResponse(detail=NEUTRAL_VERIFY_MESSAGE)


# ----------------------------------------------------------------- password recovery


@router.post(
    "/forgot-password", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED
)
def forgot_password(
    request: EmailRequest, background: BackgroundTasks, db: Session = Depends(get_db)
):
    """Always answers identically; the email is sent after the response (no timing signal)."""
    result = auth_service.request_password_reset(db, request.email)
    if result is not None:
        user, token = result
        background.add_task(auth_email.send_password_reset_email, user.email, token)
    return MessageResponse(detail=NEUTRAL_RESET_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        auth_service.complete_password_reset(db, request.token, request.new_password)
    except AuthError as exc:
        raise _http(exc)
    return MessageResponse(detail="Password updated. Please sign in again.")


# ----------------------------------------------------------------- MFA


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(current_user: User = Depends(get_mfa_setup_user), db: Session = Depends(get_db)):
    """Generate a TOTP secret for the caller. Not active until confirmed via /mfa/enable."""
    try:
        secret, uri = auth_service.mfa_begin_setup(db, current_user)
    except AuthError as exc:
        raise _http(exc)
    return MfaSetupResponse(secret=secret, otpauth_uri=uri)


@router.post("/mfa/enable", response_model=MfaEnableResponse)
def mfa_enable(
    request: MfaCodeRequest,
    current_user: User = Depends(get_mfa_setup_user),
    db: Session = Depends(get_db),
):
    """Confirm the first code. Returns one-time recovery codes and a fresh MFA-verified session."""
    try:
        codes = auth_service.mfa_enable(db, current_user, request.code)
    except AuthError as exc:
        raise _http(exc)
    tokens = auth_service.issue_session(db, current_user, mfa_verified=True)
    db.commit()
    return MfaEnableResponse(recovery_codes=codes, session=_token_response(tokens))


@router.post("/mfa/verify", response_model=Token)
def mfa_verify(request: MfaVerifyRequest, db: Session = Depends(get_db)):
    """Complete a login that returned 202: submit a TOTP `code` or a one-time `recovery_code`."""
    if bool(request.code) == bool(request.recovery_code):
        raise HTTPException(status_code=422, detail="Provide exactly one of code or recovery_code")
    try:
        tokens = auth_service.mfa_complete_login(
            db, request.mfa_ticket, code=request.code, recovery_code=request.recovery_code
        )
    except AuthError as exc:
        raise _http(exc)
    return _token_response(tokens)


@router.post("/mfa/recovery-codes", response_model=MfaRecoveryCodesResponse)
def mfa_recovery_codes(
    request: MfaCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace all recovery codes (requires a current TOTP code)."""
    try:
        codes = auth_service.mfa_regenerate_recovery_codes(db, current_user, request.code)
    except AuthError as exc:
        raise _http(exc)
    return MfaRecoveryCodesResponse(recovery_codes=codes)
