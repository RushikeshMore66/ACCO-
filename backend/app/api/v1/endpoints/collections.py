from datetime import datetime, UTC
from typing import Any, List
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.user import User, UserRole
from app.models.collection_policy import CollectionPolicy
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.schemas.collection_policy import CollectionPolicyResponse, CollectionPolicyUpdate
from app.schemas.collections import ReceivableItemResponse, CurrencyCollectionSummary, CollectionStageSummary
from app.services.receivables import get_invoice_balance
from app.services.collection_policy_engine import evaluate_collection_status, get_effective_policy

router = APIRouter()

@router.get("/policy", response_model=CollectionPolicyResponse)
def get_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    policy = db.scalar(
        select(CollectionPolicy)
        .where(CollectionPolicy.organization_id == current_user.organization_id)
    )
    if policy:
        return policy
    
    # Return default policy
    return get_effective_policy(None)

@router.put("/policy", response_model=CollectionPolicyResponse)
def update_policy(
    *,
    db: Session = Depends(get_db),
    policy_in: CollectionPolicyUpdate,
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER])),
) -> Any:
    policy = db.scalar(
        select(CollectionPolicy)
        .where(CollectionPolicy.organization_id == current_user.organization_id)
        .with_for_update()
    )
    
    if policy:
        policy.initial_reminder_after_days = policy_in.initial_reminder_after_days
        policy.follow_up_after_days = policy_in.follow_up_after_days
        policy.escalation_after_days = policy_in.escalation_after_days
        policy.require_approval_before_send = policy_in.require_approval_before_send
        policy.pause_collection_on_dispute = policy_in.pause_collection_on_dispute
        policy.pause_collection_on_payment_promise = policy_in.pause_collection_on_payment_promise
    else:
        policy = CollectionPolicy(
            organization_id=current_user.organization_id,
            initial_reminder_after_days=policy_in.initial_reminder_after_days,
            follow_up_after_days=policy_in.follow_up_after_days,
            escalation_after_days=policy_in.escalation_after_days,
            require_approval_before_send=policy_in.require_approval_before_send,
            pause_collection_on_dispute=policy_in.pause_collection_on_dispute,
            pause_collection_on_payment_promise=policy_in.pause_collection_on_payment_promise
        )
        db.add(policy)
        
    db.commit()
    db.refresh(policy)
    return policy

from app.models.collection_workflow import CollectionDispute, PaymentPromise, DisputeStatus, PromiseStatus

@router.get("/queue", response_model=List[ReceivableItemResponse])
def get_collection_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    customer_id: uuid.UUID | None = None,
    currency: str | None = None,
    stage: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> Any:
    policy = db.scalar(
        select(CollectionPolicy)
        .where(CollectionPolicy.organization_id == current_user.organization_id)
    )
    
    stmt = select(Invoice, Customer.name.label('customer_name')).join(Customer).where(
        Invoice.organization_id == current_user.organization_id,
        Invoice.status == InvoiceStatus.ISSUED
    )
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if currency:
        stmt = stmt.where(Invoice.currency == currency)
        
    invoices = db.execute(stmt).all()

    # Pre-fetch active disputes and promises for this tenant to avoid N+1 queries
    all_disputes = db.scalars(
        select(CollectionDispute)
        .where(
            CollectionDispute.organization_id == current_user.organization_id,
            CollectionDispute.status.in_([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW])
        )
    ).all()
    disputes_by_inv: dict[uuid.UUID, list[CollectionDispute]] = {}
    for d in all_disputes:
        disputes_by_inv.setdefault(d.invoice_id, []).append(d)

    all_promises = db.scalars(
        select(PaymentPromise)
        .where(
            PaymentPromise.organization_id == current_user.organization_id,
            PaymentPromise.status == PromiseStatus.ACTIVE
        )
    ).all()
    promises_by_inv: dict[uuid.UUID, list[PaymentPromise]] = {}
    for p in all_promises:
        promises_by_inv.setdefault(p.invoice_id, []).append(p)
    
    as_of_date = datetime.now(UTC)
    queue = []
    
    for inv, customer_name in invoices:
        balance = get_invoice_balance(db, inv)
        inv_disputes = disputes_by_inv.get(inv.id, [])
        inv_promises = promises_by_inv.get(inv.id, [])
        evaluation = evaluate_collection_status(
            balance, 
            policy, 
            customer_name, 
            as_of_date,
            disputes=inv_disputes,
            promises=inv_promises
        )
        
        if evaluation:
            if stage and evaluation.collection_stage != stage:
                continue
            queue.append(evaluation)
            
    stage_priority = {
        "BROKEN_PROMISE_FOLLOWUP": 0,
        "ESCALATION_REVIEW": 1,
        "FOLLOW_UP": 2,
        "EARLY_OVERDUE": 3,
        "WAITING_FOR_INITIAL_REMINDER": 4,
        "NOT_DUE": 5,
        "PAUSED_DISPUTE": 6,
        "PAUSED_PROMISE": 7,
        "PAUSED": 8
    }
    
    queue.sort(key=lambda x: (
        stage_priority.get(x.collection_stage, 99),
        -x.days_overdue,
        str(x.invoice_id)
    ))
    
    return queue[offset : offset + limit]


@router.get("/summary", response_model=List[CurrencyCollectionSummary])
def get_collection_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    policy = db.scalar(
        select(CollectionPolicy)
        .where(CollectionPolicy.organization_id == current_user.organization_id)
    )
    
    stmt = select(Invoice, Customer.name.label('customer_name')).join(Customer).where(
        Invoice.organization_id == current_user.organization_id,
        Invoice.status == InvoiceStatus.ISSUED
    )
    
    invoices = db.execute(stmt).all()

    # Pre-fetch active disputes and promises
    all_disputes = db.scalars(
        select(CollectionDispute)
        .where(
            CollectionDispute.organization_id == current_user.organization_id,
            CollectionDispute.status.in_([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW])
        )
    ).all()
    disputes_by_inv: dict[uuid.UUID, list[CollectionDispute]] = {}
    for d in all_disputes:
        disputes_by_inv.setdefault(d.invoice_id, []).append(d)

    all_promises = db.scalars(
        select(PaymentPromise)
        .where(
            PaymentPromise.organization_id == current_user.organization_id,
            PaymentPromise.status == PromiseStatus.ACTIVE
        )
    ).all()
    promises_by_inv: dict[uuid.UUID, list[PaymentPromise]] = {}
    for p in all_promises:
        promises_by_inv.setdefault(p.invoice_id, []).append(p)

    as_of_date = datetime.now(UTC)
    
    summaries_by_currency = {}
    
    for inv, customer_name in invoices:
        balance = get_invoice_balance(db, inv)
        inv_disputes = disputes_by_inv.get(inv.id, [])
        inv_promises = promises_by_inv.get(inv.id, [])
        evaluation = evaluate_collection_status(
            balance, 
            policy, 
            customer_name, 
            as_of_date,
            disputes=inv_disputes,
            promises=inv_promises
        )
        
        if evaluation:
            c = evaluation.currency
            if c not in summaries_by_currency:
                summaries_by_currency[c] = {
                    "eligible_invoices_count": 0,
                    "total_outstanding_amount": 0,
                    "overdue_invoices_count": 0,
                    "total_overdue_amount": 0,
                    "stages": {}
                }
                
            summaries_by_currency[c]["eligible_invoices_count"] += 1
            summaries_by_currency[c]["total_outstanding_amount"] += evaluation.outstanding_amount
            
            if evaluation.days_overdue > 0:
                summaries_by_currency[c]["overdue_invoices_count"] += 1
                summaries_by_currency[c]["total_overdue_amount"] += evaluation.outstanding_amount
                
            st = evaluation.collection_stage
            if st not in summaries_by_currency[c]["stages"]:
                summaries_by_currency[c]["stages"][st] = {"count": 0, "amount": 0}
            summaries_by_currency[c]["stages"][st]["count"] += 1
            summaries_by_currency[c]["stages"][st]["amount"] += evaluation.outstanding_amount

    result = []
    for c, data in summaries_by_currency.items():
        stages_list = [
            CollectionStageSummary(stage=st, invoices_count=st_data["count"], outstanding_amount=st_data["amount"])
            for st, st_data in data["stages"].items()
        ]
        result.append(CurrencyCollectionSummary(
            currency=c,
            eligible_invoices_count=data["eligible_invoices_count"],
            total_outstanding_amount=data["total_outstanding_amount"],
            overdue_invoices_count=data["overdue_invoices_count"],
            total_overdue_amount=data["total_overdue_amount"],
            stages=stages_list
        ))
        
    return result
