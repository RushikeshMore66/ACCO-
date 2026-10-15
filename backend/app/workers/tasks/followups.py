"""
Worker tasks for evaluating broken promises to pay and scheduling follow-ups.
Deterministic state-transition engine for payment promises.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.collection_workflow import (
    CollectionActivity,
    EventType,
    PaymentPromise,
    PromiseStatus,
)
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_reversal import PaymentReversal
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.followups.sweep_expired_promises_task")
def sweep_expired_promises_task() -> int:
    """
    Celery task entry point to sweep expired promises.
    """
    with SessionLocal() as db:
        return sweep_expired_promises(db)


def sweep_expired_promises(db: Session, as_of_date: datetime | None = None) -> int:
    """
    Find active promises whose expected payment date has passed.
    Check if qualifying payments were allocated.
    If paid -> FULFILLED.
    If not paid -> MISSED.
    Returns the count of updated promises.
    """
    if as_of_date is None:
        as_of_date = datetime.now(UTC)
    today = as_of_date.date()

    query = select(PaymentPromise).where(
        PaymentPromise.status == PromiseStatus.ACTIVE, PaymentPromise.expected_payment_date < today
    )
    if db.bind and db.bind.dialect.name == "postgresql":
        query = query.with_for_update()

    active_promises = db.scalars(query).all()

    updated_count = 0
    for promise in active_promises:
        # Check qualifying allocations
        allocations = db.scalars(
            select(PaymentAllocation)
            .join(Payment)
            .outerjoin(PaymentReversal, Payment.id == PaymentReversal.payment_id)
            .where(
                PaymentAllocation.invoice_id == promise.invoice_id,
                PaymentAllocation.organization_id == promise.organization_id,
                PaymentAllocation.customer_id == promise.customer_id,
                Payment.currency == promise.currency,
                PaymentAllocation.created_at >= promise.created_at,
                Payment.payment_date <= promise.expected_payment_date,
                PaymentReversal.id.is_(None),
            )
        ).all()

        total_allocated = sum((alloc.amount for alloc in allocations), Decimal("0.00"))
        if total_allocated >= promise.promised_amount:
            promise.status = PromiseStatus.FULFILLED
            promise.resolved_at = datetime.now(UTC)
            event_type = EventType.PROMISE_FULFILLED
            desc = f"Promise auto-fulfilled upon sweep: qualifying payments {total_allocated} >= {promise.promised_amount}"
        else:
            promise.status = PromiseStatus.MISSED
            promise.resolved_at = datetime.now(UTC)
            event_type = EventType.PROMISE_MISSED
            desc = f"Promise auto-marked missed: expected date {promise.expected_payment_date} expired without full qualifying payment"

        activity = CollectionActivity(
            organization_id=promise.organization_id,
            invoice_id=promise.invoice_id,
            customer_id=promise.customer_id,
            event_type=event_type,
            description=desc,
            created_at=datetime.now(UTC),
        )
        db.add(activity)
        updated_count += 1

    if updated_count > 0:
        db.commit()

    return updated_count
