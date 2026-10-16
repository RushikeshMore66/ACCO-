from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: UUID
    organization_id: UUID | None
    actor_type: str
    actor_user_id: UUID | None
    action: str
    entity_type: str | None
    entity_id: str | None
    request_id: str | None
    ip_address: str | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
