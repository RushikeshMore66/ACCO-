"""Shared test fixtures for the ACCO backend test suite."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import text as import_text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.db.session import get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(autouse=True, scope="session")
def _fast_password_hashing():
    """Argon2id with minimal cost so the suite is not dominated by hashing (tests only)."""
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher

    from app.core import security

    original = security.password_hash
    security.password_hash = PasswordHash(
        (Argon2Hasher(time_cost=1, memory_cost=64, parallelism=1),)
    )
    yield
    security.password_hash = original


@pytest.fixture(scope="function")
def engine():
    engine = create_engine(
        TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
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
def session_headers(db_session):
    """Factory: real, MFA-verified session headers for a user created directly in the DB."""
    from app.services.auth_service import issue_session

    def _make(user, *, mfa_verified: bool = True) -> dict[str, str]:
        tokens = issue_session(db_session, user, mfa_verified=mfa_verified)
        db_session.commit()
        return {"Authorization": f"Bearer {tokens.access_token}"}

    return _make


def enroll_mfa(client: TestClient, enrollment_token: str) -> tuple[dict, str]:
    """Drive the real MFA enrolment endpoints; returns (session JSON, totp secret)."""
    from app.core.totp import generate_totp

    headers = {"Authorization": f"Bearer {enrollment_token}"}
    setup = client.post("/api/v1/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    enable = client.post(
        "/api/v1/auth/mfa/enable", json={"code": generate_totp(secret)}, headers=headers
    )
    assert enable.status_code == 200, enable.text
    return enable.json(), secret


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
            "password": "securepassword123",
        },
    )
    # Login: the OWNER is privileged, so the first login returns a limited MFA-enrolment token.
    response = client.post(
        "/api/v1/auth/login", data={"username": "test@example.com", "password": "securepassword123"}
    )
    body = response.json()
    assert body["mfa_enrollment_required"] is True
    session, _ = enroll_mfa(client, body["access_token"])
    return {"Authorization": f"Bearer {session['session']['access_token']}"}
