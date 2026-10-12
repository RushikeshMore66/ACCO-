import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=255)
    billing_address: str | None = Field(None, max_length=1024)
    tax_identifier: str | None = Field(None, max_length=255)


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=255)
    billing_address: str | None = Field(None, max_length=1024)
    tax_identifier: str | None = Field(None, max_length=255)
    is_active: bool | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    contact_name: str | None
    email: EmailStr | None
    phone: str | None
    billing_address: str | None
    tax_identifier: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
