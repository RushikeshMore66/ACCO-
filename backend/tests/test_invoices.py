from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_invoice_lifecycle(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    # Create customer
    customer_data = {"name": "Invoice Customer"}
    r = client.post("/api/v1/customers", json=customer_data, headers=normal_user_token_headers)
    assert r.status_code == 201
    customer_id = r.json()["id"]

    # Create Invoice Draft
    issue_date = datetime.now(UTC).isoformat()
    due_date = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    invoice_data = {
        "customer_id": customer_id,
        "invoice_number": "INV-001",
        "issue_date": issue_date,
        "due_date": due_date,
        "currency": "USD",
        "total_amount": "1000.50"
    }
    r = client.post("/api/v1/invoices", json=invoice_data, headers=normal_user_token_headers)
    assert r.status_code == 201
    invoice = r.json()
    assert invoice["status"] == "DRAFT"
    invoice_id = invoice["id"]

    # Update Invoice Draft
    update_data = {"total_amount": "2000.00"}
    r = client.patch(f"/api/v1/invoices/{invoice_id}", json=update_data, headers=normal_user_token_headers)
    assert r.status_code == 200
    assert r.json()["total_amount"] == "2000.00"

    # Issue Invoice
    r = client.post(f"/api/v1/invoices/{invoice_id}/issue", headers=normal_user_token_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "ISSUED"

    # Update Issued Invoice (Should fail)
    r = client.patch(f"/api/v1/invoices/{invoice_id}", json={"description": "Test"}, headers=normal_user_token_headers)
    assert r.status_code == 400

    # Void Invoice
    r = client.post(f"/api/v1/invoices/{invoice_id}/void", json={"void_reason": "Mistake"}, headers=normal_user_token_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "VOID"
    assert r.json()["void_reason"] == "Mistake"


def test_invoice_batch_import(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    issue_date = datetime.now(UTC).isoformat()
    due_date = (datetime.now(UTC) + timedelta(days=30)).isoformat()

    batch_payload = {
        "invoices": [
            {
                "customer_name": "Imported Corp",
                "customer_email": "imported@corp.com",
                "invoice_number": "INV-BATCH-001",
                "issue_date": issue_date,
                "due_date": due_date,
                "currency": "USD",
                "total_amount": "2500.00",
                "auto_issue": True
            },
            {
                "customer_name": "Imported Corp",
                "customer_email": "imported@corp.com",
                "invoice_number": "INV-BATCH-001", # Duplicate
                "issue_date": issue_date,
                "due_date": due_date,
                "currency": "USD",
                "total_amount": "2500.00",
                "auto_issue": False
            },
            {
                "customer_name": "Unknown Ghost Corp", # No email to create
                "invoice_number": "INV-BATCH-002",
                "issue_date": issue_date,
                "due_date": due_date,
                "currency": "USD",
                "total_amount": "100.00",
            }
        ]
    }

    r = client.post("/api/v1/invoices/import", json=batch_payload, headers=normal_user_token_headers)
    assert r.status_code == 200
    res = r.json()
    assert res["total_processed"] == 3
    assert res["created_count"] == 1
    assert res["rejected_count"] == 2
    
    statuses = [item["status"] for item in res["results"]]
    assert statuses == ["ISSUED", "DUPLICATE", "REJECTED"]
