from datetime import datetime, date
from typing import List, Optional, Dict
from pydantic import BaseModel
from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import CollectionDispute, PaymentPromise, DisputeStatus, PromiseStatus

class PauseResult(BaseModel):
    is_paused: bool
    pause_reasons: List[str]
    active_dispute_count: int
    active_promise_count: int
    requires_follow_up: bool

def evaluate_pause_conditions(
    policy: Optional[CollectionPolicy],
    disputes: List[CollectionDispute],
    promises: List[PaymentPromise],
    as_of_date: datetime
) -> PauseResult:
    is_paused = False
    reasons = []
    active_dispute_count = 0
    active_promise_count = 0
    requires_follow_up = False

    as_of_date_only = as_of_date.date()

    if policy and policy.pause_collection_on_dispute:
        for d in disputes:
            if d.status in (DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW):
                active_dispute_count += 1
        if active_dispute_count > 0:
            is_paused = True
            reasons.append("DISPUTE")

    for p in promises:
        if p.status == PromiseStatus.ACTIVE:
            if p.expected_payment_date >= as_of_date_only:
                active_promise_count += 1
            else:
                requires_follow_up = True
                
    if policy and policy.pause_collection_on_payment_promise and active_promise_count > 0:
        is_paused = True
        reasons.append("PAYMENT_PROMISE")

    return PauseResult(
        is_paused=is_paused,
        pause_reasons=reasons,
        active_dispute_count=active_dispute_count,
        active_promise_count=active_promise_count,
        requires_follow_up=requires_follow_up
    )
