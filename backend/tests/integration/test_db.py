import pytest
import uuid
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.base import Base
from app.models import Organization, User, Membership, membership

# Test database URL - using a separate test database or schema
TEST_DATABASE_URL = settings.SQLALCHEMY_DATABASE_URI + "_test"

try:
    engine = create_engine(TEST_DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    DB_AVAILABLE = True
except Exception:
    DB_AVAILABLE = False

pytestmark = pytest.mark.skipif(not DB_AVAILABLE, reason="PostgreSQL test database is not available")


@pytest.fixture(scope="module")
def test_engine():
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()

def test_duplicate_membership_rejection(db_session):
    """Test that a user cannot have multiple memberships in the same organization."""
    org = Organization(name="Test Org", slug="test-org")
    user = User(email="test@example.com", display_name="Test User", password_hash="hash")
    
    db_session.add(org)
    db_session.add(user)
    db_session.commit()

    mem1 = Membership(organization_id=org.id, user_id=user.id, role=membership.Role.VIEWER)
    db_session.add(mem1)
    db_session.commit()

    # Attempt duplicate
    mem2 = Membership(organization_id=org.id, user_id=user.id, role=membership.Role.ADMIN)
    db_session.add(mem2)
    
    with pytest.raises(IntegrityError):
        db_session.commit()

def test_database_readiness_endpoint(client, monkeypatch):
    """Test readiness endpoint when DB is connected."""
    # Since we are hitting the actual app, it uses the main engine.
    # We mock get_db to use our test engine session if needed, but the requirement
    # states to test readiness when PostgreSQL is reachable.
    response = client.get("/api/v1/health/readiness")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
