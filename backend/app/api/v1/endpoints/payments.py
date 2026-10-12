import uuid
from decimal import Decimal
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_reversal import PaymentReversal
from app.models.user import User
from app.schemas.payment import (
    PaymentAllocationCreate,
    PaymentCreate,
    PaymentResponse,
    PaymentReversalCreate,
)

router = APIRouter()

def get_payment_balances(db: Session, payment: Payment) -> tuple[Decimal, Decimal]:
    stmt = (
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
        .filter(PaymentAllocation.payment_id == payment.id)
    )
    allocated_amount = db.execute(stmt).scalar() or Decimal("0.00")
    unallocated_amount = payment.amount - allocated_amount
    return allocated_amount, unallocated_amount


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def record_payment(
    *,
    db: Session = Depends(get_db),
    payment_in: PaymentCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    # Verify customer exists in the same org
    stmt = select(Customer).filter(
        Customer.id == payment_in.customer_id,
        Customer.organization_id == current_user.organization_id
    )
    customer = db.execute(stmt).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found or cross-tenant access")
        
    payment = Payment(
        organization_id=current_user.organization_id,
        customer_id=payment_in.customer_id,
        amount=payment_in.amount,
        currency=payment_in.currency,
        payment_date=payment_in.payment_date,
        payment_method=payment_in.payment_method,
        reference=payment_in.reference,
        notes=payment_in.notes,
        recorded_by_user_id=current_user.id
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    # Manually map for response
    payment_dict = {
        "id": payment.id,
        "organization_id": payment.organization_id,
        "customer_id": payment.customer_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "payment_date": payment.payment_date,
        "payment_method": payment.payment_method,
        "reference": payment.reference,
        "notes": payment.notes,
        "created_at": payment.created_at,
        "allocated_amount": Decimal("0.00"),
        "unallocated_amount": payment.amount,
        "allocations": [],
        "reversal": None
    }
    return payment_dict

@router.get("", response_model=List[PaymentResponse])
def list_payments(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    customer_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Payment).filter(Payment.organization_id == current_user.organization_id)
    
    if customer_id:
        stmt = stmt.filter(Payment.customer_id == customer_id)
        
    stmt = stmt.order_by(Payment.created_at.desc()).offset(offset).limit(limit)
    payments = db.execute(stmt).scalars().all()
    
    results = []
    for payment in payments:
        allocated, unallocated = get_payment_balances(db, payment)
        pd = {
            "id": payment.id,
            "organization_id": payment.organization_id,
            "customer_id": payment.customer_id,
            "amount": payment.amount,
            "currency": payment.currency,
            "payment_date": payment.payment_date,
            "payment_method": payment.payment_method,
            "reference": payment.reference,
            "notes": payment.notes,
            "created_at": payment.created_at,
            "allocated_amount": allocated,
            "unallocated_amount": unallocated,
            "allocations": payment.allocations,
            "reversal": payment.reversal
        }
        results.append(pd)
    return results

@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Payment).filter(
        Payment.id == payment_id,
        Payment.organization_id == current_user.organization_id
    )
    payment = db.execute(stmt).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
        
    allocated, unallocated = get_payment_balances(db, payment)
    return {
        "id": payment.id,
        "organization_id": payment.organization_id,
        "customer_id": payment.customer_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "payment_date": payment.payment_date,
        "payment_method": payment.payment_method,
        "reference": payment.reference,
        "notes": payment.notes,
        "created_at": payment.created_at,
        "allocated_amount": allocated,
        "unallocated_amount": unallocated,
        "allocations": payment.allocations,
        "reversal": payment.reversal
    }

@router.post("/{payment_id}/allocations", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def allocate_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: uuid.UUID,
    allocation_in: PaymentAllocationCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    # PostgreSQL locking check
    try:
        # Lock payment
        stmt_payment = select(Payment).filter(
            Payment.id == payment_id,
            Payment.organization_id == current_user.organization_id
        ).with_for_update()
        payment = db.execute(stmt_payment).scalar_one_or_none()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
            
        if payment.reversal:
            raise HTTPException(status_code=400, detail="Cannot allocate a reversed payment")
            
        # Lock invoice
        stmt_invoice = select(Invoice).filter(
            Invoice.id == allocation_in.invoice_id,
            Invoice.organization_id == current_user.organization_id
        ).with_for_update()
        invoice = db.execute(stmt_invoice).scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        if payment.customer_id != invoice.customer_id:
            raise HTTPException(status_code=400, detail="Payment and Invoice must belong to the same customer")
            
        if payment.currency != invoice.currency:
            raise HTTPException(status_code=400, detail="Payment and Invoice currencies must match")
            
        if invoice.status != InvoiceStatus.ISSUED:
            raise HTTPException(status_code=400, detail="Cannot allocate to a draft or void invoice")

        allocated, unallocated = get_payment_balances(db, payment)
        if allocation_in.amount > unallocated:
            raise HTTPException(status_code=400, detail=f"Allocation amount {allocation_in.amount} exceeds unallocated amount {unallocated}")
            
        from app.services.receivables import get_invoice_balance
        invoice_balance = get_invoice_balance(db, invoice)
        if allocation_in.amount > invoice_balance.outstanding_amount:
            raise HTTPException(status_code=400, detail=f"Allocation amount {allocation_in.amount} exceeds invoice outstanding balance {invoice_balance.outstanding_amount}")
            
        allocation = PaymentAllocation(
            organization_id=current_user.organization_id,
            customer_id=payment.customer_id,
            payment_id=payment.id,
            invoice_id=invoice.id,
            amount=allocation_in.amount,
            created_by_user_id=current_user.id
        )
        db.add(allocation)
        db.commit()
        db.refresh(payment)
        
        new_allocated, new_unallocated = get_payment_balances(db, payment)
        return {
            "id": payment.id,
            "organization_id": payment.organization_id,
            "customer_id": payment.customer_id,
            "amount": payment.amount,
            "currency": payment.currency,
            "payment_date": payment.payment_date,
            "payment_method": payment.payment_method,
            "reference": payment.reference,
            "notes": payment.notes,
            "created_at": payment.created_at,
            "allocated_amount": new_allocated,
            "unallocated_amount": new_unallocated,
            "allocations": payment.allocations,
            "reversal": payment.reversal
        }

    except Exception:
        db.rollback()
        raise


@router.post("/{payment_id}/reverse", response_model=PaymentResponse)
def reverse_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: uuid.UUID,
    reversal_in: PaymentReversalCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    try:
        stmt = select(Payment).filter(
            Payment.id == payment_id,
            Payment.organization_id == current_user.organization_id
        ).with_for_update()
        payment = db.execute(stmt).scalar_one_or_none()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
            
        if payment.reversal:
            raise HTTPException(status_code=409, detail="Payment is already reversed")
            
        reversal = PaymentReversal(
            organization_id=current_user.organization_id,
            payment_id=payment.id,
            reason=reversal_in.reason,
            reversed_by_user_id=current_user.id
        )
        db.add(reversal)
        
        # Reassess any fulfilled promises for invoices affected by this payment
        from datetime import datetime, UTC
        from app.models.collection_workflow import (
            PaymentPromise, PromiseStatus, CollectionActivity, EventType
        )
        affected_invoice_ids = [alloc.invoice_id for alloc in payment.allocations]
        if affected_invoice_ids:
            fulfilled_promises = db.scalars(
                select(PaymentPromise)
                .where(
                    PaymentPromise.invoice_id.in_(affected_invoice_ids),
                    PaymentPromise.status == PromiseStatus.FULFILLED
                )
                .with_for_update()
            ).all()

            today = datetime.now(UTC).date()
            for promise in fulfilled_promises:
                # Recalculate remaining non-reversed allocations
                remaining_allocs = db.scalars(
                    select(PaymentAllocation)
                    .join(Payment, PaymentAllocation.payment_id == Payment.id)
                    .outerjoin(PaymentReversal, Payment.id == PaymentReversal.payment_id)
                    .where(
                        PaymentAllocation.invoice_id == promise.invoice_id,
                        PaymentAllocation.organization_id == promise.organization_id,
                        PaymentAllocation.customer_id == promise.customer_id,
                        Payment.currency == promise.currency,
                        PaymentAllocation.created_at >= promise.created_at,
                        Payment.payment_date <= promise.expected_payment_date,
                        Payment.id != payment.id,  # Exclude the payment being reversed right now
                        PaymentReversal.id.is_(None)
                    )
                ).all()

                remaining_total = sum((alloc.amount for alloc in remaining_allocs), Decimal("0.00"))
                if remaining_total < promise.promised_amount:
                    if today > promise.expected_payment_date:
                        promise.status = PromiseStatus.MISSED
                        event_type = EventType.PROMISE_MISSED
                        desc = f"Promise reverted to MISSED after payment reversal ({payment.id}): qualifying payments {remaining_total} < {promise.promised_amount}"
                    else:
                        promise.status = PromiseStatus.ACTIVE
                        promise.resolved_at = None
                        event_type = EventType.COLLECTION_RESUMED
                        desc = f"Promise reverted to ACTIVE after payment reversal ({payment.id}): qualifying payments {remaining_total} < {promise.promised_amount}"

                    activity = CollectionActivity(
                        organization_id=promise.organization_id,
                        invoice_id=promise.invoice_id,
                        customer_id=promise.customer_id,
                        actor_user_id=current_user.id,
                        event_type=event_type,
                        description=desc,
                        created_at=datetime.now(UTC)
                    )
                    db.add(activity)

        db.commit()
        db.refresh(payment)
        
        allocated, unallocated = get_payment_balances(db, payment)
        return {
            "id": payment.id,
            "organization_id": payment.organization_id,
            "customer_id": payment.customer_id,
            "amount": payment.amount,
            "currency": payment.currency,
            "payment_date": payment.payment_date,
            "payment_method": payment.payment_method,
            "reference": payment.reference,
            "notes": payment.notes,
            "created_at": payment.created_at,
            "allocated_amount": allocated,
            "unallocated_amount": unallocated,
            "allocations": payment.allocations,
            "reversal": payment.reversal
        }
    except Exception:
        db.rollback()
        raise
