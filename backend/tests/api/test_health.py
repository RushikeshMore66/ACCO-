def test_root_endpoint(client):
    """Test the root endpoint returns app metadata and links."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert data["health_check"] == "/api/v1/health"


def test_health_check_endpoint(client):
    """Test the liveness/health endpoint returns ok status."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data
    assert "version" in data
    assert "environment" in data
    assert "server_time_utc" in data


def test_liveness_endpoint(client):
    """Test minimal liveness probe."""
    response = client.get("/api/v1/health/liveness")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
