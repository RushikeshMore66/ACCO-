from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.invoice import InvoiceStatus


class InvoiceCreate(BaseModel):
    customer_id: uuid.UUID
    invoice_number: str = Field(..., min_length=1, max_length=255)
    issue_date: datetime
    due_date: datetime
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    total_amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    description: Optional[str] = None

    @model_validator(mode="after")
    def check_due_date(self) -> "InvoiceCreate":
        if self.due_date < self.issue_date:
            raise ValueError("due_date cannot be earlier than issue_date")
        return self


class InvoiceUpdate(BaseModel):
    customer_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = Field(None, min_length=1, max_length=255)
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    total_amount: Optional[Decimal] = Field(None, gt=0, max_digits=12, decimal_places=2)
    description: Optional[str] = None


class InvoiceVoid(BaseModel):
    void_reason: str = Field(..., min_length=1)


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    customer_id: uuid.UUID
    invoice_number: str
    issue_date: datetime
    due_date: datetime
    currency: str
    total_amount: Decimal
    description: Optional[str]
    status: InvoiceStatus
    void_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    voided_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class InvoiceImportItem(BaseModel):
    customer_id: Optional[uuid.UUID] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    invoice_number: str
    issue_date: datetime
    due_date: datetime
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    total_amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    description: Optional[str] = None
    auto_issue: bool = False

class InvoiceImportBatchRequest(BaseModel):
    invoices: list[InvoiceImportItem]

class InvoiceImportBatchResultItem(BaseModel):
    invoice_number: str
    status: str  # "CREATED", "ISSUED", "REJECTED", "DUPLICATE"
    invoice_id: Optional[uuid.UUID] = None
    error: Optional[str] = None

class InvoiceImportBatchResponse(BaseModel):
    total_processed: int
    created_count: int
    rejected_count: int
    results: list[InvoiceImportBatchResultItem]
