import uuid
from datetime import datetime

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
    next_attempt_at: datetime | None
    last_error_code: str | None
    last_error_summary: str | None
    created_at: datetime
    updated_at: datetime
    accepted_at: datetime | None
    delivered_at: datetime | None
    bounced_at: datetime | None
    complained_at: datetime | None
    blocked_at: datetime | None
    
    model_config = ConfigDict(from_attributes=True)
