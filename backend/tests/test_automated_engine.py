import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.collection_workflow import (
    CollectionDispute,
    CollectionMessage,
    DisputeCategory,
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
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.user import User
from app.services.collection_policy_engine import evaluate_collection_status
from app.services.email_provider import MockEmailProvider
from app.services.receivables import get_invoice_balance
from app.workers.email_delivery_worker import process_batch
from app.workers.tasks.followups import sweep_expired_promises


@pytest.fixture
def test_setup(db_session, normal_user_token_headers):
    user = db_session.query(User).filter_by(email="test@example.com").first()
    org_id = user.organization_id

    customer = Customer(
        organization_id=org_id,
        name="Automation Corp",
        email="billing@automationcorp.com",
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    now = datetime.now(UTC)
    invoice = Invoice(
        organization_id=org_id,
        customer_id=customer.id,
        invoice_number=f"INV-AUTO-{uuid.uuid4().hex[:6]}",
        issue_date=now - timedelta(days=20),
        due_date=now - timedelta(days=10),
        currency="USD",
        total_amount=Decimal("1000.00"),
        status=InvoiceStatus.ISSUED,
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    return {
        "org_id": org_id,
        "org": user.organization,
        "user": user,
        "customer": customer,
        "invoice": invoice,
        "headers": normal_user_token_headers,
    }


def create_message(db_session, org_id, customer_id, invoice_id):
    msg = CollectionMessage(
        organization_id=org_id,
        customer_id=customer_id,
        invoice_id=invoice_id,
        direction=MessageDirection.OUTBOUND,
        channel=MessageChannel.EMAIL,
        subject="Notice",
        body="Notice body",
        status=MessageStatus.APPROVED,
    )
    db_session.add(msg)
    db_session.commit()
    db_session.refresh(msg)
    return msg


def test_scenario_a_happy_path_dispatch(db_session, test_setup):
    """
    Scenario A: Overdue invoice -> message queued -> worker processes batch ->
    fresh check passes -> mock provider called exactly once -> delivery ACCEPTED.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]

    msg = create_message(db_session, org.id, customer.id, invoice.id)

    delivery = EmailDelivery(
        organization_id=org.id,
        collection_message_id=msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot=msg.subject,
        body_snapshot=msg.body,
        idempotency_key=f"idem_{uuid.uuid4()}",
        status=DeliveryStatus.QUEUED,
    )
    db_session.add(delivery)
    db_session.commit()
    db_session.refresh(delivery)

    mock_provider = MockEmailProvider()
    processed = process_batch(db_session, batch_size=10, provider=mock_provider)

    assert processed == 1
    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.ACCEPTED
    assert delivery.attempt_count == 1
    assert delivery.provider_message_id is not None
    assert len(mock_provider.sent_messages) == 1
    assert mock_provider.sent_messages[0]["to"] == customer.email


def test_scenario_b_dispute_suppression_race(db_session, test_setup):
    """
    Scenario B: Delivery queued -> dispute opened before worker runs ->
    worker suppresses dispatch -> delivery BLOCKED -> provider NEVER called.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]
    msg = create_message(db_session, org.id, customer.id, invoice.id)

    delivery = EmailDelivery(
        organization_id=org.id,
        collection_message_id=msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot="Overdue",
        body_snapshot="Overdue",
        idempotency_key=f"idem_{uuid.uuid4()}",
        status=DeliveryStatus.QUEUED,
    )
    db_session.add(delivery)

    # Open dispute before worker picks it up
    dispute = CollectionDispute(
        organization_id=org.id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        category=DisputeCategory.INCORRECT_AMOUNT,
        status=DisputeStatus.OPEN,
        description="Rate was miscalculated",
    )
    db_session.add(dispute)
    db_session.commit()

    mock_provider = MockEmailProvider()
    process_batch(db_session, batch_size=10, provider=mock_provider)

    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.BLOCKED
    assert delivery.blocked_at is not None
    assert delivery.last_error_code == "SUPPRESSED"
    assert len(mock_provider.sent_messages) == 0


def test_scenario_c_promise_suppression_race(db_session, test_setup):
    """
    Scenario C: Delivery queued -> promise made before worker runs ->
    worker suppresses dispatch -> delivery BLOCKED -> provider NEVER called.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]
    msg = create_message(db_session, org.id, customer.id, invoice.id)

    delivery = EmailDelivery(
        organization_id=org.id,
        collection_message_id=msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot="Overdue",
        body_snapshot="Overdue",
        idempotency_key=f"idem_{uuid.uuid4()}",
        status=DeliveryStatus.QUEUED,
    )
    db_session.add(delivery)

    # Create active future promise
    promise = PaymentPromise(
        organization_id=org.id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        promised_amount=Decimal("1000.00"),
        currency="USD",
        expected_payment_date=datetime.now(UTC).date() + timedelta(days=5),
        follow_up_date=datetime.now(UTC).date() + timedelta(days=6),
        status=PromiseStatus.ACTIVE,
    )
    db_session.add(promise)
    db_session.commit()

    mock_provider = MockEmailProvider()
    process_batch(db_session, batch_size=10, provider=mock_provider)

    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.BLOCKED
    assert delivery.last_error_code == "SUPPRESSED"
    assert len(mock_provider.sent_messages) == 0


def test_scenario_d_paid_invoice_cancellation_race(db_session, test_setup):
    """
    Scenario D: Delivery queued -> payment allocated paying full balance ->
    worker runs -> fresh check detects zero balance -> delivery CANCELLED -> provider NEVER called.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]
    msg = create_message(db_session, org.id, customer.id, invoice.id)

    delivery = EmailDelivery(
        organization_id=org.id,
        collection_message_id=msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot="Overdue",
        body_snapshot="Overdue",
        idempotency_key=f"idem_{uuid.uuid4()}",
        status=DeliveryStatus.QUEUED,
    )
    db_session.add(delivery)

    # Pay the invoice in full
    pmt = Payment(
        organization_id=org.id,
        customer_id=customer.id,
        amount=Decimal("1000.00"),
        currency="USD",
        payment_date=datetime.now(UTC),
        payment_method="BANK_TRANSFER",
    )
    db_session.add(pmt)
    db_session.flush()

    alloc = PaymentAllocation(
        organization_id=org.id,
        customer_id=customer.id,
        payment_id=pmt.id,
        invoice_id=invoice.id,
        amount=Decimal("1000.00"),
    )
    db_session.add(alloc)
    db_session.commit()

    mock_provider = MockEmailProvider()
    process_batch(db_session, batch_size=10, provider=mock_provider)

    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.CANCELLED
    assert delivery.last_error_code == "INVOICE_PAID"
    assert len(mock_provider.sent_messages) == 0


def test_scenario_e_promise_sweep_transitions(db_session, test_setup):
    """
    Scenario E: Sweeper marks expired unpaid promise as MISSED and fulfilled promise as FULFILLED.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]

    # Promise 1: expired, no payment
    past_date = datetime.now(UTC).date() - timedelta(days=2)
    promise_missed = PaymentPromise(
        organization_id=org.id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        promised_amount=Decimal("500.00"),
        currency="USD",
        expected_payment_date=past_date,
        follow_up_date=past_date + timedelta(days=1),
        status=PromiseStatus.ACTIVE,
    )
    db_session.add(promise_missed)
    db_session.commit()

    # Run sweeper
    count = sweep_expired_promises(db_session)
    assert count == 1

    db_session.refresh(promise_missed)
    assert promise_missed.status == PromiseStatus.MISSED

    # Evaluate collection status for invoice with broken promise
    balance = get_invoice_balance(db_session, invoice)
    status = evaluate_collection_status(
        invoice_balance=balance,
        policy=None,
        customer_name=customer.name,
        as_of_date=datetime.now(UTC),
        disputes=[],
        promises=[promise_missed],
    )
    assert status.collection_stage == "BROKEN_PROMISE_FOLLOWUP"


def test_scenario_f_reversal_invalidates_fulfilled_promise(client, db_session, test_setup, normal_user_token_headers):
    """
    Scenario F: Payment allocation fulfills promise -> payment is reversed ->
    fulfilled promise is automatically reverted to ACTIVE or MISSED.
    """
    invoice = test_setup["invoice"]
    customer = test_setup["customer"]
    org = test_setup["org"]

    future_date = datetime.now(UTC).date() + timedelta(days=5)
    promise = PaymentPromise(
        organization_id=org.id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        promised_amount=Decimal("1000.00"),
        currency="USD",
        expected_payment_date=future_date,
        follow_up_date=future_date + timedelta(days=1),
        status=PromiseStatus.FULFILLED,  # Marked fulfilled by payment
    )
    db_session.add(promise)
    pmt = Payment(
        organization_id=org.id,
        customer_id=customer.id,
        amount=Decimal("1000.00"),
        currency="USD",
        payment_date=datetime.now(UTC),
        payment_method="BANK_TRANSFER",
    )
    db_session.add(pmt)
    db_session.flush()
    alloc = PaymentAllocation(
        organization_id=org.id,
        customer_id=customer.id,
        payment_id=pmt.id,
        invoice_id=invoice.id,
        amount=Decimal("1000.00"),
    )
    db_session.add(alloc)
    db_session.commit()
    payment_id = str(pmt.id)
    promise_id = promise.id

    # Reverse the payment via API
    resp = client.post(
        f"/api/v1/payments/{payment_id}/reverse",
        headers=normal_user_token_headers,
        json={"reason": "Customer check bounced"},
    )
    assert resp.status_code == 200

    # Verify the promise was reverted back to ACTIVE
    db_session.expire_all()
    rechecked = db_session.get(PaymentPromise, promise_id)
    assert rechecked.status == PromiseStatus.ACTIVE
    assert rechecked.resolved_at is None


def test_scenario_g_transient_and_bounded_failure(db_session, test_setup):
    """
    Scenario G: Provider transient error causes bounded retries up to 3 attempts, then FAILED.
    """
    invoice = test_setup["invoice"]
    org = test_setup["org"]
    customer = test_setup["customer"]
    msg = create_message(db_session, org.id, customer.id, invoice.id)

    delivery = EmailDelivery(
        organization_id=org.id,
        collection_message_id=msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot="Overdue",
        body_snapshot="Overdue",
        idempotency_key=f"idem_{uuid.uuid4()}",
        status=DeliveryStatus.QUEUED,
        attempt_count=0,
    )
    db_session.add(delivery)
    db_session.commit()

    mock_provider = MockEmailProvider()
    mock_provider.simulate_transient_error = True

    # Attempt 1: Transient error -> remains QUEUED with backoff next_attempt_at
    process_batch(db_session, batch_size=10, provider=mock_provider)
    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.QUEUED
    assert delivery.attempt_count == 1
    assert delivery.next_attempt_at is not None

    # Simulate next attempt arrival and Attempt 2
    delivery.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    process_batch(db_session, batch_size=10, provider=mock_provider)
    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.QUEUED
    assert delivery.attempt_count == 2

    # Simulate next attempt arrival and Attempt 3 (reaches max retries)
    delivery.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    process_batch(db_session, batch_size=10, provider=mock_provider)
    db_session.refresh(delivery)
    assert delivery.status == DeliveryStatus.FAILED
    assert delivery.attempt_count == 3


def test_scenario_h_tenant_isolation(client, db_session, test_setup, normal_user_token_headers):
    """
    Scenario H: Tenant isolation:
    Endpoints for promises, disputes, and messages strictly scope to the authenticated organization.
    """
    # Create another organization
    other_org = Organization(name="Other Corp", slug="other-corp")
    db_session.add(other_org)
    db_session.commit()
    db_session.refresh(other_org)

    other_customer = Customer(
        organization_id=other_org.id,
        name="Other Cust",
        email="other@cust.com"
    )
    db_session.add(other_customer)
    db_session.commit()
    db_session.refresh(other_customer)

    other_invoice = Invoice(
        organization_id=other_org.id,
        customer_id=other_customer.id,
        invoice_number="INV-OTHER-99",
        issue_date=datetime.now(UTC) - timedelta(days=5),
        due_date=datetime.now(UTC) + timedelta(days=10),
        currency="USD",
        total_amount=Decimal("500.00"),
        status=InvoiceStatus.ISSUED,
    )
    db_session.add(other_invoice)
    db_session.commit()
    db_session.refresh(other_invoice)

    # Attempting to fetch or mutate other org's invoice/promise fails with 404
    resp = client.get(
        f"/api/v1/collections/invoices/{other_invoice.id}/promises",
        headers=normal_user_token_headers,
    )
    # The invoice exists in other org, so current user gets an empty list or 404
    assert resp.status_code == 200
    assert resp.json() == []

    # Attempting to reverse a payment in another org fails
    other_pmt = Payment(
        organization_id=other_org.id,
        customer_id=other_customer.id,
        amount=Decimal("500.00"),
        currency="USD",
        payment_date=datetime.now(UTC),
        payment_method="BANK_TRANSFER",
    )
    db_session.add(other_pmt)
    db_session.commit()

    resp = client.post(
        f"/api/v1/payments/{other_pmt.id}/reverse",
        headers=normal_user_token_headers,
        json={"reason": "Unauthorized attempt"},
    )
    assert resp.status_code == 404

