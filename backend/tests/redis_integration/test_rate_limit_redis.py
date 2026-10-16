"""Rate limiter against a real Redis server (Task 0.7)."""

import uuid

import pytest

from app.core.rate_limit import RedisBackend

pytestmark = pytest.mark.redis_integration


def test_redis_backend_counts_blocks_and_expires(redis_url, redis_client):
    backend = RedisBackend(redis_url)
    key = f"acco:rl:test:{uuid.uuid4().hex}"
    try:
        outcomes = [backend.hit(key, 3, 30).allowed for _ in range(5)]
        assert outcomes == [True, True, True, False, False]
        blocked = backend.hit(key, 3, 30)
        assert 1 <= blocked.retry_after <= 30
        assert 0 < redis_client.ttl(key) <= 30  # window always has an expiry (no stuck keys)
    finally:
        redis_client.delete(key)


def test_redis_keys_contain_no_raw_identity(redis_client):
    # Keys are built from a hash prefix, never the raw email/IP.
    from app.core.rate_limit import _fingerprint

    assert "@" not in _fingerprint("someone@example.com")
    assert "203.0.113.9" not in _fingerprint("203.0.113.9")
