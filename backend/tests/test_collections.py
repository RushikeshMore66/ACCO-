from datetime import datetime, timedelta, UTC
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

def test_get_default_policy(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    r = client.get("/api/v1/collections/policy", headers=normal_user_token_headers)
    assert r.status_code == 200
    policy = r.json()
    assert policy["initial_reminder_after_days"] == 1
    assert policy["follow_up_after_days"] == 8
    assert policy["escalation_after_days"] == 31
    # Check that no DB row was created
    assert policy["id"] is None

def test_update_policy(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    policy_data = {
        "initial_reminder_after_days": 2,
        "follow_up_after_days": 10,
        "escalation_after_days": 40,
        "require_approval_before_send": False,
        "pause_collection_on_dispute": True,
        "pause_collection_on_payment_promise": False
    }
    r = client.put("/api/v1/collections/policy", headers=normal_user_token_headers, json=policy_data)
    assert r.status_code == 200
    policy = r.json()
    assert policy["initial_reminder_after_days"] == 2
    assert policy["require_approval_before_send"] is False
    assert policy["id"] is not None

def test_invalid_policy_thresholds(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    # Invalid: follow up <= initial reminder
    r = client.put("/api/v1/collections/policy", headers=normal_user_token_headers, json={
        "initial_reminder_after_days": 5,
        "follow_up_after_days": 4,
        "escalation_after_days": 31,
        "require_approval_before_send": True,
        "pause_collection_on_dispute": True,
        "pause_collection_on_payment_promise": True
    })
    assert r.status_code == 422

    # Invalid: initial reminder < 1
    r = client.put("/api/v1/collections/policy", headers=normal_user_token_headers, json={
        "initial_reminder_after_days": 0,
        "follow_up_after_days": 8,
        "escalation_after_days": 31,
        "require_approval_before_send": True,
        "pause_collection_on_dispute": True,
        "pause_collection_on_payment_promise": True
    })
    assert r.status_code == 422

def test_collection_queue_and_summary(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    now = datetime.now(UTC)
    
    # Customer
    r = client.post("/api/v1/customers", headers=normal_user_token_headers, json={"name": "Collection Cust"})
    cust_id = r.json()["id"]

    # Inv 1: Not due (5 days in future) -> NOT_DUE
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "invoice_number": "INV-COL1",
        "issue_date": now.isoformat(), "due_date": (now + timedelta(days=5)).isoformat(),
        "currency": "USD", "total_amount": "500.00"
    })
    inv1_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv1_id}/issue", headers=normal_user_token_headers)

    # Inv 2: Overdue by 5 days -> EARLY_OVERDUE (default thresholds: 1, 8, 31)
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "invoice_number": "INV-COL2",
        "issue_date": (now - timedelta(days=35)).isoformat(), "due_date": (now - timedelta(days=5)).isoformat(),
        "currency": "USD", "total_amount": "300.00"
    })
    inv2_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv2_id}/issue", headers=normal_user_token_headers)

    # Inv 3: Overdue by 15 days -> FOLLOW_UP
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "invoice_number": "INV-COL3",
        "issue_date": (now - timedelta(days=45)).isoformat(), "due_date": (now - timedelta(days=15)).isoformat(),
        "currency": "USD", "total_amount": "200.00"
    })
    inv3_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv3_id}/issue", headers=normal_user_token_headers)

    # Inv 4: Overdue by 40 days -> ESCALATION_REVIEW
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "invoice_number": "INV-COL4",
        "issue_date": (now - timedelta(days=70)).isoformat(), "due_date": (now - timedelta(days=40)).isoformat(),
        "currency": "EUR", "total_amount": "1000.00"
    })
    inv4_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv4_id}/issue", headers=normal_user_token_headers)
    
    # Inv 5: fully paid -> should be excluded from queue
    r = client.post("/api/v1/invoices", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "invoice_number": "INV-COL5",
        "issue_date": (now - timedelta(days=70)).isoformat(), "due_date": (now - timedelta(days=40)).isoformat(),
        "currency": "USD", "total_amount": "100.00"
    })
    inv5_id = r.json()["id"]
    client.post(f"/api/v1/invoices/{inv5_id}/issue", headers=normal_user_token_headers)
    # Pay Inv 5
    r = client.post("/api/v1/payments", headers=normal_user_token_headers, json={
        "customer_id": cust_id, "amount": "100.00", "currency": "USD", 
        "payment_date": now.date().isoformat(), "payment_method": "ONLINE"
    })
    pay_id = r.json()["id"]
    client.post(f"/api/v1/payments/{pay_id}/allocations", headers=normal_user_token_headers, json={
        "invoice_id": inv5_id, "amount": "100.00"
    })
    
    # Fetch queue
    r = client.get("/api/v1/collections/queue", headers=normal_user_token_headers)
    assert r.status_code == 200
    queue = r.json()
    
    # Should only contain inv 1, 2, 3, 4 (inv 5 is paid)
    assert len(queue) == 4
    
    # Order should be ESCALATION_REVIEW (40 days), FOLLOW_UP (15 days), EARLY_OVERDUE (5 days), NOT_DUE (0 days)
    stages = [item["collection_stage"] for item in queue]
    assert stages == ["ESCALATION_REVIEW", "FOLLOW_UP", "EARLY_OVERDUE", "NOT_DUE"]
    
    # Check currency grouping in summary
    r = client.get("/api/v1/collections/summary", headers=normal_user_token_headers)
    assert r.status_code == 200
    summaries = r.json()
    assert len(summaries) == 2  # USD and EUR
    
    usd_sum = next(s for s in summaries if s["currency"] == "USD")
    eur_sum = next(s for s in summaries if s["currency"] == "EUR")
    
    assert usd_sum["eligible_invoices_count"] == 3 # inv 1, 2, 3
    assert eur_sum["eligible_invoices_count"] == 1 # inv 4
    
    assert usd_sum["overdue_invoices_count"] == 2 # inv 2, 3
    assert eur_sum["overdue_invoices_count"] == 1 # inv 4
