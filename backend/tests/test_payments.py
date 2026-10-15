import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def create_test_customer(db_session: Session, user_headers, name="Test Cust"):
    # Since we can't extract current_user easily here, we'll create via API
    pass # we'll do via API in tests

def test_record_payment(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    # Create customer
    r = client.post(
        "/api/v1/customers",
        headers=normal_user_token_headers,
        json={"name": "Cust 1"}
    )
    assert r.status_code == 201
    cust_id = r.json()["id"]

    # Record payment
    payment_data = {
        "customer_id": cust_id,
        "amount": "100.50",
        "currency": "USD",
        "payment_date": datetime.now(UTC).date().isoformat(),
        "payment_method": "BANK_TRANSFER",
        "reference": "REF123"
    }
    r = client.post(
        "/api/v1/payments",
        headers=normal_user_token_headers,
        json=payment_data
    )
    assert r.status_code == 201
    payment = r.json()
    assert payment["amount"] == "100.50"
    assert payment["unallocated_amount"] == "100.50"
    assert payment["allocated_amount"] == "0.00"

def test_invalid_payment_amount(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    payment_data = {
        "customer_id": str(uuid.uuid4()),
        "amount": "-10.00",
        "currency": "USD",
        "payment_date": datetime.now(UTC).date().isoformat(),
        "payment_method": "CASH"
    }
    r = client.post(
        "/api/v1/payments",
        headers=normal_user_token_headers,
        json=payment_data
    )
    assert r.status_code == 422

def test_allocate_payment(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    # 1. Customer
    r = client.post(
        "/api/v1/customers",
        headers=normal_user_token_headers,
        json={"name": "Cust A"}
    )
    cust_id = r.json()["id"]

    # 2. Invoice
    inv_data = {
        "customer_id": cust_id,
        "invoice_number": "INV-100",
        "issue_date": datetime.now(UTC).isoformat(),
        "due_date": datetime.now(UTC).isoformat(),
        "currency": "USD",
        "total_amount": "200.00"
    }
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json=inv_data)
    inv_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv_id}/issue", headers=normal_user_token_headers)

    # 3. Payment
    pay_data = {
        "customer_id": cust_id,
        "amount": "150.00",
        "currency": "USD",
        "payment_date": datetime.now(UTC).date().isoformat(),
        "payment_method": "BANK_TRANSFER"
    }
    r = client.post("/api/v1/payments", headers=normal_user_token_headers, json=pay_data)
    pay_id = r.json()["id"]

    # 4. Allocate
    alloc_data = {
        "invoice_id": inv_id,
        "amount": "50.00"
    }
    r = client.post(f"/api/v1/payments/{pay_id}/allocations", headers=normal_user_token_headers, json=alloc_data)
    assert r.status_code == 201
    result = r.json()
    assert result["allocated_amount"] == "50.00"
    assert result["unallocated_amount"] == "100.00"

    # 5. Check invoice balance
    r = client.get(f"/api/v1/invoices/{inv_id}/balance", headers=normal_user_token_headers)
    balance = r.json()
    assert balance["paid_amount"] == "50.00"
    assert balance["outstanding_amount"] == "150.00"
    assert balance["payment_status"] == "PARTIALLY_PAID"

def test_reverse_payment(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    # 1. Customer
    r = client.post("/api/v1/customers", headers=normal_user_token_headers, json={"name": "Cust B"})
    cust_id = r.json()["id"]

    # 2. Invoice
    inv_data = {
        "customer_id": cust_id,
        "invoice_number": "INV-101",
        "issue_date": datetime.now(UTC).isoformat(),
        "due_date": datetime.now(UTC).isoformat(),
        "currency": "USD",
        "total_amount": "100.00"
    }
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json=inv_data)
    inv_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv_id}/issue", headers=normal_user_token_headers)

    # 3. Payment & Allocate
    r = client.post("/api/v1/payments", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "amount": "100.00", "currency": "USD", 
        "payment_date": datetime.now(UTC).date().isoformat(), "payment_method": "CASH"
    })
    pay_id = r.json()["id"]
    client.post(f"/api/v1/payments/{pay_id}/allocations", headers=normal_user_token_headers, json={
        "invoice_id": inv_id, "amount": "100.00"
    })

    # Check balance is PAID
    r = client.get(f"/api/v1/invoices/{inv_id}/balance", headers=normal_user_token_headers)
    assert r.json()["payment_status"] == "PAID"

    # 4. Reverse
    r = client.post(f"/api/v1/payments/{pay_id}/reverse", headers=normal_user_token_headers, json={
        "reason": "Bounced check"
    })
    assert r.status_code == 200

    # 5. Check balance restored
    r = client.get(f"/api/v1/invoices/{inv_id}/balance", headers=normal_user_token_headers)
    balance = r.json()
    assert balance["payment_status"] == "UNPAID"
    assert balance["paid_amount"] == "0.00"
    assert balance["outstanding_amount"] == "100.00"
