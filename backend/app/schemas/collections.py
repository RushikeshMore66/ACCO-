import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

class CollectionStageSummary(BaseModel):
    stage: str
    invoices_count: int
    outstanding_amount: Decimal

class CurrencyCollectionSummary(BaseModel):
    currency: str
    eligible_invoices_count: int
    total_outstanding_amount: Decimal
    overdue_invoices_count: int
    total_overdue_amount: Decimal
    stages: list[CollectionStageSummary]


class ReceivableItemResponse(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID
    customer_name: str
    currency: str
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    due_date: datetime
    days_overdue: int
    collection_stage: str
    recommended_action: str
    recommendation_reason: str

    model_config = ConfigDict(from_attributes=True)
