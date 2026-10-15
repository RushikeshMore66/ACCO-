"""
Celery tasks for email delivery processing and receivable reminders evaluation.
"""
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import (
    CollectionDispute,
    PaymentPromise,
)
from app.models.invoice import Invoice, InvoiceStatus
from app.services.collection_pause_service import evaluate_pause_conditions
from app.services.receivables import get_invoice_balance
from app.workers.celery_app import celery_app
from app.workers.email_delivery_worker import process_batch

logger = logging.getLogger(__name__)

@celery_app.task(name="app.workers.tasks.reminders.process_email_deliveries_task")
def process_email_deliveries_task(batch_size: int = 25) -> int:
    """
    Celery task to drain queued email deliveries.
    """
    with SessionLocal() as db:
        return process_batch(db, batch_size=batch_size)


@celery_app.task(name="app.workers.tasks.reminders.evaluate_receivables_reminders_task")
def evaluate_receivables_reminders_task() -> int:
    """
    Evaluates issued invoices against collection policies and pauses.
    Identifies eligible overdue invoices requiring collection actions.
    """
    now = datetime.now(UTC)
    eligible_count = 0

    with SessionLocal() as db:
        invoices = db.scalars(
            select(Invoice)
            .where(
                Invoice.status == InvoiceStatus.ISSUED,
                Invoice.due_date < now
            )
        ).all()

        for invoice in invoices:
            balance = get_invoice_balance(db, invoice, as_of_date=now)
            if balance.outstanding_amount <= 0:
                continue

            policy = db.scalar(
                select(CollectionPolicy).where(CollectionPolicy.organization_id == invoice.organization_id)
            )
            disputes = db.scalars(
                select(CollectionDispute).where(
                    CollectionDispute.invoice_id == invoice.id,
                    CollectionDispute.organization_id == invoice.organization_id
                )
            ).all()
            promises = db.scalars(
                select(PaymentPromise).where(
                    PaymentPromise.invoice_id == invoice.id,
                    PaymentPromise.organization_id == invoice.organization_id
                )
            ).all()

            pause = evaluate_pause_conditions(
                policy=policy,
                disputes=list(disputes),
                promises=list(promises),
                as_of_date=now
            )

            if not pause.is_paused:
                eligible_count += 1

    return eligible_count
