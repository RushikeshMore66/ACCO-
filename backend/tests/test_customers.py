from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_create_customer(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    data = {
        "name": "Test Customer",
        "email": "test@customer.com",
    }
    r = client.post("/api/v1/customers", json=data, headers=normal_user_token_headers)
    assert r.status_code == 201
    created = r.json()
    assert created["name"] == "Test Customer"
    assert created["email"] == "test@customer.com"
    assert created["is_active"] is True

def test_list_customers(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    r = client.get("/api/v1/customers", headers=normal_user_token_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_get_customer(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    data = {"name": "Test Customer GET"}
    r = client.post("/api/v1/customers", json=data, headers=normal_user_token_headers)
    assert r.status_code == 201
    created_id = r.json()["id"]

    r = client.get(f"/api/v1/customers/{created_id}", headers=normal_user_token_headers)
    assert r.status_code == 200
    assert r.json()["id"] == created_id

def test_update_customer(client: TestClient, db_session: Session, normal_user_token_headers: dict[str, str]):
    data = {"name": "Test Customer UPDATE"}
    r = client.post("/api/v1/customers", json=data, headers=normal_user_token_headers)
    assert r.status_code == 201
    created_id = r.json()["id"]

    update_data = {"name": "Updated Customer Name"}
    r = client.patch(f"/api/v1/customers/{created_id}", json=update_data, headers=normal_user_token_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Customer Name"
