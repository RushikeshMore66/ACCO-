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

def create_access_token(subject: str | Any, organization_id: str | Any, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token."""
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode = {
        "exp": expire,
        "iat": datetime.now(UTC),
        "iss": settings.jwt_issuer,
        "sub": str(subject),
        "organization_id": str(organization_id)
    }
    
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT secret key is not configured. Cannot issue tokens.")
        
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm="HS256")
