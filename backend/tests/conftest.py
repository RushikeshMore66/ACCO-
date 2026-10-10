"""Shared test fixtures for the ACCO backend test suite."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import text as import_text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
import app.models
from app.db.session import get_db
from app.main import app

from sqlalchemy.pool import StaticPool

TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def engine():
    engine = create_engine(
        TEST_DATABASE_URL, 
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()

@pytest.fixture(scope="function")
def db_session(engine):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    db.execute(import_text("PRAGMA foreign_keys=ON"))
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="function")
def client(db_session) -> TestClient:
    """Provide a synchronous TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def normal_user_token_headers(client: TestClient) -> dict[str, str]:
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
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
