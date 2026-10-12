import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import (
    CollectionActivity,
    CollectionDispute,
    EventType,
    PaymentPromise,
)
from app.models.email_delivery import DeliveryStatus, EmailDelivery, EmailDeliveryAttempt
from app.models.invoice import Invoice
from app.services.collection_pause_service import evaluate_pause_conditions
from app.services.email_provider import EmailProvider, EmailProviderError, get_email_provider
from app.services.receivables import get_invoice_balance

logger = logging.getLogger(__name__)

def process_batch(db: Session, batch_size: int = 10, provider: EmailProvider | None = None) -> int:
    """
    Process a bounded batch of QUEUED emails with fresh pre-send eligibility and suppression checks.
    Guarantees bounded retries, idempotent dispatch, and tenant isolation.
    """
    if provider is None:
        provider = get_email_provider()

    now = datetime.now(UTC)

    # 1. Claim eligible deliveries
    query = (
        select(EmailDelivery)
        .where(
            EmailDelivery.status == DeliveryStatus.QUEUED,
            or_(
                EmailDelivery.next_attempt_at.is_(None),
                EmailDelivery.next_attempt_at <= now
            )
        )
        .order_by(EmailDelivery.created_at.asc())
        .limit(batch_size)
    )

    if db.bind and db.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)

    deliveries = db.scalars(query).all()
    if not deliveries:
        return 0

    processed_count = 0

    for delivery in deliveries:
        try:
            # 2. Fresh Pre-Send Eligibility & Balance Check
            invoice = db.scalar(
                select(Invoice)
                .where(
                    Invoice.id == delivery.invoice_id,
                    Invoice.organization_id == delivery.organization_id
                )
            )

            if not invoice:
                delivery.status = DeliveryStatus.CANCELLED
                delivery.last_error_code = "INVOICE_NOT_FOUND"
                delivery.last_error_summary = "Invoice does not exist or has been removed."
                db.commit()
                continue

            balance = get_invoice_balance(db, invoice)
            if balance.outstanding_amount <= 0:
                delivery.status = DeliveryStatus.CANCELLED
                delivery.last_error_code = "INVOICE_PAID"
                delivery.last_error_summary = "Invoice balance is zero before dispatch; reminder suppressed."
                
                activity = CollectionActivity(
                    organization_id=delivery.organization_id,
                    customer_id=delivery.customer_id,
                    invoice_id=delivery.invoice_id,
                    event_type=EventType.COLLECTION_PAUSED,
                    description=f"Email delivery {delivery.id} cancelled prior to dispatch: invoice already paid.",
                    created_at=now
                )
                db.add(activity)
                db.commit()
                continue

            # 3. Fresh Pre-Send Pause & Suppression Check (Disputes & Promises)
            policy = db.scalar(
                select(CollectionPolicy).where(CollectionPolicy.organization_id == delivery.organization_id)
            )
            disputes = db.scalars(
                select(CollectionDispute).where(
                    CollectionDispute.invoice_id == delivery.invoice_id,
                    CollectionDispute.organization_id == delivery.organization_id
                )
            ).all()
            promises = db.scalars(
                select(PaymentPromise).where(
                    PaymentPromise.invoice_id == delivery.invoice_id,
                    PaymentPromise.organization_id == delivery.organization_id
                )
            ).all()

            pause_result = evaluate_pause_conditions(
                policy=policy,
                disputes=list(disputes),
                promises=list(promises),
                as_of_date=now
            )

            if pause_result.is_paused:
                reasons_str = ", ".join(pause_result.pause_reasons)
                delivery.status = DeliveryStatus.BLOCKED
                delivery.blocked_at = now
                delivery.last_error_code = "SUPPRESSED"
                delivery.last_error_summary = f"Delivery suppressed prior to dispatch due to active {reasons_str}"

                activity = CollectionActivity(
                    organization_id=delivery.organization_id,
                    customer_id=delivery.customer_id,
                    invoice_id=delivery.invoice_id,
                    event_type=EventType.COLLECTION_PAUSED,
                    description=f"Email delivery {delivery.id} blocked prior to dispatch: {reasons_str} active.",
                    created_at=now
                )
                db.add(activity)
                db.commit()
                continue

            # 4. Record Attempt and Mark SENDING
            delivery.status = DeliveryStatus.SENDING
            attempt_num = delivery.attempt_count + 1

            attempt = EmailDeliveryAttempt(
                organization_id=delivery.organization_id,
                email_delivery_id=delivery.id,
                attempt_number=attempt_num,
                started_at=now,
                result_status="PENDING"
            )
            db.add(attempt)
            db.commit()

            # 5. Dispatch via Provider
            try:
                res = provider.send_email(
                    to_email=delivery.recipient_email,
                    subject=delivery.subject_snapshot,
                    body=delivery.body_snapshot,
                    idempotency_key=delivery.idempotency_key
                )
                
                # Provider success
                comp_now = datetime.now(UTC)
                delivery.status = DeliveryStatus.ACCEPTED
                delivery.accepted_at = comp_now
                delivery.provider_message_id = res["provider_message_id"]
                delivery.attempt_count = attempt_num
                delivery.next_attempt_at = None
                delivery.last_error_code = None
                delivery.last_error_summary = None

                attempt.completed_at = comp_now
                attempt.result_status = "SUCCESS"
                attempt.provider_message_id = res["provider_message_id"]

                activity = CollectionActivity(
                    organization_id=delivery.organization_id,
                    customer_id=delivery.customer_id,
                    invoice_id=delivery.invoice_id,
                    event_type=EventType.MESSAGE_APPROVED,
                    description=f"Email successfully accepted by delivery provider. ID: {res['provider_message_id']}",
                    created_at=comp_now
                )
                db.add(activity)
                db.commit()
                processed_count += 1

            except EmailProviderError as e_err:
                comp_now = datetime.now(UTC)
                delivery.attempt_count = attempt_num
                delivery.last_error_code = e_err.error_code
                delivery.last_error_summary = str(e_err)

                attempt.completed_at = comp_now
                attempt.result_status = "FAILED"
                attempt.error_code = e_err.error_code
                attempt.error_summary = str(e_err)

                if e_err.is_transient and delivery.attempt_count < 3:
                    # Retry with exponential backoff (e.g. 5m, 10m)
                    backoff_minutes = 5 * (2 ** (delivery.attempt_count - 1))
                    delivery.status = DeliveryStatus.QUEUED
                    delivery.next_attempt_at = comp_now + timedelta(minutes=backoff_minutes)
                else:
                    delivery.status = DeliveryStatus.FAILED
                    delivery.next_attempt_at = None

                db.commit()
                processed_count += 1

            except Exception as unk_err:
                comp_now = datetime.now(UTC)
                delivery.attempt_count = attempt_num
                delivery.last_error_code = "UNEXPECTED_ERROR"
                delivery.last_error_summary = str(unk_err)

                attempt.completed_at = comp_now
                attempt.result_status = "FAILED"
                attempt.error_code = "UNEXPECTED_ERROR"
                attempt.error_summary = str(unk_err)

                if delivery.attempt_count < 3:
                    delivery.status = DeliveryStatus.QUEUED
                    delivery.next_attempt_at = comp_now + timedelta(minutes=5)
                else:
                    delivery.status = DeliveryStatus.FAILED
                    delivery.next_attempt_at = None

                db.commit()
                processed_count += 1

        except Exception as item_err:
            logger.exception(f"Unhandled error processing delivery {delivery.id}: {item_err}")
            db.rollback()

    return processed_count


def run_worker(once: bool = False, poll_interval: int = 10):
    logger.info("Starting Email Delivery Worker...")
    while True:
        with SessionLocal() as db:
            processed = process_batch(db)

        if once:
            break

        if processed == 0:
            import time
            time.sleep(poll_interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process one batch and exit")
    args = parser.parse_args()

    run_worker(once=args.once)
