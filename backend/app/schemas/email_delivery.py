import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.email_delivery import DeliveryStatus

class EmailDeliveryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    collection_message_id: uuid.UUID
    invoice_id: uuid.UUID
    customer_id: uuid.UUID
    provider: str
    recipient_email: str
    subject_snapshot: str
    status: DeliveryStatus
    attempt_count: int
    next_attempt_at: Optional[datetime]
    last_error_code: Optional[str]
    last_error_summary: Optional[str]
    created_at: datetime
    updated_at: datetime
    accepted_at: Optional[datetime]
    delivered_at: Optional[datetime]
    bounced_at: Optional[datetime]
    complained_at: Optional[datetime]
    blocked_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)
