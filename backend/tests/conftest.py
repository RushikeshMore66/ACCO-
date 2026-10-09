"""Shared test fixtures for the ACCO backend test suite."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Provide a synchronous TestClient for the FastAPI application."""
    with TestClient(app) as c:
        yield c
