import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import settings

# Security utilities placeholder for authentication and token validation


def generate_secure_token(nbytes: int = 32) -> str:
    """Generates a cryptographically secure random URL-safe token."""
    return secrets.token_urlsafe(nbytes)


def create_access_token_placeholder(subject: str | Any, expires_delta: timedelta | None = None) -> str:
    """
    Placeholder access token generator.
    Will be replaced with full JWT implementation during Auth milestone.
    """
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return f"scaffold-token-{subject}-{int(expire.timestamp())}"
