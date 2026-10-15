from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.organization import Organization
from app.models.user import User, UserRole


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

    user = User(
        organization_id=org.id,
        email="test@example.com",
        full_name="Test User",
        password_hash="hash",
        role=UserRole.OWNER,
    )
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

    user = User(
        organization_id=uuid.uuid4(),
        email="test2@example.com",
        full_name="Test User",
        password_hash="hash",
        role=UserRole.OWNER,
    )
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


def test_build_engine_postgresql_includes_keepalives():
    """Verify PostgreSQL connections receive keepalives and connect timeouts."""
    from app.db.session import _build_engine

    with patch("app.db.session.create_engine") as mock_ce:
        _build_engine("postgresql+psycopg://user:pass@localhost:5432/db")
        mock_ce.assert_called_once()
        _, kwargs = mock_ce.call_args
        assert kwargs["pool_pre_ping"] is True
        assert kwargs["connect_args"]["keepalives"] == 1
        assert kwargs["connect_args"]["connect_timeout"] == 10
        assert kwargs["pool_size"] == 5
        assert kwargs["max_overflow"] == 5
        assert kwargs["pool_recycle"] == 300
        assert kwargs["pool_timeout"] == 15.0


def test_build_engine_sqlite_omits_unsupported_pg_args():
    """Verify SQLite connections do NOT receive PostgreSQL-specific connect_args."""
    from app.db.session import _build_engine

    with patch("app.db.session.create_engine") as mock_ce:
        _build_engine("sqlite:///:memory:")
        mock_ce.assert_called_once()
        _, kwargs = mock_ce.call_args
        assert kwargs["connect_args"] == {}


def test_settings_database_pool_validation():
    """Verify Settings validates database pool bounds."""
    from pydantic import ValidationError

    from app.core.config import Settings

    valid_settings = Settings(database_pool_size=10, database_max_overflow=5)
    assert valid_settings.database_pool_size == 10

    with pytest.raises(ValidationError):
        Settings(database_pool_size=0)  # ge=1

    with pytest.raises(ValidationError):
        Settings(database_pool_size=100)  # le=50


def test_dispose_engine_argument_forwarding():
    """Verify dispose_engine passes the close argument to engine.dispose."""
    from app.db.session import dispose_engine

    # Default call should pass close=True
    mock_engine = MagicMock()
    with patch("app.db.session.engine", mock_engine):
        dispose_engine()
        mock_engine.dispose.assert_called_once_with(close=True)

    # Explicit close=False (used by post-fork child init)
    mock_engine = MagicMock()
    with patch("app.db.session.engine", mock_engine):
        dispose_engine(close=False)
        mock_engine.dispose.assert_called_once_with(close=False)

    # Explicit close=True (used by worker shutdown)
    mock_engine = MagicMock()
    with patch("app.db.session.engine", mock_engine):
        dispose_engine(close=True)
        mock_engine.dispose.assert_called_once_with(close=True)

    # When engine is None, should safely no-op without error
    with patch("app.db.session.engine", None):
        dispose_engine(close=False)


def test_celery_worker_process_init_disposes_without_closing():
    """Verify Celery worker child initialization requests pool disposal with close=False."""
    from app.workers.celery_app import on_worker_process_init

    with patch("app.db.session.dispose_engine") as mock_disp:
        on_worker_process_init()
        mock_disp.assert_called_once_with(close=False)


def test_celery_worker_process_shutdown_disposes_with_closing():
    """Verify Celery worker shutdown requests pool disposal with close=True."""
    from app.workers.celery_app import on_worker_process_shutdown

    with patch("app.db.session.dispose_engine") as mock_disp:
        on_worker_process_shutdown()
        mock_disp.assert_called_once_with(close=True)


@pytest.mark.asyncio
async def test_fastapi_lifespan_cleanup_normal_shutdown():
    """Verify FastAPI lifespan executes engine disposal on normal application shutdown."""
    from app.main import app, lifespan

    with patch("app.main.dispose_engine") as mock_disp:
        async with lifespan(app):
            mock_disp.assert_not_called()
        mock_disp.assert_called_once_with()


@pytest.mark.asyncio
async def test_fastapi_lifespan_cleanup_on_exception():
    """Verify FastAPI lifespan executes engine disposal in finally block when an exception occurs."""
    from app.main import app, lifespan

    with patch("app.main.dispose_engine") as mock_disp:
        with pytest.raises(RuntimeError, match="Simulated lifespan crash"):
            async with lifespan(app):
                raise RuntimeError("Simulated lifespan crash")
        mock_disp.assert_called_once_with()
