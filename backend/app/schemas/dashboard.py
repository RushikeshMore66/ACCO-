from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class AttentionItem(BaseModel):
    id: str
    type: str  # "overdue_invoice", "missed_promise", "open_dispute", "unallocated_payment"
    title: str
    subtitle: str
    amount: Decimal | None = None
    currency: str | None = None
    priority: str  # "urgent", "high", "medium"
    link: str


class CurrencyKpi(BaseModel):
    currency: str
    total_outstanding: Decimal
    total_overdue: Decimal
    total_promised: Decimal
    active_invoices_count: int
    overdue_invoices_count: int


class DashboardSummaryResponse(BaseModel):
    kpis: list[CurrencyKpi]
    active_promises_count: int
    missed_promises_count: int
    open_disputes_count: int
    unreviewed_analyses_count: int
    attention_items: list[AttentionItem]

    model_config = ConfigDict(from_attributes=True)
