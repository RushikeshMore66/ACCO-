from datetime import datetime, UTC

from app.models.collection_policy import CollectionPolicy
from app.schemas.collections import ReceivableItemResponse
from app.schemas.receivables import InvoiceBalanceResponse
from app.services.receivables import calculate_days_overdue

def get_effective_policy(policy: CollectionPolicy | None) -> dict:
    if policy:
        return {
            "initial_reminder_after_days": policy.initial_reminder_after_days,
            "follow_up_after_days": policy.follow_up_after_days,
            "escalation_after_days": policy.escalation_after_days,
            "require_approval_before_send": policy.require_approval_before_send,
            "pause_collection_on_dispute": policy.pause_collection_on_dispute,
            "pause_collection_on_payment_promise": policy.pause_collection_on_payment_promise
        }
    return {
        "initial_reminder_after_days": 1,
        "follow_up_after_days": 8,
        "escalation_after_days": 31,
        "require_approval_before_send": True,
        "pause_collection_on_dispute": True,
        "pause_collection_on_payment_promise": True
    }


def evaluate_collection_status(
    invoice_balance: InvoiceBalanceResponse,
    policy: CollectionPolicy | None,
    customer_name: str,
    as_of_date: datetime | None = None
) -> ReceivableItemResponse | None:
    """
    Evaluates an invoice balance and returns its collection stage and recommended action.
    Returns None if the invoice is not eligible for active collection (e.g. fully paid, not issued).
    """
    if as_of_date is None:
        as_of_date = datetime.now(UTC)
        
    if invoice_balance.payment_status == "PAID":
        return None
        
    if invoice_balance.outstanding_amount <= 0:
        return None

    days_overdue = calculate_days_overdue(invoice_balance.due_date, as_of_date)
    eff_policy = get_effective_policy(policy)
    
    stage = ""
    action = ""
    reason = ""
    
    if days_overdue == 0:
        stage = "NOT_DUE"
        action = "WAIT_UNTIL_DUE"
        reason = "Invoice is not yet overdue."
    elif days_overdue < eff_policy["initial_reminder_after_days"]:
        stage = "WAITING_FOR_INITIAL_REMINDER"
        action = "WAIT_FOR_INITIAL_REMINDER"
        reason = f"Invoice is {days_overdue} days overdue, waiting for {eff_policy['initial_reminder_after_days']} days threshold."
    elif days_overdue < eff_policy["follow_up_after_days"]:
        stage = "EARLY_OVERDUE"
        action = "INITIAL_REMINDER_RECOMMENDED"
        reason = f"Invoice is {days_overdue} days overdue, reached initial reminder threshold."
    elif days_overdue < eff_policy["escalation_after_days"]:
        stage = "FOLLOW_UP"
        action = "FOLLOW_UP_RECOMMENDED"
        reason = f"Invoice is {days_overdue} days overdue, reached follow-up threshold."
    else:
        stage = "ESCALATION_REVIEW"
        action = "HUMAN_ESCALATION_REVIEW"
        reason = f"Invoice is {days_overdue} days overdue, reached escalation threshold."

    return ReceivableItemResponse(
        invoice_id=invoice_balance.invoice_id,
        invoice_number=invoice_balance.invoice_number,
        customer_id=invoice_balance.customer_id,
        customer_name=customer_name,
        currency=invoice_balance.currency,
        total_amount=invoice_balance.total_amount,
        paid_amount=invoice_balance.paid_amount,
        outstanding_amount=invoice_balance.outstanding_amount,
        due_date=invoice_balance.due_date,
        days_overdue=days_overdue,
        collection_stage=stage,
        recommended_action=action,
        recommendation_reason=reason
    )
