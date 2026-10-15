import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CollectionPolicyUpdate(BaseModel):
    initial_reminder_after_days: int = Field(default=1, ge=1)
    follow_up_after_days: int = Field(default=8)
    escalation_after_days: int = Field(default=31)
    require_approval_before_send: bool = True
    pause_collection_on_dispute: bool = True
    pause_collection_on_payment_promise: bool = True

    @model_validator(mode='after')
    def validate_thresholds(self) -> 'CollectionPolicyUpdate':
        if not (self.initial_reminder_after_days >= 1):
            raise ValueError("initial_reminder_after_days must be >= 1")
        if not (self.follow_up_after_days > self.initial_reminder_after_days):
            raise ValueError("follow_up_after_days must be > initial_reminder_after_days")
        if not (self.escalation_after_days > self.follow_up_after_days):
            raise ValueError("escalation_after_days must be > follow_up_after_days")
        return self


class CollectionPolicyResponse(BaseModel):
    id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    initial_reminder_after_days: int
    follow_up_after_days: int
    escalation_after_days: int
    require_approval_before_send: bool
    pause_collection_on_dispute: bool
    pause_collection_on_payment_promise: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
