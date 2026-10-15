from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_receivables_summary_and_aging(
    client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]
):
    # 1. Customer
    r = client.post("/api/v1/customers", headers=normal_user_token_headers, json={"name": "Cust C"})
    cust_id = r.json()["id"]

    now = datetime.now(UTC)

    # 2. Invoices
    # Inv 1: Not due, UNPAID (Due in 5 days)
    inv1_data = {
        "customer_id": cust_id,
        "invoice_number": "INV-C1",
        "issue_date": now.isoformat(),
        "due_date": (now + timedelta(days=5)).isoformat(),
        "currency": "USD",
        "total_amount": "500.00",
    }
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json=inv1_data)
    inv1_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv1_id}/issue", headers=normal_user_token_headers)

    # Inv 2: Overdue by 15 days, UNPAID
    inv2_data = {
        "customer_id": cust_id,
        "invoice_number": "INV-C2",
        "issue_date": (now - timedelta(days=45)).isoformat(),
        "due_date": (now - timedelta(days=15)).isoformat(),
        "currency": "USD",
        "total_amount": "300.00",
    }
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json=inv2_data)
    inv2_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv2_id}/issue", headers=normal_user_token_headers)

    # Inv 3: Overdue by 40 days, PARTIALLY PAID
    inv3_data = {
        "customer_id": cust_id,
        "invoice_number": "INV-C3",
        "issue_date": (now - timedelta(days=70)).isoformat(),
        "due_date": (now - timedelta(days=40)).isoformat(),
        "currency": "USD",
        "total_amount": "200.00",
    }
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json=inv3_data)
    inv3_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv3_id}/issue", headers=normal_user_token_headers)

    # Partial payment to Inv 3
    r = client.post(
        "/api/v1/payments",
        headers=normal_user_token_headers,
        json={
            "customer_id": cust_id,
            "amount": "50.00",
            "currency": "USD",
            "payment_date": now.date().isoformat(),
            "payment_method": "ONLINE",
        },
    )
    pay_id = r.json()["id"]
    client.post(
        f"/api/v1/payments/{pay_id}/allocations",
        headers=normal_user_token_headers,
        json={"invoice_id": inv3_id, "amount": "50.00"},
    )

    # 3. Summary check
    r = client.get("/api/v1/receivables/summary", headers=normal_user_token_headers)
    assert r.status_code == 200
    summaries = r.json()
    assert len(summaries) >= 1
    usd_summary = next(s for s in summaries if s["currency"] == "USD")

    assert usd_summary["total_issued_amount"] == "1000.00"
    assert usd_summary["total_allocated_amount"] == "50.00"
    assert usd_summary["total_outstanding_amount"] == "950.00"

    # Inv 2 (300) and Inv 3 (150 outstanding) are overdue
    assert usd_summary["overdue_invoices_count"] == 2
    assert usd_summary["total_overdue_amount"] == "450.00"

    # 4. Aging check
    r = client.get("/api/v1/receivables/aging", headers=normal_user_token_headers)
    assert r.status_code == 200
    aging_reports = r.json()
    usd_aging = next(a for a in aging_reports if a["currency"] == "USD")
    buckets = {b["bucket"]: b["outstanding_amount"] for b in usd_aging["buckets"]}

    # Inv 1: NOT_DUE -> 500
    assert buckets["NOT_DUE"] == "500.00"
    # Inv 2: 15 days -> 1_30 -> 300
    assert buckets["1_30"] == "300.00"
    # Inv 3: 40 days -> 31_60 -> 150
    assert buckets["31_60"] == "150.00"
    # Others -> 0
    assert buckets["61_90"] == "0.00"
    assert buckets["90_PLUS"] == "0.00"
