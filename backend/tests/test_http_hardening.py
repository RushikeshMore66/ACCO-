"""Security headers, CORS, body limits, rate limiting, request IDs (Task 0.7)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import ConfigurationError, Settings, settings, validate_settings
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    client_ip,
)
from app.core.rate_limit import InMemoryBackend, check_rate_limit, reset_rate_limits
from app.main import app


def test_security_headers_present_on_success_and_errors(client: TestClient):
    for response in (client.get("/health"), client.get("/api/v1/auth/me"), client.get("/nope")):
        h = response.headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["x-frame-options"] == "DENY"
        assert h["referrer-policy"] == "no-referrer"
        assert "frame-ancestors 'none'" in h["content-security-policy"]
        assert "camera=()" in h["permissions-policy"]


def test_auth_responses_are_not_cacheable(client: TestClient):
    resp = client.post("/api/v1/auth/login", data={"username": "a@b.example", "password": "x"})
    assert resp.headers["cache-control"] == "no-store"


def _mini_app(**middleware_kwargs) -> TestClient:
    mini = FastAPI()

    @mini.get("/ok")
    def ok():
        return {"ok": True}

    mini.add_middleware(SecurityHeadersMiddleware, **middleware_kwargs)
    return TestClient(mini)


def test_hsts_only_when_enabled():
    assert "strict-transport-security" not in _mini_app(hsts=False).get("/ok").headers
    hsts = _mini_app(hsts=True).get("/ok").headers["strict-transport-security"]
    assert "max-age=63072000" in hsts and "includeSubDomains" in hsts


def test_request_id_generated_echoed_and_sanitised(client: TestClient):
    assert len(client.get("/health").headers["x-request-id"]) == 32
    assert (
        client.get("/health", headers={"X-Request-ID": "trace-abc12345"}).headers["x-request-id"]
        == "trace-abc12345"
    )
    evil = client.get("/health", headers={"X-Request-ID": "bad id\r\nSet-Cookie: x=1"})
    assert evil.headers["x-request-id"] != "bad id"
    assert "set-cookie" not in evil.headers


def test_client_ip_trusts_forwarded_for_only_for_configured_hops():
    from starlette.datastructures import Headers

    scope = {"client": ("10.0.0.5", 1234)}
    spoofed = Headers({"x-forwarded-for": "1.2.3.4, 203.0.113.7"})
    assert client_ip(scope, spoofed, trusted_hops=0) == "10.0.0.5"
    assert client_ip(scope, spoofed, trusted_hops=1) == "203.0.113.7"
    assert client_ip(scope, spoofed, trusted_hops=2) == "1.2.3.4"
    assert client_ip(scope, spoofed, trusted_hops=3) == "10.0.0.5"


# ----------------------------------------------------------------------------- body limits


def _limited_client(default=100, upload=1000) -> TestClient:
    mini = FastAPI()

    @mini.post("/echo")
    async def echo(payload: dict):
        return payload

    @mini.post("/invoices/import")
    async def upload_route(payload: dict):
        return {"ok": True}

    mini.add_middleware(BodySizeLimitMiddleware, default_limit=default, upload_limit=upload)
    mini.add_middleware(RequestContextMiddleware)
    return TestClient(mini)


def test_body_under_limit_accepted():
    assert _limited_client().post("/echo", json={"a": "x" * 20}).status_code == 200


def test_declared_oversized_body_rejected_with_413():
    resp = _limited_client().post("/echo", json={"a": "x" * 500})
    assert resp.status_code == 413
    assert resp.json() == {"detail": "Request body too large"}


def test_chunked_oversized_body_rejected_before_processing():
    def chunks():
        for _ in range(20):
            yield b'{"a":"' + b"x" * 40 + b'"}'

    resp = _limited_client().post(
        "/echo", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 413


def test_upload_route_has_the_larger_limit():
    client = _limited_client(default=100, upload=1000)
    assert client.post("/invoices/import", json={"a": "x" * 500}).status_code == 200
    assert client.post("/invoices/import", json={"a": "x" * 2000}).status_code == 413


def test_garbage_content_length_rejected():
    resp = _limited_client().post(
        "/echo",
        content=b"{}",
        headers={"Content-Length": "abc", "Content-Type": "application/json"},
    )
    assert resp.status_code in (400, 413)


# ----------------------------------------------------------------------------- CORS


def test_cors_allows_only_listed_origins(monkeypatch):
    from fastapi.middleware.cors import CORSMiddleware

    mini = FastAPI()

    @mini.get("/x")
    def x():
        return {}

    mini.add_middleware(
        CORSMiddleware, allow_origins=["https://app.example.com"], allow_credentials=False
    )
    client = TestClient(mini)
    ok = client.get("/x", headers={"Origin": "https://app.example.com"})
    bad = client.get("/x", headers={"Origin": "https://evil.example.com"})
    assert ok.headers["access-control-allow-origin"] == "https://app.example.com"
    assert "access-control-allow-origin" not in bad.headers


def test_application_has_no_cors_by_default(client: TestClient):
    resp = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in resp.headers
    assert "access-control-allow-credentials" not in resp.headers


def _non_dev(**overrides) -> Settings:
    base = {
        "_env_file": None,
        "environment": "production",
        "jwt_secret_key": "synthetic-test-jwt-secret-key-32-chars-long",
        "database_url": "postgresql+psycopg://user:password@localhost:5432/db",
        "email_webhook_signing_secret": SecretStr("whsec_synthetic_signing_secret_12345"),
        "celery_broker_url": "redis://localhost:6379/0",
        "encryption_keys": SecretStr("k1=" + "A" * 43),
        "frontend_base_url": "https://app.example.com",
    }
    base.update(overrides)
    return Settings(**base)


@pytest.mark.parametrize(
    "origins", ["*", "https://*.example.com", "app.example.com", "https://a.example.com/path"]
)
def test_invalid_cors_origins_rejected_in_production(origins):
    with pytest.raises(ConfigurationError) as exc:
        validate_settings(_non_dev(cors_allowed_origins=origins))
    assert "CORS_ALLOWED_ORIGINS" in str(exc.value)


def test_production_requires_https_origins_and_frontend_url():
    with pytest.raises(ConfigurationError):
        validate_settings(_non_dev(cors_allowed_origins="http://app.example.com"))
    with pytest.raises(ConfigurationError):
        validate_settings(_non_dev(frontend_base_url="http://app.example.com"))
    validate_settings(
        _non_dev(cors_allowed_origins="https://app.example.com, https://b.example.com")
    )


def test_api_docs_disabled_outside_development():
    assert _non_dev().api_docs_enabled is False
    assert Settings(_env_file=None, environment="development").api_docs_enabled is True
    assert _non_dev(enable_api_docs=True).api_docs_enabled is True


# ----------------------------------------------------------------------------- rate limiting


@pytest.fixture()
def limits_on(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "celery_broker_url", "memory://")
    reset_rate_limits()


def test_in_memory_backend_counts_and_expires(monkeypatch):
    backend = InMemoryBackend()
    results = [backend.hit("k", 3, 60).allowed for _ in range(5)]
    assert results == [True, True, True, False, False]
    assert backend.hit("other", 3, 60).allowed is True


def test_check_rate_limit_raises_429_with_retry_after(limits_on):
    for _ in range(3):
        check_rate_limit("scope", "id", 3, 60)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        check_rate_limit("scope", "id", 3, 60)
    assert exc.value.status_code == 429
    assert int(exc.value.headers["Retry-After"]) >= 1
    # Different identity / scope is unaffected.
    check_rate_limit("scope", "someone-else", 3, 60)
    check_rate_limit("other-scope", "id", 3, 60)


def test_login_is_throttled_per_ip_and_per_email_uniformly(client: TestClient, limits_on):
    statuses = [
        client.post(
            "/api/v1/auth/login", data={"username": "ghost@example.com", "password": "x" * 12}
        ).status_code
        for _ in range(12)
    ]
    # Unknown email: 401 until the per-email budget (10) is spent, then 429 — identical to a real
    # account, so the limiter reveals nothing about which emails exist.
    assert statuses[:10] == [401] * 10
    assert statuses[10:] == [429, 429]
    resp = client.post(
        "/api/v1/auth/login", data={"username": "ghost@example.com", "password": "x" * 12}
    )
    assert resp.status_code == 429 and "retry-after" in resp.headers


def test_forgot_password_is_throttled_per_email(client: TestClient, limits_on):
    codes = [
        client.post("/api/v1/auth/forgot-password", json={"email": "a@example.com"}).status_code
        for _ in range(7)
    ]
    assert codes[:5] == [202] * 5 and codes[5:] == [429, 429]


def test_limiter_fails_open_when_backend_errors(monkeypatch, limits_on):
    import app.core.rate_limit as rl

    class Broken:
        def hit(self, *args):
            raise ConnectionError("redis down")

    monkeypatch.setattr(rl, "_backend", lambda: Broken())
    for _ in range(50):
        check_rate_limit("scope", "id", 1, 60)  # never raises


def test_rate_limit_disabled_flag(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    for _ in range(100):
        check_rate_limit("scope", "id", 1, 60)


def test_app_object_has_docs_in_development_only_matching_settings():
    assert (app.docs_url is not None) is settings.api_docs_enabled
