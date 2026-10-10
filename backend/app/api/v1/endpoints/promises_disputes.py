import uuid
from datetime import datetime, UTC, timedelta
from typing import List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, require_roles
from app.models.user import User, UserRole
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_reversal import PaymentReversal
from app.models.collection_workflow import (
    PaymentPromise, CollectionDispute, CollectionActivity, 
    PromiseStatus, DisputeStatus, EventType
)
from app.models.reply_analysis import CustomerReplyAnalysis, AnalysisStatus, ReplyClassification
from app.schemas.promises_disputes import (
    PromiseCreate, PromiseCancel, PromiseResponse, 
    DisputeCreate, DisputeResolve, DisputeReject, DisputeResponse
)
from app.services.receivables import get_invoice_balance

router = APIRouter()

def record_activity(db: Session, org_id: uuid.UUID, invoice_id: uuid.UUID, customer_id: uuid.UUID, actor_id: uuid.UUID, event_type: EventType, description: str):
    activity = CollectionActivity(
        organization_id=org_id,
        invoice_id=invoice_id,
        customer_id=customer_id,
        actor_user_id=actor_id,
        event_type=event_type,
        description=description,
        created_at=datetime.now(UTC)
    )
    db.add(activity)

@router.post("/invoices/{invoice_id}/promises", response_model=PromiseResponse)
def create_promise(
    invoice_id: uuid.UUID,
    req: PromiseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user.organization_id).with_for_update())
    if not invoice or invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=404, detail="Invoice not found or not issued")

    balance = get_invoice_balance(db, invoice)
    if balance.outstanding_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice has no outstanding balance")
        
    if req.promised_amount <= 0 or req.promised_amount > balance.outstanding_amount:
        raise HTTPException(status_code=400, detail="Promised amount must be positive and not exceed outstanding balance")
        
    today = datetime.now(UTC).date()
    if req.expected_payment_date < today:
        raise HTTPException(status_code=400, detail="Expected payment date cannot be in the past")
        
    follow_up = req.follow_up_date or (req.expected_payment_date + timedelta(days=1))
    if follow_up < req.expected_payment_date:
        raise HTTPException(status_code=400, detail="Follow up date must be on or after expected date")
        
    # If this promise is generated from a reply analysis, validate the reference
    if req.reply_analysis_id:
        analysis = db.scalar(
            select(CustomerReplyAnalysis)
            .where(
                CustomerReplyAnalysis.id == req.reply_analysis_id,
                CustomerReplyAnalysis.organization_id == current_user.organization_id
            )
        )
        if not analysis:
            raise HTTPException(status_code=404, detail="Reply analysis not found")
        if analysis.status != AnalysisStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Reply analysis must be accepted before creating a promise")
        if analysis.classification != ReplyClassification.PAYMENT_PROMISE:
            raise HTTPException(status_code=400, detail="Reply analysis is not classified as a payment promise")
        if analysis.invoice_id and analysis.invoice_id != invoice.id:
            raise HTTPException(status_code=400, detail="Invoice mismatch with analysis")
        if analysis.customer_id != invoice.customer_id:
            raise HTTPException(status_code=400, detail="Customer mismatch with analysis")
            
        # Ensure source message ID matches analysis if provided, otherwise default to analysis source message
        if req.source_message_id and req.source_message_id != analysis.source_message_id:
            raise HTTPException(status_code=400, detail="Source message ID mismatch with analysis")
        req.source_message_id = analysis.source_message_id

        # Check for idempotent retry from the same analysis
        existing_linked_promise = db.scalar(
            select(PaymentPromise).where(
                PaymentPromise.reply_analysis_id == req.reply_analysis_id
            )
        )
        if existing_linked_promise:
            # Check if retry matches existing linked promise fields
            if (existing_linked_promise.promised_amount == req.promised_amount and
                existing_linked_promise.expected_payment_date == req.expected_payment_date and
                existing_linked_promise.invoice_id == invoice.id):
                return existing_linked_promise
            else:
                raise HTTPException(status_code=409, detail="A conflicting promise was already created from this analysis")

    # Check for overlapping active promises
    existing_promise = db.scalar(select(PaymentPromise).where(
        PaymentPromise.invoice_id == invoice.id,
        PaymentPromise.status == PromiseStatus.ACTIVE
    ))
    if existing_promise:
        raise HTTPException(status_code=409, detail="An active promise already exists for this invoice")
        
    promise = PaymentPromise(
        organization_id=invoice.organization_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        promised_amount=req.promised_amount,
        currency=invoice.currency,
        expected_payment_date=req.expected_payment_date,
        follow_up_date=follow_up,
        status=PromiseStatus.ACTIVE,
        recorded_by_user_id=current_user.id,
        source_message_id=req.source_message_id,
        reply_analysis_id=req.reply_analysis_id,
        notes=req.notes
    )
    db.add(promise)
    
    record_activity(db, invoice.organization_id, invoice.id, invoice.customer_id, current_user.id, EventType.PROMISE_CREATED, f"Created promise for {req.promised_amount} {invoice.currency}")
    db.commit()
    db.refresh(promise)
    return promise

@router.get("/invoices/{invoice_id}/promises", response_model=List[PromiseResponse])
def get_promises(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    promises = db.scalars(
        select(PaymentPromise)
        .where(PaymentPromise.invoice_id == invoice_id, PaymentPromise.organization_id == current_user.organization_id)
        .order_by(PaymentPromise.created_at.asc())
    ).all()
    return promises

@router.post("/promises/{promise_id}/mark-fulfilled", response_model=PromiseResponse)
def mark_promise_fulfilled(
    promise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    promise = db.scalar(select(PaymentPromise).where(PaymentPromise.id == promise_id, PaymentPromise.organization_id == current_user.organization_id).with_for_update())
    if not promise:
        raise HTTPException(status_code=404, detail="Promise not found")
        
    if promise.status != PromiseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Promise is not active")

    # Verify fulfilment using canonical payment allocations
    allocations = db.scalars(
        select(PaymentAllocation)
        .join(Payment)
        .outerjoin(PaymentReversal, Payment.id == PaymentReversal.payment_id)
        .where(
            PaymentAllocation.invoice_id == promise.invoice_id,
            PaymentAllocation.created_at >= promise.created_at,
            Payment.payment_date <= promise.expected_payment_date,
            PaymentReversal.id is None
        )
    ).all()
    
    total_allocated = sum((alloc.amount for alloc in allocations), Decimal("0.00"))
    
    if total_allocated < promise.promised_amount:
        raise HTTPException(
            status_code=409, 
            detail=f"Insufficient qualifying payments. Required: {promise.promised_amount}, Found: {total_allocated}"
        )
    
    promise.status = PromiseStatus.FULFILLED
    promise.resolved_at = datetime.now(UTC)
    record_activity(db, promise.organization_id, promise.invoice_id, promise.customer_id, current_user.id, EventType.PROMISE_FULFILLED, f"Promise fulfilled with {total_allocated}")
    db.commit()
    db.refresh(promise)
    return promise

@router.post("/promises/{promise_id}/mark-missed", response_model=PromiseResponse)
def mark_promise_missed(
    promise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    promise = db.scalar(select(PaymentPromise).where(PaymentPromise.id == promise_id, PaymentPromise.organization_id == current_user.organization_id).with_for_update())
    if not promise:
        raise HTTPException(status_code=404, detail="Promise not found")
        
    if promise.status != PromiseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Promise is not active")
        
    today = datetime.now(UTC).date()
    if today <= promise.expected_payment_date:
        raise HTTPException(status_code=400, detail="Cannot mark as missed before expected payment date has passed")
        
    promise.status = PromiseStatus.MISSED
    promise.resolved_at = datetime.now(UTC)
    record_activity(db, promise.organization_id, promise.invoice_id, promise.customer_id, current_user.id, EventType.PROMISE_MISSED, "Promise missed")
    db.commit()
    db.refresh(promise)
    return promise

@router.post("/promises/{promise_id}/cancel", response_model=PromiseResponse)
def cancel_promise(
    promise_id: uuid.UUID,
    req: PromiseCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    promise = db.scalar(select(PaymentPromise).where(PaymentPromise.id == promise_id, PaymentPromise.organization_id == current_user.organization_id).with_for_update())
    if not promise:
        raise HTTPException(status_code=404, detail="Promise not found")
        
    if promise.status != PromiseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active promises can be cancelled")
        
    promise.status = PromiseStatus.CANCELLED
    promise.resolved_at = datetime.now(UTC)
    
    note = f"Cancelled: {req.cancellation_reason}"
    if promise.notes:
        promise.notes = promise.notes + f"\n{note}"
    else:
        promise.notes = note
        
    record_activity(db, promise.organization_id, promise.invoice_id, promise.customer_id, current_user.id, EventType.PROMISE_CANCELLED, f"Cancelled promise: {req.cancellation_reason}")
    db.commit()
    db.refresh(promise)
    return promise


@router.post("/invoices/{invoice_id}/disputes", response_model=DisputeResponse)
def create_dispute(
    invoice_id: uuid.UUID,
    req: DisputeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user.organization_id).with_for_update())
    if not invoice or invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=404, detail="Invoice not found or not issued")

    existing_dispute = db.scalar(select(CollectionDispute).where(
        CollectionDispute.invoice_id == invoice.id,
        CollectionDispute.status.in_([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW])
    ))
    if existing_dispute:
        raise HTTPException(status_code=409, detail="An active dispute already exists")
        
    dispute = CollectionDispute(
        organization_id=invoice.organization_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        category=req.category,
        description=req.description,
        status=DisputeStatus.OPEN,
        opened_by_user_id=current_user.id
    )
    db.add(dispute)
    
    record_activity(db, invoice.organization_id, invoice.id, invoice.customer_id, current_user.id, EventType.DISPUTE_OPENED, f"Opened dispute: {req.category.value}")
    db.commit()
    db.refresh(dispute)
    return dispute

@router.get("/invoices/{invoice_id}/disputes", response_model=List[DisputeResponse])
def get_disputes(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    disputes = db.scalars(
        select(CollectionDispute)
        .where(CollectionDispute.invoice_id == invoice_id, CollectionDispute.organization_id == current_user.organization_id)
        .order_by(CollectionDispute.created_at.asc())
    ).all()
    return disputes

@router.post("/disputes/{dispute_id}/start-review", response_model=DisputeResponse)
def start_dispute_review(
    dispute_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    dispute = db.scalar(select(CollectionDispute).where(CollectionDispute.id == dispute_id, CollectionDispute.organization_id == current_user.organization_id).with_for_update())
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
        
    if dispute.status != DisputeStatus.OPEN:
        raise HTTPException(status_code=400, detail="Dispute must be OPEN to start review")
        
    dispute.status = DisputeStatus.UNDER_REVIEW
    record_activity(db, dispute.organization_id, dispute.invoice_id, dispute.customer_id, current_user.id, EventType.DISPUTE_UNDER_REVIEW, "Started dispute review")
    db.commit()
    db.refresh(dispute)
    return dispute

@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeResponse)
def resolve_dispute(
    dispute_id: uuid.UUID,
    req: DisputeResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER]))
):
    dispute = db.scalar(select(CollectionDispute).where(CollectionDispute.id == dispute_id, CollectionDispute.organization_id == current_user.organization_id).with_for_update())
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
        
    if dispute.status not in (DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Dispute must be active to resolve")
        
    dispute.status = DisputeStatus.RESOLVED
    dispute.resolved_by_user_id = current_user.id
    dispute.resolution_notes = req.resolution_notes
    dispute.resolved_at = datetime.now(UTC)
    
    record_activity(db, dispute.organization_id, dispute.invoice_id, dispute.customer_id, current_user.id, EventType.DISPUTE_RESOLVED, f"Resolved dispute: {req.resolution_notes}")
    db.commit()
    db.refresh(dispute)
    return dispute

@router.post("/disputes/{dispute_id}/reject", response_model=DisputeResponse)
def reject_dispute(
    dispute_id: uuid.UUID,
    req: DisputeReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER]))
):
    dispute = db.scalar(select(CollectionDispute).where(CollectionDispute.id == dispute_id, CollectionDispute.organization_id == current_user.organization_id).with_for_update())
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
        
    if dispute.status not in (DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Dispute must be active to reject")
        
    dispute.status = DisputeStatus.REJECTED
    dispute.resolved_by_user_id = current_user.id
    dispute.resolution_notes = req.rejection_reason
    dispute.resolved_at = datetime.now(UTC)
    
    record_activity(db, dispute.organization_id, dispute.invoice_id, dispute.customer_id, current_user.id, EventType.DISPUTE_REJECTED, f"Rejected dispute: {req.rejection_reason}")
    db.commit()
    db.refresh(dispute)
    return dispute
