import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="session")
def app():
    """Create a FastAPI application instance for testing."""
    return create_app()


@pytest.fixture(scope="session")
def client(app):
    """Create a test client for sending synchronous HTTP requests to the app."""
    with TestClient(app) as c:
        yield c
