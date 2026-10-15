from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.collection_workflow import (
    CollectionDispute,
    DisputeStatus,
    PaymentPromise,
    PromiseStatus,
)
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.reply_analysis import AnalysisStatus, CustomerReplyAnalysis
from app.models.user import User, UserRole
from app.schemas.dashboard import AttentionItem, CurrencyKpi, DashboardSummaryResponse
from app.services.receivables import get_invoice_balance

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            [UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]
        )
    ),
):
    as_of_date = datetime.now(UTC)
    today = as_of_date.date()

    # 1. Invoices & Balances
    stmt = (
        select(Invoice, Customer.name.label("customer_name"))
        .join(Customer, Invoice.customer_id == Customer.id)
        .where(
            Invoice.organization_id == current_user.organization_id,
            Invoice.status == InvoiceStatus.ISSUED,
        )
    )
    invoices_with_cust = db.execute(stmt).all()

    kpis_by_curr: dict[str, dict] = {}
    attention_items: list[AttentionItem] = []

    for inv, cust_name in invoices_with_cust:
        curr = inv.currency
        if curr not in kpis_by_curr:
            kpis_by_curr[curr] = {
                "currency": curr,
                "total_outstanding": Decimal("0.00"),
                "total_overdue": Decimal("0.00"),
                "total_promised": Decimal("0.00"),
                "active_invoices_count": 0,
                "overdue_invoices_count": 0,
            }

        bal = get_invoice_balance(db, inv, as_of_date)
        if bal.outstanding_amount > Decimal("0.00"):
            kpis_by_curr[curr]["active_invoices_count"] += 1
            kpis_by_curr[curr]["total_outstanding"] += bal.outstanding_amount

            if bal.days_overdue > 0:
                kpis_by_curr[curr]["overdue_invoices_count"] += 1
                kpis_by_curr[curr]["total_overdue"] += bal.outstanding_amount

                if bal.days_overdue > 30:
                    attention_items.append(
                        AttentionItem(
                            id=f"inv-{inv.id}",
                            type="overdue_invoice",
                            title=f"Invoice {inv.invoice_number} ({cust_name})",
                            subtitle=f"{bal.days_overdue} days overdue",
                            amount=bal.outstanding_amount,
                            currency=inv.currency,
                            priority="urgent" if bal.days_overdue > 60 else "high",
                            link=f"/invoices/{inv.id}",
                        )
                    )

    # 2. Promises
    promises = db.scalars(
        select(PaymentPromise).where(PaymentPromise.organization_id == current_user.organization_id)
    ).all()

    active_promises_count = 0
    missed_promises_count = 0

    for p in promises:
        if p.status == PromiseStatus.ACTIVE:
            if p.currency in kpis_by_curr:
                kpis_by_curr[p.currency]["total_promised"] += p.promised_amount

            if p.expected_payment_date < today:
                missed_promises_count += 1
                attention_items.append(
                    AttentionItem(
                        id=f"prom-{p.id}",
                        type="missed_promise",
                        title=f"Commitment Due {p.expected_payment_date}",
                        subtitle=f"Promised {p.promised_amount} {p.currency} not received",
                        amount=p.promised_amount,
                        currency=p.currency,
                        priority="urgent",
                        link="/collections/promises",
                    )
                )
            else:
                active_promises_count += 1
        elif p.status == PromiseStatus.MISSED:
            missed_promises_count += 1

    # 3. Disputes
    disputes = db.scalars(
        select(CollectionDispute).where(
            CollectionDispute.organization_id == current_user.organization_id,
            CollectionDispute.status.in_([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]),
        )
    ).all()
    open_disputes_count = len(disputes)

    for d in disputes:
        attention_items.append(
            AttentionItem(
                id=f"disp-{d.id}",
                type="open_dispute",
                title=f"Dispute: {d.category.value}",
                subtitle=d.description[:60] + "..." if len(d.description) > 60 else d.description,
                amount=None,
                currency=None,
                priority="high",
                link="/collections/disputes",
            )
        )

    # 4. Reply Analyses awaiting human review
    pending_analyses = db.scalars(
        select(CustomerReplyAnalysis).where(
            CustomerReplyAnalysis.organization_id == current_user.organization_id,
            CustomerReplyAnalysis.status == AnalysisStatus.PENDING_REVIEW,
        )
    ).all()
    unreviewed_analyses_count = len(pending_analyses)

    # Sort attention items by priority
    priority_order = {"urgent": 0, "high": 1, "medium": 2}
    attention_items.sort(key=lambda x: priority_order.get(x.priority, 99))

    return DashboardSummaryResponse(
        kpis=[CurrencyKpi(**data) for data in kpis_by_curr.values()],
        active_promises_count=active_promises_count,
        missed_promises_count=missed_promises_count,
        open_disputes_count=open_disputes_count,
        unreviewed_analyses_count=unreviewed_analyses_count,
        attention_items=attention_items[:15],
    )
