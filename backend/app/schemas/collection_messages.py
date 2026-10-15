import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.collection_workflow import (
    EventType,
    MessageChannel,
    MessageDirection,
    MessageStatus,
)


class MessageCreate(BaseModel):
    channel: MessageChannel
    subject: str | None = None
    body: str


class MessageUpdate(BaseModel):
    channel: MessageChannel | None = None
    subject: str | None = None
    body: str | None = None


class MessageReject(BaseModel):
    rejection_reason: str


class MessageResponse(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID | None
    customer_id: uuid.UUID
    direction: MessageDirection
    channel: MessageChannel
    subject: str | None
    body: str
    status: MessageStatus
    created_by_user_id: uuid.UUID | None
    submitted_at: datetime | None
    reviewed_by_user_id: uuid.UUID | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TimelineEvent(BaseModel):
    event_type: EventType
    description: str
    actor_user_id: uuid.UUID | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
