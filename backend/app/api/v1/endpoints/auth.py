from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, dummy_verify, get_password_hash, verify_password
from app.db.session import get_db
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest, Token, UserResponse

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    email_normalized = request.email.lower().strip()

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
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflict during registration")

    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    OAuth2 compatible token login, get an access token for future requests.
    The `username` field should contain the user's email address.
    """
    email_normalized = form_data.username.lower().strip()
    user = db.query(User).filter(User.email == email_normalized).first()

    if not user:
        dummy_verify()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active or not user.organization.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user or organization"
        )

    expires_in_secs = settings.access_token_expire_minutes * 60
    access_token = create_access_token(
        subject=str(user.id), organization_id=str(user.organization_id)
    )

    return {"access_token": access_token, "token_type": "bearer", "expires_in": expires_in_secs}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
