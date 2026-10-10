import time
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.email_delivery import EmailDelivery, DeliveryStatus, EmailDeliveryAttempt
from datetime import datetime, UTC

def process_batch(db: Session, batch_size: int = 10):
    """
    Process a bounded batch of QUEUED emails.
    In PostgreSQL, this would use FOR UPDATE SKIP LOCKED.
    """
    # 1. Claim eligible deliveries
    deliveries = db.scalars(
        select(EmailDelivery)
        .where(EmailDelivery.status == DeliveryStatus.QUEUED)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    ).all()
    
    if not deliveries:
        return 0
        
    for delivery in deliveries:
        delivery.status = DeliveryStatus.SENDING
        
        attempt = EmailDeliveryAttempt(
            organization_id=delivery.organization_id,
            email_delivery_id=delivery.id,
            attempt_number=delivery.attempt_count + 1,
            started_at=datetime.now(UTC),
            result_status="PENDING"
        )
        db.add(attempt)
    db.commit()
    
    # 2. Process each claimed delivery
    # (Simplified for stub representation)
    # provider = ResendProvider(api_key="...", from_address="...")
    
    for delivery in deliveries:
        # provider_result = provider.send_email(...)
        
        # In a real implementation we update attempt and delivery status based on result
        delivery.status = DeliveryStatus.ACCEPTED 
        delivery.accepted_at = datetime.now(UTC)
        delivery.attempt_count += 1
        
        # update attempt record 
        # attempt.completed_at = datetime.now(UTC)
        # attempt.result_status = "SUCCESS"
        
        db.commit()
        
    return len(deliveries)

def run_worker(once: bool = False, poll_interval: int = 10):
    print("Starting Email Delivery Worker...")
    while True:
        with SessionLocal() as db:
            processed = process_batch(db)
            
        if once:
            break
            
        if processed == 0:
            time.sleep(poll_interval)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process one batch and exit")
    args = parser.parse_args()
    
    run_worker(once=args.once)
