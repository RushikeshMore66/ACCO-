from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


def _check_password_strength(value: str) -> str:
    if len(value.strip()) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.")
    if len(set(value)) < 5:
        raise ValueError("Password is too repetitive.")
    return value


class RegisterRequest(BaseModel):
    organization_name: str = Field(..., min_length=1, max_length=255)
    organization_slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("password")
    @classmethod
    def _strong_password(cls, value: str) -> str:
        return _check_password_strength(value)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    refresh_expires_in: int | None = None
    # True when a privileged user must enrol TOTP before the token can do anything else.
    mfa_enrollment_required: bool = False


class MfaChallenge(BaseModel):
    mfa_required: bool = True
    mfa_ticket: str
    token_type: str = "mfa_ticket"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=20, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=512)


class EmailRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)


class TokenRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, value: str) -> str:
        return _check_password_strength(value)


class MessageResponse(BaseModel):
    detail: str


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCodeRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)


class MfaEnableResponse(BaseModel):
    recovery_codes: list[str]
    session: Token


class MfaVerifyRequest(BaseModel):
    mfa_ticket: str = Field(..., min_length=20, max_length=2048)
    code: str | None = Field(default=None, min_length=6, max_length=8)
    recovery_code: str | None = Field(default=None, min_length=8, max_length=32)


class MfaRecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class UserResponse(BaseModel):
    id: UUID
    organization_id: UUID
    email: str
    full_name: str
    is_active: bool
    role: str
    created_at: datetime
    mfa_enabled: bool = False
    email_verified: bool = False

    model_config = {"from_attributes": True}
