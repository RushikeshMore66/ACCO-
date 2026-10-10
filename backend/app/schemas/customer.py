from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    contact_name: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=255)
    billing_address: Optional[str] = Field(None, max_length=1024)
    tax_identifier: Optional[str] = Field(None, max_length=255)


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    contact_name: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=255)
    billing_address: Optional[str] = Field(None, max_length=1024)
    tax_identifier: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    contact_name: Optional[str]
    email: Optional[EmailStr]
    phone: Optional[str]
    billing_address: Optional[str]
    tax_identifier: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
