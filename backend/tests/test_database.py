from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.organization import Organization
from app.models.user import User

# Use an in-memory SQLite database for fast, isolated ORM tests.
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def engine():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()

from sqlalchemy import text as import_text


@pytest.fixture(scope="function")
def db_session(engine):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    # Enable foreign keys for SQLite
    db.execute(import_text("PRAGMA foreign_keys=ON"))
    try:
        yield db
    finally:
        db.close()


def test_insert_and_query_organization(db_session):
    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    db_session.commit()
    
    fetched = db_session.query(Organization).filter_by(slug="test-org").first()
    assert fetched is not None
    assert fetched.name == "Test Org"
    assert fetched.is_active is True
    assert fetched.id is not None

def test_insert_and_query_user(db_session):
    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    db_session.commit()

    user = User(organization_id=org.id, email="test@example.com", full_name="Test User", password_hash="hash")
    db_session.add(user)
    db_session.commit()
    
    fetched = db_session.query(User).filter_by(email="test@example.com").first()
    assert fetched is not None
    assert fetched.full_name == "Test User"
    assert fetched.is_active is True
    assert fetched.organization_id == org.id

def test_foreign_key_constraint(db_session):
    # Try inserting user without valid org
    import uuid
    user = User(organization_id=uuid.uuid4(), email="test2@example.com", full_name="Test User", password_hash="hash")
    db_session.add(user)
    with pytest.raises(IntegrityError):
        db_session.commit()

def test_readiness_endpoint_no_db(client):
    """Test readiness endpoint returns 503 when DB is missing."""
    with patch("app.db.session.engine", None):
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["detail"] == "Database is not configured."

def test_readiness_endpoint_unreachable_db(client):
    """Test readiness endpoint returns 503 when DB is unreachable."""
    mock_engine = MagicMock()
    mock_engine.connect.side_effect = Exception("Connection failed")
    
    with patch("app.db.session.engine", mock_engine):
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["detail"] == "Database is unreachable."

def test_readiness_endpoint_ok(client):
    """Test readiness endpoint returns 200 when DB is reachable."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    
    with patch("app.db.session.engine", mock_engine):
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 200
        assert response.json()["database"] == "reachable"
