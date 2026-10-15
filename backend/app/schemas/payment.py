import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.payment import PaymentMethod


class PaymentCreate(BaseModel):
    customer_id: uuid.UUID
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    payment_date: date
    payment_method: PaymentMethod
    reference: str | None = Field(None, max_length=255)
    notes: str | None = None


class PaymentAllocationCreate(BaseModel):
    invoice_id: uuid.UUID
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)


class PaymentReversalCreate(BaseModel):
    reason: str = Field(..., min_length=1)


class PaymentAllocationResponse(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    invoice_id: uuid.UUID
    amount: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentReversalResponse(BaseModel):
    id: uuid.UUID
    reason: str
    reversed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    customer_id: uuid.UUID
    amount: Decimal
    currency: str
    payment_date: date
    payment_method: PaymentMethod
    reference: str | None
    notes: str | None
    created_at: datetime

    # Derived fields for response
    allocated_amount: Decimal = Decimal("0.00")
    unallocated_amount: Decimal = Decimal("0.00")

    allocations: list[PaymentAllocationResponse] = []
    reversal: PaymentReversalResponse | None = None

    model_config = ConfigDict(from_attributes=True)
