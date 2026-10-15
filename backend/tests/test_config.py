"""
Tests for ACCO configuration hardening, environment classification,
and fail-closed runtime validation (Task 0.1).
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import ConfigurationError, Settings, validate_settings
from app.main import app, lifespan


def _make_valid_non_dev_settings(**overrides) -> Settings:
    """Helper creating a syntactically valid non-development Settings instance without .env."""
    defaults = {
        "_env_file": None,
        "environment": "staging",
        "jwt_secret_key": "synthetic-test-jwt-secret-key-32-chars-long",
        "database_url": "postgresql+psycopg://user:password@localhost:5432/db",
        "email_webhook_signing_secret": SecretStr("whsec_synthetic_signing_secret_12345"),
        "celery_broker_url": "redis://localhost:6379/0",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_valid_development_configuration():
    """Development environment permits developer-friendly defaults without secrets."""
    s = Settings(_env_file=None, environment="development")
    assert s.is_development is True
    # Should not raise any error
    result = validate_settings(s)
    assert result is s


def test_valid_test_and_production_configuration():
    """Test and production environments pass when all required settings are provided."""
    for env in ("test", "staging", "production"):
        s = _make_valid_non_dev_settings(environment=env)
        assert s.is_development is False
        validated = validate_settings(s)
        assert validated is s


def test_missing_jwt_secret_in_non_dev():
    """Missing ACCO_JWT_SECRET_KEY in non-development fails closed."""
    s = _make_valid_non_dev_settings(jwt_secret_key=None)
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s)
    assert "ACCO_JWT_SECRET_KEY is required" in str(exc_info.value)


def test_missing_database_url_in_non_dev():
    """Missing ACCO_DATABASE_URL in non-development fails closed."""
    s = _make_valid_non_dev_settings(database_url=None)
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s)
    assert "ACCO_DATABASE_URL is required" in str(exc_info.value)


def test_missing_webhook_signing_secret_in_non_dev():
    """Missing ACCO_EMAIL_WEBHOOK_SIGNING_SECRET in non-development fails closed."""
    s = _make_valid_non_dev_settings(email_webhook_signing_secret=None)
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s)
    assert "ACCO_EMAIL_WEBHOOK_SIGNING_SECRET is required" in str(exc_info.value)


def test_missing_or_in_memory_celery_broker_in_non_dev():
    """In-memory or missing Celery broker is rejected in non-development."""
    # Empty broker
    s_empty = _make_valid_non_dev_settings(celery_broker_url="")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_empty)
    assert "ACCO_CELERY_BROKER_URL is required" in str(exc_info.value)

    # In-memory broker (default dev broker)
    s_mem = _make_valid_non_dev_settings(celery_broker_url="memory://")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_mem)
    assert "In-memory brokers are not permitted" in str(exc_info.value)

    # Cache in-memory broker
    s_cache_mem = _make_valid_non_dev_settings(celery_broker_url="cache+memory://")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_cache_mem)
    assert "In-memory brokers are not permitted" in str(exc_info.value)


def test_malformed_celery_broker_in_non_dev():
    """Malformed or non-redis scheme broker URLs fail validation."""
    # Wrong scheme
    s_http = _make_valid_non_dev_settings(celery_broker_url="http://localhost:6379")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_http)
    assert "must use 'redis://' or 'rediss://' scheme" in str(exc_info.value)

    # Missing netloc / host
    s_nohost = _make_valid_non_dev_settings(celery_broker_url="redis://")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_nohost)
    assert "missing host or network location" in str(exc_info.value)


def test_valid_redis_and_rediss_broker_urls():
    """Standard redis:// and TLS rediss:// URLs are accepted."""
    s_redis = _make_valid_non_dev_settings(celery_broker_url="redis://localhost:6379/0")
    validate_settings(s_redis)

    s_rediss = _make_valid_non_dev_settings(
        celery_broker_url="rediss://:secretpass@redis.example.com:6380/1"
    )
    validate_settings(s_rediss)


def test_blank_and_whitespace_only_values():
    """Whitespace-only values for required settings are treated as missing."""
    s_ws_jwt = _make_valid_non_dev_settings(jwt_secret_key="   \t\n  ")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_ws_jwt)
    assert "ACCO_JWT_SECRET_KEY is required" in str(exc_info.value)

    s_ws_db = _make_valid_non_dev_settings(database_url="   ")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_ws_db)
    assert "ACCO_DATABASE_URL is required" in str(exc_info.value)

    s_ws_wh = _make_valid_non_dev_settings(email_webhook_signing_secret=SecretStr("   "))
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_ws_wh)
    assert "ACCO_EMAIL_WEBHOOK_SIGNING_SECRET is required" in str(exc_info.value)

    s_ws_broker = _make_valid_non_dev_settings(celery_broker_url="   ")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_ws_broker)
    assert "ACCO_CELERY_BROKER_URL is required" in str(exc_info.value)

    s_ws_env = _make_valid_non_dev_settings(environment="   ")
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_ws_env)
    assert "ACCO_ENVIRONMENT cannot be empty" in str(exc_info.value)


def test_unknown_environment_not_treated_as_development():
    """Unknown environment names are classified as non-development and enforce required settings."""
    s_unknown = Settings(_env_file=None, environment="unknown_env_custom")
    assert s_unknown.is_development is False
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s_unknown)
    err = str(exc_info.value)
    assert "Configuration validation failed for environment 'unknown_env_custom'" in err
    assert "ACCO_JWT_SECRET_KEY is required" in err
    assert "ACCO_DATABASE_URL is required" in err


def test_validation_failure_does_not_expose_secrets():
    """Validation error messages must never echo secret values or passwords."""
    sensitive_db_password = "super-confidential-db-password-999"
    sensitive_webhook_key = "whsec_confidential_webhook_key_777"
    sensitive_jwt = "jwt_confidential_secret_888"

    # Broker is invalid, but other sensitive values are populated
    s = Settings(
        _env_file=None,
        environment="production",
        jwt_secret_key=sensitive_jwt,
        database_url=f"postgresql+psycopg://user:{sensitive_db_password}@localhost:5432/db",
        email_webhook_signing_secret=SecretStr(sensitive_webhook_key),
        celery_broker_url="memory://",  # Invalid in production
    )
    with pytest.raises(ConfigurationError) as exc_info:
        validate_settings(s)

    error_message = str(exc_info.value)
    assert sensitive_db_password not in error_message
    assert sensitive_webhook_key not in error_message
    assert sensitive_jwt not in error_message


def test_startup_validation_occurs_before_requests_accepted():
    """FastAPI startup lifespan fails fast before requests can be handled if configuration is invalid."""
    invalid_settings = _make_valid_non_dev_settings(jwt_secret_key=None)

    custom_app = FastAPI(lifespan=lifespan)

    @custom_app.get("/test-endpoint")
    def test_endpoint():
        return {"ok": True}

    with (
        patch("app.main.settings", invalid_settings),
        pytest.raises(ConfigurationError) as exc_info,
        TestClient(custom_app),
    ):
        pass
    assert "ACCO_JWT_SECRET_KEY is required" in str(exc_info.value)


def test_existing_health_and_readiness_with_valid_settings():
    """Existing /health, /api/v1/health and /api/v1/health/ready endpoints continue to work."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn

    with patch("app.db.session.engine", mock_engine), TestClient(app) as test_client:
        res_root = test_client.get("/")
        assert res_root.status_code == 200

        res_health = test_client.get("/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "ok"

        res_ready = test_client.get("/api/v1/health/ready")
        assert res_ready.status_code == 200
        assert res_ready.json()["database"] == "reachable"
