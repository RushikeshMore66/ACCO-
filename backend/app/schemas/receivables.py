import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class InvoiceBalanceResponse(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID
    currency: str
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    payment_status: str
    issue_date: datetime
    due_date: datetime
    days_overdue: int
    aging_bucket: str

    model_config = ConfigDict(from_attributes=True)


class ReceivablesSummary(BaseModel):
    currency: str
    invoices_count: int
    total_issued_amount: Decimal
    total_allocated_amount: Decimal
    total_outstanding_amount: Decimal
    overdue_invoices_count: int
    total_overdue_amount: Decimal


class AgingBucketTotal(BaseModel):
    bucket: str
    outstanding_invoices_count: int
    outstanding_amount: Decimal


class AgingReportResponse(BaseModel):
    currency: str
    buckets: list[AgingBucketTotal]
