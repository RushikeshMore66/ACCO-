import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import PRIVILEGED_ROLES, expand_allowed_roles
from app.core.security import ACCESS_TOKEN_TYPE, SCOPE_FULL, SCOPE_MFA_ENROLLMENT, decode_token
from app.db.session import get_db
from app.models.audit_hooks import mark_session_actor
from app.models.user import User, UserRole
from app.services.auth_service import is_session_active

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


def _authenticate(token: str, db: Session, *, allow_enrollment: bool) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not settings.jwt_secret_key:
        raise HTTPException(status_code=500, detail="JWT secret key not configured")

    try:
        payload = decode_token(token, ACCESS_TOKEN_TYPE)
        user_id = uuid.UUID(payload["sub"])
        org_id = uuid.UUID(payload["organization_id"])
        scope = payload.get("scope", SCOPE_FULL)
        session_id = uuid.UUID(payload["sid"]) if payload.get("sid") else None
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (InvalidTokenError, KeyError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.organization_id != org_id:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    org = user.organization
    if org is None or not org.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive organization"
        )

    if scope == SCOPE_MFA_ENROLLMENT:
        # Limited token for privileged users who still have to enrol MFA.
        if not allow_enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="MFA enrollment required"
            )
    else:
        if session_id is None or not is_session_active(db, session_id):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if user.role in PRIVILEGED_ROLES and not payload.get("mfa"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="MFA required")

    mark_session_actor(db, user=user)
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Authenticated user with a complete session (and MFA proof where the role requires it)."""
    return _authenticate(token, db, allow_enrollment=False)


def get_mfa_setup_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Like get_current_user but also accepts the limited MFA-enrollment token."""
    return _authenticate(token, db, allow_enrollment=True)


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_organization_id(current_user: User = Depends(get_current_user)) -> str:
    return str(current_user.organization_id)


def require_roles(allowed_roles: list[UserRole]):
    effective_roles = expand_allowed_roles(allowed_roles)

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in effective_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions"
            )
        return current_user

    return role_checker


__all__ = [
    "get_current_active_user",
    "get_current_organization_id",
    "get_current_user",
    "get_db",
    "get_mfa_setup_user",
    "require_roles",
]
