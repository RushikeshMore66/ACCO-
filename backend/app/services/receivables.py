from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_reversal import PaymentReversal
from app.schemas.receivables import InvoiceBalanceResponse


def calculate_days_overdue(due_date: datetime, as_of_date: datetime) -> int:
    # Treat due today as 0 days overdue
    delta = (as_of_date.date() - due_date.date()).days
    return max(delta, 0)


def get_aging_bucket(days_overdue: int) -> str:
    if days_overdue == 0:
        return "NOT_DUE"
    elif 1 <= days_overdue <= 30:
        return "1_30"
    elif 31 <= days_overdue <= 60:
        return "31_60"
    elif 61 <= days_overdue <= 90:
        return "61_90"
    else:
        return "90_PLUS"


def get_payment_status(paid_amount: Decimal, total_amount: Decimal) -> str:
    if paid_amount >= total_amount:
        return "PAID"
    elif paid_amount > Decimal("0.00"):
        return "PARTIALLY_PAID"
    else:
        return "UNPAID"


def get_invoice_balance(
    db: Session, invoice: Invoice, as_of_date: datetime | None = None
) -> InvoiceBalanceResponse:
    if as_of_date is None:
        as_of_date = datetime.now(UTC)

    # Active allocations are those where the payment is not reversed
    stmt = (
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
        .join(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(PaymentReversal, Payment.id == PaymentReversal.payment_id)
        .filter(PaymentAllocation.invoice_id == invoice.id, PaymentReversal.id.is_(None))
    )
    paid_amount = db.execute(stmt).scalar() or Decimal("0.00")

    # Internal integrity check
    if paid_amount > invoice.total_amount:
        raise ValueError(
            f"Data integrity error: Paid amount {paid_amount} exceeds total amount {invoice.total_amount} for invoice {invoice.id}"
        )

    outstanding_amount = invoice.total_amount - paid_amount

    payment_status = get_payment_status(paid_amount, invoice.total_amount)

    days_overdue = 0
    aging_bucket = "NOT_DUE"

    if payment_status == "PAID":
        aging_bucket = "PAID"
    else:
        days_overdue = calculate_days_overdue(invoice.due_date, as_of_date)
        aging_bucket = get_aging_bucket(days_overdue)

    return InvoiceBalanceResponse(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        customer_id=invoice.customer_id,
        currency=invoice.currency,
        total_amount=invoice.total_amount,
        paid_amount=paid_amount,
        outstanding_amount=outstanding_amount,
        payment_status=payment_status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        days_overdue=days_overdue,
        aging_bucket=aging_bucket,
    )
