from fastapi.testclient import TestClient


def test_register_success(client: TestClient):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["full_name"] == "Test User"
    assert "password" not in data
    assert "password_hash" not in data

def test_register_duplicate_email(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    response = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Another Org",
            "organization_slug": "another-org",
            "full_name": "Another User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"

def test_register_duplicate_slug(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    response = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Another User",
            "email": "another@example.com",
            "password": "securepassword123"
        }
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Organization slug already taken"

def test_login_success(client: TestClient):
    # Register first
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    
    # Login
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "test@example.com",
            "password": "securepassword123"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "expires_in" in data

def test_login_incorrect_password(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "test@example.com",
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_unknown_email(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "unknown@example.com",
            "password": "securepassword123"
        }
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_get_me_success(client: TestClient):
    # Register
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Test Org",
            "organization_slug": "test-org",
            "full_name": "Test User",
            "email": "test@example.com",
            "password": "securepassword123"
        }
    )
    
    # Login
    login_resp = client.post(
        "/api/v1/auth/login",
        data={
            "username": "test@example.com",
            "password": "securepassword123"
        }
    )
    token = login_resp.json()["access_token"]
    
    # Get Me
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "test@example.com"
    assert "password_hash" not in me_data

def test_get_me_unauthorized(client: TestClient):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid_token_here"}
    )
    assert response.status_code == 401

def test_get_me_missing_token(client: TestClient):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
