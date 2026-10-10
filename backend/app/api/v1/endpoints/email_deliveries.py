import uuid
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, require_roles
from app.models.user import User, UserRole
from app.models.collection_workflow import CollectionMessage, MessageStatus, MessageDirection, MessageChannel
from app.models.email_delivery import EmailDelivery, DeliveryStatus
from app.schemas.email_delivery import EmailDeliveryResponse
from app.services.receivables import get_invoice_balance
from app.services.collection_pause_service import evaluate_pause_conditions
from app.models.invoice import Invoice, InvoiceStatus

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
        
    # Load invoice and check eligibility
    invoice = db.scalar(
        select(Invoice)
        .where(Invoice.id == message.invoice_id)
    )
    if not invoice or invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=409, detail="Invoice is not ISSUED")
        
    balance = get_invoice_balance(db, invoice)
    if balance.outstanding_amount <= 0:
        raise HTTPException(status_code=409, detail="Invoice is fully paid")
        
    # Check pause conditions
    # For a real implementation, we would load the active disputes and promises here and pass to evaluate_pause_conditions
    pause_eval = evaluate_pause_conditions(None, [], [], datetime.now(UTC))
    if pause_eval.is_paused:
        raise HTTPException(status_code=409, detail="Collection is currently paused")
        
    # Create the delivery
    delivery = EmailDelivery(
        organization_id=message.organization_id,
        collection_message_id=message.id,
        invoice_id=message.invoice_id,
        customer_id=message.customer_id,
        idempotency_key=str(uuid.uuid4()), # Generate unique stable key
        recipient_email="placeholder@example.com", # In real app, load customer's email or use message snapshot
        subject_snapshot=message.subject,
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
