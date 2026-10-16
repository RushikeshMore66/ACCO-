"""Pure-ASGI middleware: request context/IDs, security headers, body-size limits.

Pure ASGI (not BaseHTTPMiddleware) so context variables propagate to endpoints and
streaming bodies are never buffered.
"""

import re
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.core.request_context import RequestContext, reset_request_context, set_request_context

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def client_ip(scope: Scope, headers: Headers, trusted_hops: int) -> str | None:
    """Client address; ``X-Forwarded-For`` is honoured only for configured trusted proxy hops."""
    if trusted_hops > 0:
        forwarded = [p.strip() for p in headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(forwarded) >= trusted_hops:
            return forwarded[-trusted_hops][:64]
    client = scope.get("client")
    return client[0][:64] if client else None


class RequestContextMiddleware:
    """Assigns/propagates a request id, records client IP + UA, echoes ``X-Request-ID``."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        incoming = headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        ctx = RequestContext(
            request_id=request_id,
            ip_address=client_ip(scope, headers, settings.trusted_proxy_hops),
            user_agent=headers.get("user-agent"),
        )
        token = set_request_context(ctx)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            reset_request_context(token)
