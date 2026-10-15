import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.collection_workflow import DisputeCategory, DisputeStatus, PromiseStatus


class PromiseCreate(BaseModel):
    promised_amount: Decimal
    expected_payment_date: date
    follow_up_date: date | None = None
    source_message_id: uuid.UUID | None = None
    reply_analysis_id: uuid.UUID | None = None
    notes: str | None = None


class PromiseCancel(BaseModel):
    cancellation_reason: str


class PromiseResponse(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    customer_id: uuid.UUID
    promised_amount: Decimal
    currency: str
    expected_payment_date: date
    follow_up_date: date
    status: PromiseStatus
    recorded_by_user_id: uuid.UUID | None
    source_message_id: uuid.UUID | None
    reply_analysis_id: uuid.UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class DisputeCreate(BaseModel):
    category: DisputeCategory
    description: str


class DisputeResolve(BaseModel):
    resolution_notes: str


class DisputeReject(BaseModel):
    rejection_reason: str


class DisputeResponse(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    customer_id: uuid.UUID
    category: DisputeCategory
    description: str
    status: DisputeStatus
    opened_by_user_id: uuid.UUID | None
    resolved_by_user_id: uuid.UUID | None
    resolution_notes: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
