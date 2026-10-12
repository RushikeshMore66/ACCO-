import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.collection_workflow import (
    CollectionActivity,
    CollectionMessage,
    EventType,
    MessageChannel,
    MessageDirection,
    MessageStatus,
)
from app.models.invoice import Invoice, InvoiceStatus
from app.models.user import User, UserRole
from app.schemas.collection_messages import (
    MessageCreate,
    MessageReject,
    MessageResponse,
    MessageUpdate,
    TimelineEvent,
)

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

@router.post("/invoices/{invoice_id}/messages", response_model=MessageResponse)
def create_draft(
    invoice_id: uuid.UUID,
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user.organization_id))
    if not invoice or invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=404, detail="Invoice not found or ineligible")

    msg = CollectionMessage(
        organization_id=current_user.organization_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        direction=MessageDirection.OUTBOUND,
        channel=msg_in.channel,
        subject=msg_in.subject,
        body=msg_in.body,
        status=MessageStatus.DRAFT,
        created_by_user_id=current_user.id
    )
    db.add(msg)
    
    record_activity(db, current_user.organization_id, invoice.id, invoice.customer_id, current_user.id, EventType.MESSAGE_CREATED, "Created outbound draft")
    db.commit()
    db.refresh(msg)
    return msg

@router.patch("/messages/{message_id}", response_model=MessageResponse)
def edit_draft(
    message_id: uuid.UUID,
    msg_in: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    msg = db.scalar(select(CollectionMessage).where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id).with_for_update())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.status not in (MessageStatus.DRAFT, MessageStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Only DRAFT or REJECTED messages can be edited")

    if msg_in.channel:
        msg.channel = msg_in.channel
    if msg_in.subject is not None:
        msg.subject = msg_in.subject
    if msg_in.body is not None:
        msg.body = msg_in.body

    msg.status = MessageStatus.DRAFT
    msg.rejection_reason = None
    msg.reviewed_by_user_id = None
    msg.reviewed_at = None

    record_activity(db, msg.organization_id, msg.invoice_id, msg.customer_id, current_user.id, EventType.MESSAGE_EDITED, "Edited draft message")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/messages/{message_id}/submit-for-approval", response_model=MessageResponse)
def submit_draft(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    msg = db.scalar(select(CollectionMessage).where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id).with_for_update())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.status not in (MessageStatus.DRAFT, MessageStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Only DRAFT or REJECTED messages can be submitted")
        
    if not msg.body:
        raise HTTPException(status_code=400, detail="Message body cannot be empty")

    msg.status = MessageStatus.PENDING_APPROVAL
    msg.submitted_at = datetime.now(UTC)

    record_activity(db, msg.organization_id, msg.invoice_id, msg.customer_id, current_user.id, EventType.MESSAGE_SUBMITTED, "Submitted draft for approval")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/messages/{message_id}/approve", response_model=MessageResponse)
def approve_draft(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER]))
):
    msg = db.scalar(select(CollectionMessage).where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id).with_for_update())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.status != MessageStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Message must be PENDING_APPROVAL")

    msg.status = MessageStatus.APPROVED
    msg.reviewed_by_user_id = current_user.id
    msg.reviewed_at = datetime.now(UTC)

    record_activity(db, msg.organization_id, msg.invoice_id, msg.customer_id, current_user.id, EventType.MESSAGE_APPROVED, "Approved message")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/messages/{message_id}/reject", response_model=MessageResponse)
def reject_draft(
    message_id: uuid.UUID,
    req: MessageReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER]))
):
    msg = db.scalar(select(CollectionMessage).where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id).with_for_update())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.status != MessageStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Message must be PENDING_APPROVAL")

    msg.status = MessageStatus.REJECTED
    msg.reviewed_by_user_id = current_user.id
    msg.reviewed_at = datetime.now(UTC)
    msg.rejection_reason = req.rejection_reason

    record_activity(db, msg.organization_id, msg.invoice_id, msg.customer_id, current_user.id, EventType.MESSAGE_REJECTED, f"Rejected message: {req.rejection_reason}")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/messages/{message_id}/cancel", response_model=MessageResponse)
def cancel_draft(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    msg = db.scalar(select(CollectionMessage).where(CollectionMessage.id == message_id, CollectionMessage.organization_id == current_user.organization_id).with_for_update())
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.status in (MessageStatus.APPROVED, MessageStatus.CANCELLED, MessageStatus.RECEIVED, MessageStatus.RECORDED):
        raise HTTPException(status_code=400, detail="Message cannot be cancelled")

    msg.status = MessageStatus.CANCELLED
    record_activity(db, msg.organization_id, msg.invoice_id, msg.customer_id, current_user.id, EventType.MESSAGE_CANCELLED, "Cancelled message")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/invoices/{invoice_id}/inbound-messages", response_model=MessageResponse)
def record_inbound(
    invoice_id: uuid.UUID,
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user.organization_id))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    msg = CollectionMessage(
        organization_id=current_user.organization_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        direction=MessageDirection.INBOUND,
        channel=msg_in.channel,
        subject=msg_in.subject,
        body=msg_in.body,
        status=MessageStatus.RECEIVED,
        created_by_user_id=current_user.id
    )
    db.add(msg)
    
    record_activity(db, current_user.organization_id, invoice.id, invoice.customer_id, current_user.id, EventType.INBOUND_RECORDED, "Recorded inbound communication")
    db.commit()
    db.refresh(msg)
    return msg

@router.post("/invoices/{invoice_id}/notes", response_model=MessageResponse)
def record_note(
    invoice_id: uuid.UUID,
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user.organization_id))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    msg = CollectionMessage(
        organization_id=current_user.organization_id,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        direction=MessageDirection.INTERNAL_NOTE,
        channel=MessageChannel.INTERNAL,
        subject=msg_in.subject,
        body=msg_in.body,
        status=MessageStatus.RECORDED,
        created_by_user_id=current_user.id
    )
    db.add(msg)
    
    record_activity(db, current_user.organization_id, invoice.id, invoice.customer_id, current_user.id, EventType.NOTE_RECORDED, "Recorded internal note")
    db.commit()
    db.refresh(msg)
    return msg

@router.get("/messages", response_model=list[MessageResponse])
def list_all_messages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER])),
    customer_id: uuid.UUID | None = None,
    invoice_id: uuid.UUID | None = None,
    direction: MessageDirection | None = None,
    channel: MessageChannel | None = None,
    status: MessageStatus | None = None,
    limit: int = 100,
    offset: int = 0,
):
    stmt = select(CollectionMessage).where(CollectionMessage.organization_id == current_user.organization_id)
    if customer_id:
        stmt = stmt.where(CollectionMessage.customer_id == customer_id)
    if invoice_id:
        stmt = stmt.where(CollectionMessage.invoice_id == invoice_id)
    if direction:
        stmt = stmt.where(CollectionMessage.direction == direction)
    if channel:
        stmt = stmt.where(CollectionMessage.channel == channel)
    if status:
        stmt = stmt.where(CollectionMessage.status == status)

    messages = db.scalars(
        stmt.order_by(CollectionMessage.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return messages

@router.get("/invoices/{invoice_id}/messages", response_model=list[MessageResponse])
def list_messages(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    messages = db.scalars(
        select(CollectionMessage)
        .where(CollectionMessage.invoice_id == invoice_id, CollectionMessage.organization_id == current_user.organization_id)
        .order_by(CollectionMessage.created_at.desc())
    ).all()
    return messages

@router.get("/invoices/{invoice_id}/timeline", response_model=list[TimelineEvent])
def get_timeline(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    activities = db.scalars(
        select(CollectionActivity)
        .where(CollectionActivity.invoice_id == invoice_id, CollectionActivity.organization_id == current_user.organization_id)
        .order_by(CollectionActivity.created_at.desc())
    ).all()
    
    return [
        TimelineEvent(
            event_type=a.event_type,
            description=a.description,
            actor_user_id=a.actor_user_id,
            created_at=a.created_at
        ) for a in activities
    ]
