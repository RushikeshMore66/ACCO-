from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class TeamMemberResponse(BaseModel):
    id: UUID
    organization_id: UUID
    email: str
    full_name: str
    role: UserRole
    status: str
    is_active: bool
    mfa_enabled: bool
    invited_at: datetime | None = None
    created_at: datetime


class TeamInviteRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole


class TeamRoleUpdateRequest(BaseModel):
    role: UserRole


class MfaResetRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)
