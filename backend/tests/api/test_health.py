"""
Legacy API test module – aligned to the foundation milestone response contract.
"""
import pytest


def test_root_endpoint(client):
    """GET / returns HTTP 200 with name and message keys."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "message" in data
    assert data["name"] == "ACCO"


def test_health_check_endpoint(client):
    """GET /api/v1/health returns ok status and service name."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data


def test_liveness_endpoint(client):
    """GET /health (flat path) also returns ok status."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
