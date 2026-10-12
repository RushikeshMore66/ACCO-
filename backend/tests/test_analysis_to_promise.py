"""Tests for linking Agent 09 CustomerReplyAnalysis to Agent 10 PaymentPromise"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models.collection_workflow import (
    CollectionMessage,
    MessageChannel,
    MessageDirection,
    MessageStatus,
    PaymentPromise,
)
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.reply_analysis import (
    AnalysisStatus,
    CustomerReplyAnalysis,
    ReplyClassification,
)
from app.models.user import User


@pytest.fixture
def promise_workflow_data(db_session, normal_user_token_headers):
    user = db_session.query(User).filter_by(email="test@example.com").first()
    customer = Customer(
        organization_id=user.organization_id,
        name="Promise Linking Customer",
        email="promise@example.com",
    )
    db_session.add(customer)
    db_session.commit()
    
    invoice = Invoice(
        organization_id=user.organization_id,
        customer_id=customer.id,
        invoice_number="PROMISE-LINK-001",
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
        body="I will pay 500 USD on Monday.",
        status=MessageStatus.RECEIVED,
        created_by_user_id=user.id,
    )
    db_session.add(message)
    db_session.commit()
    
    analysis = CustomerReplyAnalysis(
        organization_id=user.organization_id,
        source_message_id=message.id,
        invoice_id=invoice.id,
        customer_id=customer.id,
        classification=ReplyClassification.PAYMENT_PROMISE,
        confidence_score=0.95,
        analysis_payload={"explicit_payment_amount": 500, "proposed_payment_date": "Monday"},
        model_provider="fake",
        model_name="fake",
        prompt_version="fake",
        status=AnalysisStatus.ACCEPTED,
        reviewed_by_user_id=user.id,
        reviewed_at=datetime.now(UTC),
    )
    db_session.add(analysis)
    db_session.commit()
    
    return {
        "user": user,
        "customer": customer,
        "invoice": invoice,
        "message": message,
        "analysis": analysis,
        "headers": normal_user_token_headers
    }

def test_manual_promise_without_analysis(client: TestClient, db_session, promise_workflow_data):
    invoice = promise_workflow_data["invoice"]
    headers = promise_workflow_data["headers"]
    
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    
    payload = {
        "promised_amount": 100.00,
        "expected_payment_date": str(tomorrow)
    }
    response = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["reply_analysis_id"] is None
    
    # Clean up to allow other tests
    db_session.query(PaymentPromise).delete()
    db_session.commit()

def test_analysis_to_promise_success_and_retry(client: TestClient, db_session, promise_workflow_data):
    invoice = promise_workflow_data["invoice"]
    analysis = promise_workflow_data["analysis"]
    headers = promise_workflow_data["headers"]
    
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    
    payload = {
        "promised_amount": 500.00,
        "expected_payment_date": str(tomorrow),
        "reply_analysis_id": str(analysis.id)
    }
    
    # 1. Success
    response = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["reply_analysis_id"] == str(analysis.id)
    assert data["source_message_id"] == str(analysis.source_message_id)
    
    # 2. Retry (idempotency)
    response_retry = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response_retry.status_code == 200
    assert response_retry.json()["id"] == data["id"]
    
    # 3. Conflicting retry
    payload["promised_amount"] = 600.00
    response_conflict = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response_conflict.status_code == 409
    assert "conflicting promise" in response_conflict.json()["detail"].lower()
    
    # Clean up
    db_session.query(PaymentPromise).delete()
    db_session.commit()

def test_analysis_to_promise_rejected_if_pending(client: TestClient, db_session, promise_workflow_data):
    invoice = promise_workflow_data["invoice"]
    analysis = promise_workflow_data["analysis"]
    headers = promise_workflow_data["headers"]
    
    analysis.status = AnalysisStatus.PENDING_REVIEW
    db_session.commit()
    
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    
    payload = {
        "promised_amount": 500.00,
        "expected_payment_date": str(tomorrow),
        "reply_analysis_id": str(analysis.id)
    }
    response = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response.status_code == 400
    assert "must be accepted" in response.json()["detail"].lower()

def test_analysis_to_promise_rejected_if_wrong_classification(client: TestClient, db_session, promise_workflow_data):
    invoice = promise_workflow_data["invoice"]
    analysis = promise_workflow_data["analysis"]
    headers = promise_workflow_data["headers"]
    
    analysis.classification = ReplyClassification.DISPUTE
    db_session.commit()
    
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    
    payload = {
        "promised_amount": 500.00,
        "expected_payment_date": str(tomorrow),
        "reply_analysis_id": str(analysis.id)
    }
    response = client.post(f"/api/v1/collections/invoices/{invoice.id}/promises", headers=headers, json=payload)
    assert response.status_code == 400
    assert "classified as a payment promise" in response.json()["detail"].lower()
