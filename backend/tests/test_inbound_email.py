"""
Comprehensive tests for automated inbound email reply ingestion and AI analysis.
Verifies signature validation, replay window enforcement, deduplication, safe entity matching,
advisory AI analysis invocation, failure recovery, tenant isolation, and financial safeguards.
"""

import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select

from app.adapters.ai.openai_provider import AIProviderError
from app.api.v1.endpoints import reply_analyses
from app.core.config import settings
from app.models.collection_workflow import (
    CollectionActivity,
    CollectionMessage,
    EventType,
    MessageChannel,
    MessageDirection,
    MessageStatus,
)
from app.models.customer import Customer
from app.models.email_delivery import DeliveryStatus, EmailDelivery, EmailWebhookEvent
from app.models.invoice import Invoice, InvoiceStatus
from app.models.organization import Organization
from app.models.reply_analysis import AnalysisStatus, CustomerReplyAnalysis, ReplyClassification
from app.models.user import User
from app.schemas.reply_analysis import LLMExtractionResult
from app.services.email_provider import (
    MockReceivingProvider,
    set_receiving_provider,
)

TEST_SIGNING_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"


class MockAnalysisProvider:
    model = "test-gpt-model"
    prompt_version = "reply-v1"

    def __init__(self, result=None, error=None):
        self.calls = 0
        self.error = error
        self.result = result or LLMExtractionResult(
            primary_classification=ReplyClassification.PAYMENT_PROMISE,
            secondary_classifications=[],
            evidence_summary="Customer promised to pay $500 next Tuesday.",
            customer_intent="Customer will send check next week.",
            explicit_payment_amount=Decimal("500.00"),
            currency="USD",
            proposed_payment_date="2026-10-20",
            claims_already_paid=False,
            dispute_category=None,
            requests_information=False,
            missing_information=None,
            recommended_next_action="Awaiting payment confirmation.",
            requires_human_review=True,
            confidence_score=0.92,
        )

    def extract_intelligence(self, message_body: str) -> LLMExtractionResult:
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def make_svix_headers(
    body_bytes: bytes,
    secret: str = TEST_SIGNING_SECRET,
    event_id: str | None = None,
    timestamp: int | None = None,
) -> dict[str, str]:
    """Helper to generate valid Svix signature headers."""
    if event_id is None:
        event_id = f"evt_{uuid.uuid4().hex}"
    if timestamp is None:
        timestamp = int(time.time())

    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode("utf-8")
    to_sign = f"{event_id}.{timestamp}.".encode() + body_bytes
    digest = hmac.new(key, to_sign, hashlib.sha256).digest()
    sig_b64 = base64.b64encode(digest).decode("utf-8")

    return {
        "svix-id": event_id,
        "svix-timestamp": str(timestamp),
        "svix-signature": f"v1,{sig_b64}",
        "content-type": "application/json",
    }


@pytest.fixture
def inbound_setup(db_session, normal_user_token_headers):
    """Seed test database with an organization, user, customer, invoice, and outbound email delivery."""
    user = db_session.query(User).filter_by(email="test@example.com").first()
    org_id = user.organization_id

    customer = Customer(
        organization_id=org_id,
        name="Acme Corp",
        email="billing@acmecorp.com",
    )
    db_session.add(customer)
    db_session.commit()

    now = datetime.now(UTC)
    invoice = Invoice(
        organization_id=org_id,
        customer_id=customer.id,
        invoice_number="INV-2026-001",
        issue_date=now - timedelta(days=15),
        due_date=now - timedelta(days=1),
        currency="USD",
        total_amount=Decimal("1500.00"),
        status=InvoiceStatus.ISSUED,
    )
    db_session.add(invoice)
    db_session.commit()

    # Outbound collection message
    outbound_msg = CollectionMessage(
        organization_id=org_id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        direction=MessageDirection.OUTBOUND,
        channel=MessageChannel.EMAIL,
        subject="Payment Reminder: Invoice INV-2026-001",
        body="Dear Acme, your invoice INV-2026-001 is past due.",
        status=MessageStatus.APPROVED,
        created_by_user_id=user.id,
    )
    db_session.add(outbound_msg)
    db_session.commit()

    provider_msg_id = f"resend_out_{uuid.uuid4().hex[:10]}"
    delivery = EmailDelivery(
        organization_id=org_id,
        collection_message_id=outbound_msg.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        recipient_email=customer.email,
        subject_snapshot=outbound_msg.subject,
        body_snapshot=outbound_msg.body,
        idempotency_key=f"idem_{uuid.uuid4()}",
        provider="resend",
        provider_message_id=provider_msg_id,
        status=DeliveryStatus.DELIVERED,
    )
    db_session.add(delivery)
    db_session.commit()

    return {
        "user": user,
        "org_id": org_id,
        "customer": customer,
        "invoice": invoice,
        "outbound_msg": outbound_msg,
        "delivery": delivery,
        "provider_msg_id": provider_msg_id,
    }


def test_1_valid_signed_inbound_message_accepted(client: TestClient, db_session, inbound_setup):
    """Scenario 1: Valid signed inbound reply via In-Reply-To is accepted, matched, and analyzed."""
    fake_provider = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_provider
    )

    # Set secret in settings
    orig_secret = settings.email_webhook_signing_secret
    settings.email_webhook_signing_secret = SecretStr(TEST_SIGNING_SECRET)

    try:
        delivery = inbound_setup["delivery"]
        payload = {
            "type": "email.received",
            "created_at": datetime.now(UTC).isoformat(),
            "data": {
                "email_id": "inbound_msg_1001",
                "from": "Acme Accounting <billing@acmecorp.com>",
                "to": ["billing@acco.app"],
                "subject": "Re: Payment Reminder: Invoice INV-2026-001",
                "text": "We will pay $500 next Tuesday.",
                "headers": {
                    "in-reply-to": f"<{delivery.provider_message_id}>",
                    "references": f"<{delivery.provider_message_id}>",
                },
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = make_svix_headers(body_bytes, secret=TEST_SIGNING_SECRET)

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["status"] == "processed"
        assert data["customer_id"] == str(inbound_setup["customer"].id)
        assert data["invoice_id"] == str(inbound_setup["invoice"].id)
        assert data["match_confidence"] == "HIGH_THREAD_REFERENCE"
        assert data["analysis_status"] == "PENDING_REVIEW"
        assert data["analysis_id"] is not None

        # Verify persisted message in database
        msg_id = uuid.UUID(data["message_id"])
        msg = db_session.get(CollectionMessage, msg_id)
        assert msg is not None
        assert msg.direction == MessageDirection.INBOUND
        assert msg.channel == MessageChannel.EMAIL
        assert msg.status == MessageStatus.RECEIVED
        assert msg.invoice_id == inbound_setup["invoice"].id
        assert msg.customer_id == inbound_setup["customer"].id
        assert "We will pay $500 next Tuesday." in msg.body

        # Verify analysis in database
        analysis = db_session.get(CustomerReplyAnalysis, uuid.UUID(data["analysis_id"]))
        assert analysis is not None
        assert analysis.status == AnalysisStatus.PENDING_REVIEW
        assert analysis.source_message_id == msg_id

        activities = db_session.scalars(
            select(CollectionActivity).where(
                CollectionActivity.customer_id == inbound_setup["customer"].id
            )
        ).all()
        event_types = [a.event_type for a in activities]
        assert EventType.INBOUND_RECORDED in event_types
        assert EventType.REPLY_ANALYSIS_CREATED in event_types

    finally:
        settings.email_webhook_signing_secret = orig_secret
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_2_invalid_signature_is_rejected(client: TestClient):
    """Scenario 2: Tampered payload or wrong signature is rejected with 401."""
    orig_secret = settings.email_webhook_signing_secret
    settings.email_webhook_signing_secret = SecretStr(TEST_SIGNING_SECRET)

    try:
        payload = {"type": "email.received", "data": {"from": "test@example.com", "text": "Hello"}}
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = make_svix_headers(body_bytes, secret=TEST_SIGNING_SECRET)
        headers["svix-signature"] = "v1,invalid_forged_signature_base64=="

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 401
        assert "Invalid webhook signature" in resp.json()["detail"]
    finally:
        settings.email_webhook_signing_secret = orig_secret


def test_3_missing_required_webhook_secret_fails_closed_in_production(client: TestClient):
    """Scenario 3: In production environment without configured secret, request fails closed."""
    orig_secret = settings.email_webhook_signing_secret
    orig_env = settings.environment

    settings.email_webhook_signing_secret = None
    settings.environment = "production"

    try:
        payload = {"type": "email.received", "data": {"from": "test@example.com", "text": "Hello"}}
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_123", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 503
        assert "signing secret is not configured" in resp.json()["detail"]
    finally:
        settings.email_webhook_signing_secret = orig_secret
        settings.environment = orig_env


def test_4_replay_window_expired_is_rejected(client: TestClient):
    """Scenario 4: Replay attack with timestamp older than 5 minutes is rejected."""
    orig_secret = settings.email_webhook_signing_secret
    settings.email_webhook_signing_secret = SecretStr(TEST_SIGNING_SECRET)

    try:
        payload = {"type": "email.received", "data": {"from": "test@example.com", "text": "Hello"}}
        body_bytes = json.dumps(payload).encode("utf-8")
        # 10 minutes ago
        old_timestamp = int(time.time()) - 600
        headers = make_svix_headers(body_bytes, secret=TEST_SIGNING_SECRET, timestamp=old_timestamp)

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 401
    finally:
        settings.email_webhook_signing_secret = orig_secret


def test_5_duplicate_event_is_idempotent_no_duplicate_message(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 5: Duplicate webhook delivery is deduplicated without creating duplicate messages or analyses."""
    fake_provider = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_provider
    )

    payload = {
        "type": "email.received",
        "data": {
            "email_id": "dedup_email_event_1",
            "from": "Acme Accounting <billing@acmecorp.com>",
            "to": ["billing@acco.app"],
            "subject": "Regarding payment",
            "text": "Payment sent.",
        },
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    event_id = "evt_dedup_unique_id_1"
    headers = {"svix-id": event_id, "content-type": "application/json"}

    # First delivery
    resp1 = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "processed"
    message_count_1 = db_session.query(CollectionMessage).count()
    analysis_count_1 = db_session.query(CustomerReplyAnalysis).count()
    assert fake_provider.calls == 1

    # Second delivery with exact same event_id
    resp2 = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "already processed"

    # Verify no duplicate records created
    message_count_2 = db_session.query(CollectionMessage).count()
    analysis_count_2 = db_session.query(CustomerReplyAnalysis).count()
    assert message_count_2 == message_count_1
    assert analysis_count_2 == analysis_count_1
    assert fake_provider.calls == 1  # AI was NOT invoked again


def test_6_multiple_outstanding_invoices_not_arbitrarily_matched(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 6: When customer has several outstanding invoices and no thread reference, association is NOT guessed."""
    user = inbound_setup["user"]
    customer = inbound_setup["customer"]

    # Add a SECOND open invoice for this customer
    second_invoice = Invoice(
        organization_id=user.organization_id,
        customer_id=customer.id,
        invoice_number="INV-2026-002",
        issue_date=datetime.now(UTC) - timedelta(days=5),
        due_date=datetime.now(UTC) + timedelta(days=20),
        currency="USD",
        total_amount=Decimal("2500.00"),
        status=InvoiceStatus.ISSUED,
    )
    db_session.add(second_invoice)
    db_session.commit()

    # Customer replies with no In-Reply-To and no invoice number mentioned
    payload = {
        "type": "email.received",
        "data": {
            "email_id": "ambiguous_invoice_test",
            "from": "billing@acmecorp.com",
            "subject": "General question",
            "text": "What is our current balance?",
        },
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"svix-id": "evt_multi_inv_1", "content-type": "application/json"}

    resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "processed"
    assert data["customer_id"] == str(customer.id)
    # CRITICAL: invoice_id must be None! Not guessed to INV-2026-001 or INV-2026-002!
    assert data["invoice_id"] is None
    assert data["match_confidence"] == "AMBIGUOUS_MULTIPLE_OPEN_INVOICES"

    msg = db_session.get(CollectionMessage, uuid.UUID(data["message_id"]))
    assert msg is not None
    assert msg.customer_id == customer.id
    assert msg.invoice_id is None


def test_7_unknown_sender_handled_safely_no_financial_record(client: TestClient, db_session):
    """Scenario 7: Unknown sender email creates no CollectionMessage or unverified financial record."""
    initial_msg_count = db_session.query(CollectionMessage).count()

    payload = {
        "type": "email.received",
        "data": {
            "email_id": "unknown_sender_event",
            "from": "random_stranger@unknown-domain.com",
            "subject": "Payment advice",
            "text": "I have transferred the money.",
        },
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"svix-id": "evt_unknown_sender_1", "content-type": "application/json"}

    resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ignored"
    assert data["confidence"] == "NONE"
    assert "Unknown sender" in data["reason"]

    # Verify no message created
    assert db_session.query(CollectionMessage).count() == initial_msg_count

    # Operational audit record was preserved
    event = db_session.scalar(
        select(EmailWebhookEvent).where(
            EmailWebhookEvent.provider_event_id == "evt_unknown_sender_1"
        )
    )
    assert event is not None
    assert "REJECTED" in event.processing_result


def test_8_multiple_matching_customers_across_tenants_not_guessed(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 8: If sender email exists under multiple tenants/customers, do not guess."""
    # Create second organization with customer sharing the same email
    other_org = Organization(name="Other Corp", slug="other-corp-inbound")
    db_session.add(other_org)
    db_session.commit()

    other_customer = Customer(
        organization_id=other_org.id,
        name="Acme Branch",
        email="billing@acmecorp.com",  # Duplicate email across orgs
    )
    db_session.add(other_customer)
    db_session.commit()

    initial_msg_count = db_session.query(CollectionMessage).count()

    payload = {
        "type": "email.received",
        "data": {
            "email_id": "multi_tenant_test",
            "from": "billing@acmecorp.com",
            "subject": "Payment update",
            "text": "Payment status check",
        },
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"svix-id": "evt_multi_tenant_1", "content-type": "application/json"}

    resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ignored"
    assert data["confidence"] == "AMBIGUOUS"
    assert "Multiple customer records found" in data["reason"]
    assert db_session.query(CollectionMessage).count() == initial_msg_count


def test_9_explicit_invoice_reference_in_subject_or_body(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 9: Multiple open invoices, but subject explicitly references INV-2026-002."""
    user = inbound_setup["user"]
    customer = inbound_setup["customer"]

    second_invoice = Invoice(
        organization_id=user.organization_id,
        customer_id=customer.id,
        invoice_number="INV-2026-002",
        issue_date=datetime.now(UTC) - timedelta(days=5),
        due_date=datetime.now(UTC) + timedelta(days=20),
        currency="USD",
        total_amount=Decimal("2500.00"),
        status=InvoiceStatus.ISSUED,
    )
    db_session.add(second_invoice)
    db_session.commit()

    payload = {
        "type": "email.received",
        "data": {
            "email_id": "explicit_inv_test",
            "from": "billing@acmecorp.com",
            "subject": "Payment for INV-2026-002",
            "text": "We are processing payment for invoice INV-2026-002 today.",
        },
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"svix-id": "evt_explicit_inv_1", "content-type": "application/json"}

    resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "processed"
    assert data["invoice_id"] == str(second_invoice.id)
    assert data["match_confidence"] == "HIGH_EXPLICIT_INVOICE_MENTION"


def test_10_ai_analysis_failure_preserves_inbound_message(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 10: If AI provider fails or times out, the inbound message is NOT lost."""
    failing_provider = MockAnalysisProvider(error=AIProviderError("OpenAI API rate limit exceeded"))
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: failing_provider
    )

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "ai_failure_test",
                "from": "billing@acmecorp.com",
                "subject": "Payment delay",
                "text": "Sorry for delay, sending payment soon.",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_ai_failure_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] == "processed"
        assert data["analysis_status"] == "FAILED"
        assert data["analysis_id"] is None

        # The message MUST exist in the database!
        msg_id = uuid.UUID(data["message_id"])
        msg = db_session.get(CollectionMessage, msg_id)
        assert msg is not None
        assert msg.status == MessageStatus.RECEIVED
        assert "Sorry for delay" in msg.body
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_11_customer_payment_claim_does_not_mark_invoice_paid(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 11: A customer claiming 'I have already paid' must NOT mark the invoice paid or mutate balance."""
    invoice = inbound_setup["invoice"]
    original_status = invoice.status
    original_amount = invoice.total_amount

    payment_claim_result = LLMExtractionResult(
        primary_classification=ReplyClassification.PAYMENT_CLAIM,
        secondary_classifications=[],
        evidence_summary="Customer claims they paid yesterday via wire.",
        customer_intent="Claims invoice is already paid.",
        explicit_payment_amount=Decimal("1500.00"),
        currency="USD",
        proposed_payment_date=None,
        claims_already_paid=True,
        dispute_category=None,
        requests_information=False,
        missing_information=None,
        recommended_next_action="Verify bank account for wire receipt.",
        requires_human_review=True,
        confidence_score=0.98,
    )
    provider = MockAnalysisProvider(result=payment_claim_result)
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: provider
    )

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "claim_paid_test",
                "from": "billing@acmecorp.com",
                "subject": "I have paid",
                "text": "I have already paid this invoice yesterday.",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_claim_paid_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200

        # Refresh invoice from database
        db_session.expire_all()
        rechecked_invoice = db_session.get(Invoice, invoice.id)

        # FINANCIAL BOUNDARY VERIFICATION
        assert rechecked_invoice.status == original_status == InvoiceStatus.ISSUED
        assert rechecked_invoice.total_amount == original_amount
        # Analysis requires human review
        data = resp.json()
        analysis = db_session.get(CustomerReplyAnalysis, uuid.UUID(data["analysis_id"]))
        assert analysis.status == AnalysisStatus.PENDING_REVIEW
        assert analysis.analysis_payload["claims_already_paid"] is True
        assert analysis.analysis_payload["requires_human_review"] is True
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_12_potential_promise_respects_human_review_boundary(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 12: An extracted promise is strictly PENDING_REVIEW; no PaymentPromise is created silently."""
    from app.models.collection_workflow import PaymentPromise

    initial_promise_count = db_session.query(PaymentPromise).count()
    fake_provider = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_provider
    )

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "promise_test",
                "from": "billing@acmecorp.com",
                "subject": "Payment promise",
                "text": "Will pay $500 on Tuesday.",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_promise_review_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        analysis = db_session.get(CustomerReplyAnalysis, uuid.UUID(data["analysis_id"]))
        assert analysis.status == AnalysisStatus.PENDING_REVIEW

        # No PaymentPromise should be created automatically by the webhook
        assert db_session.query(PaymentPromise).count() == initial_promise_count
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_13_oversized_payload_is_rejected(client: TestClient):
    """Scenario 13: Payload exceeding 2MB is rejected with 413."""
    large_text = "A" * (2 * 1024 * 1024 + 100)
    payload = {"type": "email.received", "data": {"from": "test@example.com", "text": large_text}}
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"svix-id": "evt_oversized_1", "content-type": "application/json"}

    resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
    assert resp.status_code == 413
    assert "exceeds" in resp.json()["detail"]


def test_14_existing_resend_endpoint_transparently_routes_inbound_and_delivery_events(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 14: /api/v1/webhooks/email/resend routes email.received to inbound pipeline and email.delivered to delivery pipeline."""
    fake_provider = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_provider
    )

    try:
        # 1. Inbound reply sent to /email/resend
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "resend_inbound_test",
                "from": "billing@acmecorp.com",
                "subject": "Reply via resend endpoint",
                "text": "Will pay next week.",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_resend_inbound_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/resend", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"
        assert resp.json()["customer_id"] == str(inbound_setup["customer"].id)

        # 2. Delivery status event sent to /email/resend
        deliv_payload = {
            "type": "email.delivered",
            "data": {
                "email_id": inbound_setup["provider_msg_id"],
            },
        }
        deliv_bytes = json.dumps(deliv_payload).encode("utf-8")
        deliv_headers = {"svix-id": "evt_resend_deliv_1", "content-type": "application/json"}

        resp2 = client.post(
            "/api/v1/webhooks/email/resend", content=deliv_bytes, headers=deliv_headers
        )
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "processed"
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_15_metadata_only_payload_retrieves_body_via_receiving_provider(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 15: Resend metadata-only webhook fetches actual body via receiving provider and analyzes it."""
    mock_receiving = MockReceivingProvider(
        {
            "recv_meta_123": {
                "id": "recv_meta_123",
                "from": "billing@acmecorp.com",
                "to": ["collections@mycompany.com"],
                "subject": "Re: Outstanding Invoice",
                "text": "Here is the payment confirmation. We will pay the remaining $500 next Tuesday.",
                "html": "<p>Here is the payment confirmation. We will pay the remaining $500 next Tuesday.</p>",
                "headers": {"in-reply-to": inbound_setup["provider_msg_id"]},
            }
        }
    )
    set_receiving_provider(mock_receiving)

    fake_ai = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_ai
    )

    try:
        # Webhook payload has NO text or html, only metadata and email_id
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "recv_meta_123",
                "from": "billing@acmecorp.com",
                "to": ["collections@mycompany.com"],
                "subject": "Re: Outstanding Invoice",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_meta_retrieval_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "processed"
        assert "recv_meta_123" in mock_receiving.calls

        # Verify AI received the actual retrieved text body
        assert fake_ai.calls == 1
        analysis = db_session.get(CustomerReplyAnalysis, uuid.UUID(data["analysis_id"]))
        assert analysis is not None
        assert "500" in analysis.analysis_payload["evidence_summary"]

        # Verify message record in DB has the retrieved text
        msg = db_session.get(CollectionMessage, uuid.UUID(data["message_id"]))
        assert msg is not None
        assert "We will pay the remaining $500 next Tuesday" in msg.body
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)
        set_receiving_provider(None)


def test_16_transient_retrieval_failure_raises_503_and_allows_retry(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 16: Transient API error returns 503 and does NOT record deduplication event, allowing retries."""
    mock_receiving = MockReceivingProvider(
        {
            "recv_transient_1": {
                "id": "recv_transient_1",
                "from": "billing@acmecorp.com",
                "to": ["collections@mycompany.com"],
                "subject": "Re: Transient test",
                "text": "I will settle the invoice tomorrow.",
            }
        }
    )
    mock_receiving.simulate_transient_error = True
    set_receiving_provider(mock_receiving)

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "recv_transient_1",
                "from": "billing@acmecorp.com",
                "subject": "Re: Transient test",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_transient_retry_1", "content-type": "application/json"}

        # First attempt: should fail with 503
        resp1 = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp1.status_code == 503
        assert "failure retrieving email" in resp1.json()["detail"].lower()

        # Ensure no EmailWebhookEvent was committed for this event_id
        db_session.expire_all()
        existing_event = db_session.scalar(
            select(EmailWebhookEvent).where(
                EmailWebhookEvent.provider_event_id == "evt_transient_retry_1"
            )
        )
        assert existing_event is None

        # Clear the transient error (simulating network recovered / Resend retrying)
        mock_receiving.simulate_transient_error = False

        # Second attempt with the SAME event_id
        resp2 = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "processed"

        # Now it is recorded
        db_session.expire_all()
        saved_event = db_session.scalar(
            select(EmailWebhookEvent).where(
                EmailWebhookEvent.provider_event_id == "evt_transient_retry_1"
            )
        )
        assert saved_event is not None
    finally:
        set_receiving_provider(None)


def test_17_permanent_retrieval_failure_records_rejection_without_false_message(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 17: Permanent retrieval error (e.g. 404) records rejection without creating message or AI analysis."""
    mock_receiving = MockReceivingProvider()
    mock_receiving.simulate_permanent_error = True
    set_receiving_provider(mock_receiving)

    fake_ai = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_ai
    )

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "recv_perm_404",
                "from": "billing@acmecorp.com",
                "subject": "Missing email",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_perm_404_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ignored"
        assert "retrieval_failed" in data["reason"]
        assert fake_ai.calls == 0

        # Verify no message created
        db_session.expire_all()
        assert data.get("message_id") is None

        # Verify audit record saved with permanent error status
        audit = db_session.scalar(
            select(EmailWebhookEvent).where(EmailWebhookEvent.provider_event_id == "evt_perm_404_1")
        )
        assert audit is not None
        assert audit.processing_result == "RETRIEVAL_FAILED_PERMANENT"
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)
        set_receiving_provider(None)


def test_18_empty_retrieved_body_is_rejected_without_fake_substitution(
    client: TestClient, db_session, inbound_setup
):
    """Scenario 18: Empty body is ignored with REJECTED_EMPTY_BODY audit and never substituted with subject."""
    mock_receiving = MockReceivingProvider(
        {
            "recv_empty_1": {
                "id": "recv_empty_1",
                "from": "billing@acmecorp.com",
                "to": ["collections@mycompany.com"],
                "subject": "Empty body subject",
                "text": "   ",
                "html": "",
            }
        }
    )
    set_receiving_provider(mock_receiving)

    fake_ai = MockAnalysisProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (
        lambda: fake_ai
    )

    try:
        payload = {
            "type": "email.received",
            "data": {
                "email_id": "recv_empty_1",
                "from": "billing@acmecorp.com",
                "subject": "Empty body subject",
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"svix-id": "evt_empty_body_1", "content-type": "application/json"}

        resp = client.post("/api/v1/webhooks/email/inbound", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ignored"
        assert data["reason"] == "empty_email_body"
        assert fake_ai.calls == 0

        # Verify audit event in DB records REJECTED_EMPTY_BODY
        db_session.expire_all()
        audit = db_session.scalar(
            select(EmailWebhookEvent).where(
                EmailWebhookEvent.provider_event_id == "evt_empty_body_1"
            )
        )
        assert audit is not None
        assert audit.processing_result == "REJECTED_EMPTY_BODY"
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)
        set_receiving_provider(None)


def test_19_production_mode_fails_closed_on_resend_endpoint_when_secret_missing(client: TestClient):
    """Scenario 19: In production, /api/v1/webhooks/email/resend fails closed with 503 if secret missing."""
    orig_env = settings.environment
    orig_secret = settings.email_webhook_signing_secret

    try:
        settings.environment = "production"
        settings.email_webhook_signing_secret = None

        payload = {"type": "email.delivered", "data": {"email_id": "any"}}
        body_bytes = json.dumps(payload).encode("utf-8")

        resp = client.post(
            "/api/v1/webhooks/email/resend",
            content=body_bytes,
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]
    finally:
        settings.environment = orig_env
        settings.email_webhook_signing_secret = orig_secret


def test_20_invalid_signature_on_resend_endpoint_is_rejected_before_db_mutation(
    client: TestClient, db_session
):
    """Scenario 20: Invalid signature on /api/v1/webhooks/email/resend returns 401."""
    orig_secret = settings.email_webhook_signing_secret

    try:
        settings.email_webhook_signing_secret = SecretStr(TEST_SIGNING_SECRET)

        payload = {"type": "email.delivered", "data": {"email_id": "any"}}
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {
            "svix-id": "evt_invalid_resend_1",
            "svix-timestamp": str(int(time.time())),
            "svix-signature": "v1,invalid_signature_base64",
            "content-type": "application/json",
        }

        resp = client.post("/api/v1/webhooks/email/resend", content=body_bytes, headers=headers)
        assert resp.status_code == 401
        assert "Invalid webhook signature" in resp.json()["detail"]
    finally:
        settings.email_webhook_signing_secret = orig_secret
