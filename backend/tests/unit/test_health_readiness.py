import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from unittest.mock import patch

def test_readiness_endpoint_failure(client: TestClient):
    """Test database readiness when connection fails."""
    # Mock the DB session's execute to raise an error
    with patch("sqlalchemy.orm.Session.execute", side_effect=OperationalError("mocked", "params", "orig")):
        response = client.get("/api/v1/health/readiness")
        assert response.status_code == 503
        assert response.json()["detail"] == "Service Unavailable: Database connection failed"
