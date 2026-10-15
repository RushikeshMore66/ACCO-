"""Focused regression tests for advisory customer reply analysis."""
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.adapters.ai.openai_provider import AIProviderUnavailable
from app.models.collection_workflow import (
    CollectionMessage,
    MessageChannel,
    MessageDirection,
    MessageStatus,
)
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.reply_analysis import AnalysisStatus, CustomerReplyAnalysis, ReplyClassification
from app.models.user import User
from app.schemas.reply_analysis import LLMExtractionResult


class FakeProvider:
    model = "test-model"
    prompt_version = "test-v1"

    def __init__(self, result=None, error=None):
        self.calls = 0
        self.result = result or LLMExtractionResult(
            primary_classification=ReplyClassification.PAYMENT_PROMISE,
            secondary_classifications=[],
            evidence_summary="Customer says they will pay Monday.",
            customer_intent="Promised a future payment.",
            explicit_payment_amount=Decimal(100),
            currency="USD",
            proposed_payment_date="Monday",
            claims_already_paid=False,
            dispute_category=None,
            requests_information=False,
            missing_information=None,
            recommended_next_action="Review the promise and confirm the date.",
            requires_human_review=False,
            confidence_score=0.91,
        )
        self.error = error

    def extract_intelligence(self, message_body):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def reply_data(db_session, normal_user_token_headers):
    user = db_session.query(User).filter_by(email="test@example.com").first()
    customer = Customer(
        organization_id=user.organization_id,
        name="Reply Customer",
        email="customer@example.com",
    )
    db_session.add(customer)
    db_session.commit()
    invoice = Invoice(
        organization_id=user.organization_id,
        customer_id=customer.id,
        invoice_number="REPLY-001",
        total_amount=Decimal("1000.00"),
        currency="USD",
        status=InvoiceStatus.ISSUED,
        issue_date=datetime(2026, 1, 1, tzinfo=UTC),
        due_date=datetime(2026, 1, 31, tzinfo=UTC),
    )
    db_session.add(invoice)
    db_session.commit()
    message = CollectionMessage(
        organization_id=user.organization_id,
        customer_id=customer.id,
        invoice_id=invoice.id,
        direction=MessageDirection.INBOUND,
        channel=MessageChannel.EMAIL,
        subject="Re: invoice",
        body="I will pay 100 USD on Monday.",
        status=MessageStatus.RECEIVED,
        created_by_user_id=user.id,
    )
    db_session.add(message)
    db_session.commit()
    return {"user": user, "customer": customer, "invoice": invoice, "message": message}


def test_service_creates_pending_analysis_without_financial_mutation(db_session, reply_data):
    from app.services.customer_reply_intelligence import analyze_customer_reply

    invoice_amount = reply_data["invoice"].total_amount
    provider = FakeProvider()
    analysis = analyze_customer_reply(
        db_session,
        reply_data["message"].id,
        reply_data["user"].organization_id,
        provider,
    )
    assert analysis.status == AnalysisStatus.PENDING_REVIEW
    assert analysis.analysis_payload["proposed_payment_date"] == "Monday"
    assert analysis.analysis_payload["requires_human_review"] is True
    assert provider.calls == 1
    assert reply_data["invoice"].total_amount == invoice_amount
    assert db_session.query(CustomerReplyAnalysis).count() == 1


def test_service_rejects_outbound_before_provider(db_session, reply_data):
    from app.services.customer_reply_intelligence import ReplyAnalysisError, analyze_customer_reply

    reply_data["message"].direction = MessageDirection.OUTBOUND
    db_session.commit()
    provider = FakeProvider()
    with pytest.raises(ReplyAnalysisError):
        analyze_customer_reply(
            db_session,
            reply_data["message"].id,
            reply_data["user"].organization_id,
            provider,
        )
    assert provider.calls == 0


def test_service_sanitizes_nonpositive_amount(db_session, reply_data):
    from app.services.customer_reply_intelligence import analyze_customer_reply

    provider = FakeProvider()
    provider.result.explicit_payment_amount = Decimal(-25)
    analysis = analyze_customer_reply(
        db_session, reply_data["message"].id, reply_data["user"].organization_id, provider
    )
    assert analysis.analysis_payload["explicit_payment_amount"] is None
    assert analysis.analysis_payload["requires_human_review"] is True


def test_provider_error_does_not_persist_analysis(db_session, reply_data):
    from app.services.customer_reply_intelligence import analyze_customer_reply

    provider = FakeProvider(error=AIProviderUnavailable("safe"))
    with pytest.raises(AIProviderUnavailable):
        analyze_customer_reply(
            db_session, reply_data["message"].id, reply_data["user"].organization_id, provider
        )
    assert db_session.query(CustomerReplyAnalysis).count() == 0


def test_analysis_endpoints_and_one_time_review(
    client: TestClient, normal_user_token_headers, reply_data
):
    from app.api.v1.endpoints import reply_analyses

    fake = FakeProvider()
    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: (lambda: fake)
    try:
        response = client.post(
            f"/api/v1/collections/messages/{reply_data['message'].id}/analyze",
            headers=normal_user_token_headers,
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["status"] == "PENDING_REVIEW"
        assert fake.calls == 1

        listed = client.get(
            f"/api/v1/collections/messages/{reply_data['message'].id}/analyses",
            headers=normal_user_token_headers,
        )
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert fake.calls == 1

        review = client.post(
            f"/api/v1/collections/reply-analyses/{data['id']}/review",
            headers=normal_user_token_headers,
            json={"decision": "ACCEPTED", "review_notes": "Confirmed manually"},
        )
        assert review.status_code == 200, review.text
        assert review.json()["status"] == "ACCEPTED"
        assert review.json()["review_notes"] == "Confirmed manually"

        second = client.post(
            f"/api/v1/collections/reply-analyses/{data['id']}/review",
            headers=normal_user_token_headers,
            json={"decision": "DISMISSED"},
        )
        assert second.status_code == 409
        assert fake.calls == 1
        activities = client.get(
            f"/api/v1/collections/messages/{reply_data['message'].id}/analyses",
            headers=normal_user_token_headers,
        )
        assert activities.status_code == 200
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)


def test_unconfigured_provider_is_service_unavailable(client, normal_user_token_headers, reply_data):
    from app.api.v1.endpoints import reply_analyses

    def raise_not_configured():
        from app.adapters.ai.openai_provider import AIProviderNotConfigured
        raise AIProviderNotConfigured("safe")

    client.app.dependency_overrides[reply_analyses.get_reply_provider_factory] = lambda: raise_not_configured
    try:
        response = client.post(
            f"/api/v1/collections/messages/{reply_data['message'].id}/analyze",
            headers=normal_user_token_headers,
        )
        assert response.status_code == 503
    finally:
        client.app.dependency_overrides.pop(reply_analyses.get_reply_provider_factory, None)
