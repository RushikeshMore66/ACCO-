"""Fixed-window rate limiting for abuse-prone endpoints.

Backends: Redis (shared across API replicas; used whenever the Celery broker is Redis) or an
in-process dictionary (development/tests, single process). Redis failures *fail open* with an
error log: sign-in remains protected by the per-account lockout, and an outage of the limiter
must not take authentication down.

Keys never contain raw emails/IPs beyond a short hash prefix, so Redis holds no PII.
"""

import hashlib
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.request_context import get_request_context

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int


class InMemoryBackend:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[int, float]] = {}

    def hit(self, key: str, limit: int, window: int) -> RateLimitResult:
        now = time.monotonic()
        with self._lock:
            count, reset_at = self._buckets.get(key, (0, now + window))
            if now >= reset_at:
                count, reset_at = 0, now + window
            count += 1
            self._buckets[key] = (count, reset_at)
            if len(self._buckets) > 50_000:  # opportunistic cleanup
                self._buckets = {k: v for k, v in self._buckets.items() if v[1] > now}
        return RateLimitResult(count <= limit, max(1, int(reset_at - now)))

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


class RedisBackend:
    def __init__(self, url: str) -> None:
        import redis

        self._client = redis.Redis.from_url(url, socket_timeout=0.25, socket_connect_timeout=0.25)

    def hit(self, key: str, limit: int, window: int) -> RateLimitResult:
        pipe = self._client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = pipe.execute()
        if ttl is None or ttl < 0:
            self._client.expire(key, window)
            ttl = window
        return RateLimitResult(int(count) <= limit, max(1, int(ttl)))


_memory = InMemoryBackend()
_redis: RedisBackend | None = None
_redis_url_checked: str | None = None


def _backend() -> InMemoryBackend | RedisBackend:
    global _redis, _redis_url_checked
    url = settings.celery_broker_url
    if url.startswith(("redis://", "rediss://")):
        if _redis is None or _redis_url_checked != url:
            _redis, _redis_url_checked = RedisBackend(url), url
        return _redis
    return _memory


def reset_rate_limits() -> None:
    """Test helper: forget all in-memory counters."""
    _memory.reset()


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]


def check_rate_limit(scope: str, identity: str, limit: int, window_seconds: int) -> None:
    """Raise HTTP 429 (with Retry-After) once ``identity`` exceeds ``limit`` per window."""
    if not settings.rate_limit_enabled:
        return
    key = f"acco:rl:{scope}:{_fingerprint(identity)}"
    try:
        result = _backend().hit(key, limit, window_seconds)
    except Exception:  # noqa: BLE001 - limiter outage must not break the endpoint
        logger.error("Rate limiter backend unavailable; failing open for scope '%s'", scope)
        return
    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again later.",
            headers={"Retry-After": str(result.retry_after)},
        )


def client_identity(request: Request) -> str:
    ctx = get_request_context()
    if ctx.ip_address:
        return ctx.ip_address
    return request.client.host if request.client else "unknown"


def ip_rate_limit(scope: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """FastAPI dependency limiting by client IP."""

    def dependency(request: Request) -> None:
        check_rate_limit(f"{scope}:ip", client_identity(request), limit, window_seconds)

    return dependency
