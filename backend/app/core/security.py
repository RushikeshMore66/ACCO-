import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# pwdlib uses Argon2id by default for recommended
password_hash = PasswordHash.recommended()

# A valid argon2id hash for a dummy password to mitigate timing attacks
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$wK5E/vD57O+W5q6k6jJv4g$1c9f4d7s6e2f1g3h4j5k6l7m8n9p0q1r2s3t4u5v6w7x8y9z0"


def generate_secure_token(nbytes: int = 32) -> str:
    """Generates a cryptographically secure random URL-safe token."""
    return secrets.token_urlsafe(nbytes)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a stored hash."""
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate a password hash."""
    return password_hash.hash(password)


def dummy_verify() -> None:
    """Dummy verification to prevent timing attacks when user is not found."""
    password_hash.verify("dummy", DUMMY_HASH)


ACCESS_TOKEN_TYPE = "access"
MFA_TICKET_TYPE = "mfa_ticket"
SCOPE_FULL = "full"
SCOPE_MFA_ENROLLMENT = "mfa_enrollment"
MFA_TICKET_TTL = timedelta(minutes=5)


def hash_token(token: str) -> str:
    """SHA-256 hex digest used to store bearer secrets (refresh/reset/recovery codes)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode(claims: dict[str, Any]) -> str:
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT secret key is not configured. Cannot issue tokens.")
    return jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256")


def create_access_token(
    subject: str | Any,
    organization_id: str | Any,
    expires_delta: timedelta | None = None,
    *,
    session_id: str | Any | None = None,
    mfa_verified: bool = False,
    scope: str = SCOPE_FULL,
) -> str:
    """Create a signed JWT access token.

    ``session_id`` (``sid``) is the refresh-token family, so revoking the family (logout,
    password reset, replay detection) immediately invalidates access tokens too.
    ``scope=mfa_enrollment`` tokens may only reach the MFA setup endpoints.
    """
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    claims: dict[str, Any] = {
        "exp": expire,
        "iat": now,
        "iss": settings.jwt_issuer,
        "sub": str(subject),
        "organization_id": str(organization_id),
        "typ": ACCESS_TOKEN_TYPE,
        "jti": secrets.token_hex(8),
        "scope": scope,
        "mfa": bool(mfa_verified),
    }
    if session_id is not None:
        claims["sid"] = str(session_id)
    return _encode(claims)


def create_mfa_ticket(subject: str | Any, organization_id: str | Any) -> str:
    """Short-lived proof that the password step succeeded; exchangeable only at /auth/mfa/verify."""
    now = datetime.now(UTC)
    return _encode(
        {
            "exp": now + MFA_TICKET_TTL,
            "iat": now,
            "iss": settings.jwt_issuer,
            "sub": str(subject),
            "organization_id": str(organization_id),
            "typ": MFA_TICKET_TYPE,
            "jti": secrets.token_hex(8),
        }
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Decode + validate signature, issuer, expiry and token type. Raises jwt.InvalidTokenError."""
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT secret key is not configured.")
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
        options={"require": ["exp", "iat", "sub"]},
    )
    # Tokens minted before the typ claim existed are treated as access tokens.
    if payload.get("typ", ACCESS_TOKEN_TYPE) != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload
