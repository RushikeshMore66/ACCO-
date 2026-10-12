import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import (
    CollectionDispute,
    CollectionMessage,
    DisputeStatus,
    MessageChannel,
    MessageDirection,
    MessageStatus,
    PaymentPromise,
    PromiseStatus,
)
from app.models.customer import Customer
from app.models.email_delivery import DeliveryStatus, EmailDelivery
from app.models.invoice import Invoice, InvoiceStatus
from app.models.user import User, UserRole
from app.schemas.email_delivery import EmailDeliveryResponse
from app.services.collection_pause_service import evaluate_pause_conditions
from app.services.receivables import get_invoice_balance

router = APIRouter()

@router.post("/messages/{message_id}/deliveries", response_model=EmailDeliveryResponse, status_code=status.HTTP_202_ACCEPTED)
def enqueue_delivery(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER]))
):
    # Lock and load the message
    message = db.scalar(
        select(CollectionMessage)
        .where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id)
        .with_for_update()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if message.status != MessageStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Message must be APPROVED")
        
    if message.direction != MessageDirection.OUTBOUND or message.channel != MessageChannel.EMAIL:
        raise HTTPException(status_code=400, detail="Only outbound emails can be queued")
        
    # Check if delivery already exists
    existing = db.scalar(
        select(EmailDelivery)
        .where(EmailDelivery.collection_message_id == message.id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Delivery already exists for this message")
        
    # Load invoice with tenant isolation and check eligibility
    invoice = db.scalar(
        select(Invoice)
        .where(
            Invoice.id == message.invoice_id,
            Invoice.organization_id == current_user.organization_id
        )
    )
    if not invoice or invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=409, detail="Invoice is not ISSUED")
        
    balance = get_invoice_balance(db, invoice)
    if balance.outstanding_amount <= 0:
        raise HTTPException(status_code=409, detail="Invoice is fully paid")
        
    # Load customer to resolve verified recipient email
    customer = db.scalar(
        select(Customer)
        .where(
            Customer.id == message.customer_id,
            Customer.organization_id == current_user.organization_id
        )
    )
    if not customer or not customer.email:
        raise HTTPException(status_code=400, detail="Customer has no valid recipient email address configured")

    # Load organization collection policy
    policy = db.scalar(
        select(CollectionPolicy)
        .where(CollectionPolicy.organization_id == current_user.organization_id)
    )

    # Load active disputes and promises for this invoice
    disputes = db.scalars(
        select(CollectionDispute)
        .where(
            CollectionDispute.invoice_id == invoice.id,
            CollectionDispute.organization_id == current_user.organization_id,
            CollectionDispute.status.in_([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW])
        )
    ).all()

    promises = db.scalars(
        select(PaymentPromise)
        .where(
            PaymentPromise.invoice_id == invoice.id,
            PaymentPromise.organization_id == current_user.organization_id,
            PaymentPromise.status == PromiseStatus.ACTIVE
        )
    ).all()

    # Check pause conditions
    pause_eval = evaluate_pause_conditions(policy, list(disputes), list(promises), datetime.now(UTC))
    if pause_eval.is_paused:
        reasons_str = ", ".join(pause_eval.pause_reasons)
        raise HTTPException(status_code=409, detail=f"Collection outreach is paused ({reasons_str})")
        
    # Create the delivery with snapshot of customer's verified email
    delivery = EmailDelivery(
        organization_id=message.organization_id,
        collection_message_id=message.id,
        invoice_id=message.invoice_id,
        customer_id=message.customer_id,
        idempotency_key=str(uuid.uuid4()),
        recipient_email=customer.email,
        subject_snapshot=message.subject or f"Payment Reminder: Invoice {invoice.invoice_number}",
        body_snapshot=message.body,
        status=DeliveryStatus.QUEUED
    )
    
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return delivery
    
@router.get("/messages/{message_id}/deliveries", response_model=EmailDeliveryResponse)
def get_delivery(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    delivery = db.scalar(
        select(EmailDelivery)
        .where(
            EmailDelivery.collection_message_id == message_id, 
            EmailDelivery.organization_id == current_user.organization_id
        )
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
        
    return delivery
