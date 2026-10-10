import pytest
import uuid
from datetime import datetime, UTC
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.collection_workflow import MessageDirection, MessageChannel, MessageStatus
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.models.user import User

@pytest.fixture
def setup_data(db_session: Session, normal_user_token_headers):
    # normal_user_token_headers sets up user test@example.com in 'Test Org' as OWNER.
    user = db_session.query(User).filter_by(email="test@example.com").first()
    org_id = user.organization_id
    
    # Create a customer
    customer = Customer(
        organization_id=org_id,
        name="Test Customer",
        email="customer@example.com"
    )
    db_session.add(customer)
    db_session.commit()
    
    # Create an invoice
    invoice = Invoice(
        organization_id=org_id,
        customer_id=customer.id,
        invoice_number="INV-001",
        total_amount=1000.00,
        currency="USD",
        status=InvoiceStatus.ISSUED,
        issue_date=datetime(2026, 1, 1, tzinfo=UTC),
        due_date=datetime(2026, 1, 31, tzinfo=UTC)
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    
    return {"invoice_id": invoice.id, "customer_id": customer.id, "org_id": org_id, "user_id": user.id}

def test_create_draft(client: TestClient, normal_user_token_headers, setup_data):
    invoice_id = setup_data["invoice_id"]
    response = client.post(
        f"/api/v1/collections/invoices/{invoice_id}/messages",
        headers=normal_user_token_headers,
        json={
            "channel": "EMAIL",
            "subject": "Overdue Notice",
            "body": "Please pay your invoice."
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "DRAFT"
    assert data["body"] == "Please pay your invoice."
    
def test_timeline(client: TestClient, normal_user_token_headers, setup_data):
    invoice_id = setup_data["invoice_id"]
    # Create draft
    client.post(
        f"/api/v1/collections/invoices/{invoice_id}/messages",
        headers=normal_user_token_headers,
        json={"channel": "EMAIL", "subject": "Notice", "body": "Body"}
    )
    
    response = client.get(
        f"/api/v1/collections/invoices/{invoice_id}/timeline",
        headers=normal_user_token_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["event_type"] == "MESSAGE_CREATED"

def test_full_workflow(client: TestClient, normal_user_token_headers, setup_data):
    invoice_id = setup_data["invoice_id"]
    
    # 1. Draft
    resp1 = client.post(
        f"/api/v1/collections/invoices/{invoice_id}/messages",
        headers=normal_user_token_headers,
        json={"channel": "EMAIL", "body": "Draft body"}
    )
    msg_id = resp1.json()["id"]
    
    # 2. Submit
    resp2 = client.post(
        f"/api/v1/collections/messages/{msg_id}/submit-for-approval",
        headers=normal_user_token_headers
    )
    assert resp2.json()["status"] == "PENDING_APPROVAL"
    
    # 3. Approve
    resp3 = client.post(
        f"/api/v1/collections/messages/{msg_id}/approve",
        headers=normal_user_token_headers
    )
    assert resp3.json()["status"] == "APPROVED"
