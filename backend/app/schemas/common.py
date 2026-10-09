from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StandardResponse(BaseModel):
    success: bool = True
    message: str | None = None
    data: Any | None = None


class TimestampedSchema(BaseSchema):
    created_at: datetime
    updated_at: datetime
