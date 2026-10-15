import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not settings.jwt_secret_key:
        raise HTTPException(status_code=500, detail="JWT secret key not configured")

    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"], issuer=settings.jwt_issuer
        )
        user_id_str: str | None = payload.get("sub")
        org_id_str: str | None = payload.get("organization_id")
        if user_id_str is None or org_id_str is None:
            raise credentials_exception

        try:
            user_id = uuid.UUID(user_id_str)
            org_id = uuid.UUID(org_id_str)
        except ValueError:
            raise credentials_exception

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    if user.organization_id != org_id:
        raise credentials_exception

    org = user.organization
    if org is None or not org.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive organization"
        )

    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_organization_id(current_user: User = Depends(get_current_user)) -> str:
    return str(current_user.organization_id)


def require_roles(allowed_roles: list[UserRole]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
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
    "require_roles",
]
