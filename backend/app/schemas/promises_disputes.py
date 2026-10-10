from datetime import date, datetime
from typing import Optional, List
import uuid
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from app.models.collection_workflow import PromiseStatus, DisputeCategory, DisputeStatus

class PromiseCreate(BaseModel):
    promised_amount: Decimal
    expected_payment_date: date
    follow_up_date: Optional[date] = None
    source_message_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

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
    recorded_by_user_id: Optional[uuid.UUID]
    source_message_id: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
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
    opened_by_user_id: Optional[uuid.UUID]
    resolved_by_user_id: Optional[uuid.UUID]
    resolution_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)
