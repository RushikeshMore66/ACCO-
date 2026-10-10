from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict
from app.models.collection_workflow import MessageDirection, MessageChannel, MessageStatus, EventType

class MessageCreate(BaseModel):
    channel: MessageChannel
    subject: Optional[str] = None
    body: str

class MessageUpdate(BaseModel):
    channel: Optional[MessageChannel] = None
    subject: Optional[str] = None
    body: Optional[str] = None

class MessageReject(BaseModel):
    rejection_reason: str

class MessageResponse(BaseModel):
    id: uuid.UUID
    invoice_id: Optional[uuid.UUID]
    customer_id: uuid.UUID
    direction: MessageDirection
    channel: MessageChannel
    subject: Optional[str]
    body: str
    status: MessageStatus
    created_by_user_id: Optional[uuid.UUID]
    submitted_at: Optional[datetime]
    reviewed_by_user_id: Optional[uuid.UUID]
    reviewed_at: Optional[datetime]
    rejection_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TimelineEvent(BaseModel):
    event_type: EventType
    description: str
    actor_user_id: Optional[uuid.UUID]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
