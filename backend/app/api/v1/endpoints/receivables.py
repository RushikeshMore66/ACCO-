import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.user import User
from app.schemas.receivables import (
    AgingBucketTotal,
    AgingReportResponse,
    InvoiceBalanceResponse,
    ReceivablesSummary,
)
from app.services.receivables import get_invoice_balance

router = APIRouter()


@router.get("/invoices", response_model=list[InvoiceBalanceResponse])
def list_receivables_invoices(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    customer_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.organization_id == current_user.organization_id,
        Invoice.status == InvoiceStatus.ISSUED,
    )

    if customer_id:
        stmt = stmt.filter(Invoice.customer_id == customer_id)

    stmt = stmt.order_by(Invoice.created_at.desc()).offset(offset).limit(limit)
    invoices = db.execute(stmt).scalars().all()

    results = []
    as_of_date = datetime.now(UTC)
    for invoice in invoices:
        balance = get_invoice_balance(db, invoice, as_of_date)
        results.append(balance)

    return results


@router.get("/summary", response_model=list[ReceivablesSummary])
def get_receivables_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.organization_id == current_user.organization_id,
        Invoice.status == InvoiceStatus.ISSUED,
    )
    invoices = db.execute(stmt).scalars().all()

    summaries_by_currency = {}
    as_of_date = datetime.now(UTC)

    for invoice in invoices:
        currency = invoice.currency
        if currency not in summaries_by_currency:
            summaries_by_currency[currency] = {
                "currency": currency,
                "invoices_count": 0,
                "total_issued_amount": Decimal("0.00"),
                "total_allocated_amount": Decimal("0.00"),
                "total_outstanding_amount": Decimal("0.00"),
                "overdue_invoices_count": 0,
                "total_overdue_amount": Decimal("0.00"),
            }

        balance = get_invoice_balance(db, invoice, as_of_date)

        summaries_by_currency[currency]["invoices_count"] += 1
        summaries_by_currency[currency]["total_issued_amount"] += invoice.total_amount
        summaries_by_currency[currency]["total_allocated_amount"] += balance.paid_amount
        summaries_by_currency[currency]["total_outstanding_amount"] += balance.outstanding_amount

        if balance.days_overdue > 0 and balance.outstanding_amount > 0:
            summaries_by_currency[currency]["overdue_invoices_count"] += 1
            summaries_by_currency[currency]["total_overdue_amount"] += balance.outstanding_amount

    return [ReceivablesSummary(**v) for v in summaries_by_currency.values()]


@router.get("/aging", response_model=list[AgingReportResponse])
def get_aging_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.organization_id == current_user.organization_id,
        Invoice.status == InvoiceStatus.ISSUED,
    )
    invoices = db.execute(stmt).scalars().all()

    buckets_by_currency = defaultdict(
        lambda: defaultdict(lambda: {"count": 0, "amount": Decimal("0.00")})
    )
    as_of_date = datetime.now(UTC)

    for invoice in invoices:
        balance = get_invoice_balance(db, invoice, as_of_date)

        if balance.payment_status != "PAID" and balance.outstanding_amount > 0:
            bucket = balance.aging_bucket
            currency = invoice.currency
            buckets_by_currency[currency][bucket]["count"] += 1
            buckets_by_currency[currency][bucket]["amount"] += balance.outstanding_amount

    results = []
    for currency, buckets in buckets_by_currency.items():
        bucket_list = []
        for b_name in ["NOT_DUE", "1_30", "31_60", "61_90", "90_PLUS"]:
            if b_name in buckets:
                bucket_list.append(
                    AgingBucketTotal(
                        bucket=b_name,
                        outstanding_invoices_count=buckets[b_name]["count"],
                        outstanding_amount=buckets[b_name]["amount"],
                    )
                )
            else:
                bucket_list.append(
                    AgingBucketTotal(
                        bucket=b_name,
                        outstanding_invoices_count=0,
                        outstanding_amount=Decimal("0.00"),
                    )
                )
        results.append(AgingReportResponse(currency=currency, buckets=bucket_list))

    return results
