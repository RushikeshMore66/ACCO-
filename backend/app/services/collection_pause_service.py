from datetime import datetime

from pydantic import BaseModel

from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import (
    CollectionDispute,
    DisputeStatus,
    PaymentPromise,
    PromiseStatus,
)


class PauseResult(BaseModel):
    is_paused: bool
    pause_reasons: list[str]
    active_dispute_count: int
    active_promise_count: int
    requires_follow_up: bool


def evaluate_pause_conditions(
    policy: CollectionPolicy | None,
    disputes: list[CollectionDispute],
    promises: list[PaymentPromise],
    as_of_date: datetime,
) -> PauseResult:
    is_paused = False
    reasons = []
    active_dispute_count = 0
    active_promise_count = 0
    requires_follow_up = False

    as_of_date_only = as_of_date.date()

    pause_on_dispute = policy.pause_collection_on_dispute if policy is not None else True
    pause_on_promise = policy.pause_collection_on_payment_promise if policy is not None else True

    if pause_on_dispute:
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
        elif p.status == PromiseStatus.MISSED:
            requires_follow_up = True

    if pause_on_promise and active_promise_count > 0:
        is_paused = True
        reasons.append("PAYMENT_PROMISE")

    return PauseResult(
        is_paused=is_paused,
        pause_reasons=reasons,
        active_dispute_count=active_dispute_count,
        active_promise_count=active_promise_count,
        requires_follow_up=requires_follow_up,
    )
