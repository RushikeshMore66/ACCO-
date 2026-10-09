"""
Tests for the ACCO root and health endpoints.

Covers:
  GET /             – root info
  GET /health       – process liveness (flat path)
  GET /api/v1/health – process liveness (versioned path)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_returns_200() -> None:
    """GET / returns HTTP 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_json() -> None:
    """GET / returns the expected JSON body."""
    response = client.get("/")
    data = response.json()
    assert data["name"] == "ACCO"
    assert data["message"] == "ACCO API is running."


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health_returns_200(path: str) -> None:
    """Health endpoints return HTTP 200."""
    response = client.get(path)
    assert response.status_code == 200


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health_json(path: str) -> None:
    """Health endpoints return the expected JSON body."""
    response = client.get(path)
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ACCO"
