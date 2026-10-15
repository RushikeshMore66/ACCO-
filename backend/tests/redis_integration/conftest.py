"""Real Redis broker harness (docs/tasks.md Task 0.1 gate).

Requires ACCO_TEST_REDIS_URL. Unset -> skip. Set but unreachable/unapproved -> fail.
Only loopback hosts are approved so the test can never touch hosted Redis.
"""

import os
from urllib.parse import urlparse

import pytest
import redis

APPROVED_HOSTS = {"localhost", "127.0.0.1", "::1"}


def validated_redis_url() -> str:
    raw = os.environ.get("ACCO_TEST_REDIS_URL", "").strip()
    if not raw:
        pytest.skip("ACCO_TEST_REDIS_URL not set; real Redis broker test skipped.")
    parsed = urlparse(raw)
    if parsed.scheme != "redis":
        pytest.fail("ACCO_TEST_REDIS_URL must use the redis:// scheme.")
    if (parsed.hostname or "").lower() not in APPROVED_HOSTS:
        pytest.fail("Refusing to run: ACCO_TEST_REDIS_URL host is not an approved local host.")
    db = parsed.path.lstrip("/")
    if not db.isdigit() or int(db) == 0:
        pytest.fail("ACCO_TEST_REDIS_URL must name a dedicated non-zero Redis database (e.g. /15).")
    return raw


@pytest.fixture(scope="session")
def redis_url() -> str:
    return validated_redis_url()


@pytest.fixture(scope="session")
def redis_client(redis_url: str):
    client = redis.Redis.from_url(redis_url, socket_connect_timeout=5, socket_timeout=5)
    try:
        client.ping()
    except redis.RedisError as exc:
        pytest.fail(f"Configured test Redis is unavailable: {type(exc).__name__}")
    yield client
    client.close()
