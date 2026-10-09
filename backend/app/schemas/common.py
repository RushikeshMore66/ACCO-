from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StandardResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    data: Optional[Any] = None


class TimestampedSchema(BaseSchema):
    created_at: datetime
    updated_at: datetime
