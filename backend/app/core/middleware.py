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


_SECURITY_HEADERS: list[tuple[str, str]] = [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Cross-Origin-Resource-Policy", "same-site"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"),
    # This service only emits JSON: forbid loading/embedding anything from its responses.
    ("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
]
_HSTS = ("Strict-Transport-Security", "max-age=63072000; includeSubDomains")


class SecurityHeadersMiddleware:
    """Adds OWASP-recommended response headers to every response (including errors).

    HSTS is emitted outside development (browsers ignore it over plain http anyway). Responses
    from auth and account endpoints are marked non-cacheable.
    """

    def __init__(self, app: ASGIApp, hsts: bool = False, docs_paths: tuple[str, ...] = ()) -> None:
        self.app = app
        self.hsts = hsts
        self.docs_paths = docs_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        is_docs = path in self.docs_paths

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in _SECURITY_HEADERS:
                    if is_docs and name == "Content-Security-Policy":
                        continue  # Swagger/ReDoc need scripts; only mounted when docs are enabled
                    headers.setdefault(name, value)
                if self.hsts:
                    headers.setdefault(*_HSTS)
                if "/auth/" in path or path.endswith("/auth") or "/team" in path:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodySizeLimitMiddleware:
    """Rejects oversized request bodies with 413 before the application buffers them.

    Checks ``Content-Length`` up front and also counts streamed bytes (chunked uploads cannot
    bypass the limit). Upload routes (CSV import) get the larger ``upload_limit``.
    """

    def __init__(
        self,
        app: ASGIApp,
        default_limit: int,
        upload_limit: int,
        upload_path_suffixes: tuple[str, ...] = ("/invoices/import",),
    ) -> None:
        self.app = app
        self.default_limit = default_limit
        self.upload_limit = upload_limit
        self.upload_path_suffixes = upload_path_suffixes

    def _limit_for(self, path: str) -> int:
        return self.upload_limit if path.endswith(self.upload_path_suffixes) else self.default_limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for(scope.get("path", ""))
        declared = Headers(scope=scope).get("content-length")
        if declared is not None:
            try:
                too_big = int(declared) > limit
            except ValueError:
                too_big = True
            if too_big:
                await self._reject(scope, receive, send)
                return

        received = 0
        started = False
        rejected = False

        async def counting_receive() -> Message:
            nonlocal received, rejected
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit and not rejected and not started:
                    # Answer 413 immediately and tell the app the client went away, so an
                    # oversized chunked upload is never buffered or processed.
                    rejected = True
                    await self._reject(scope, receive, send)
                    return {"type": "http.disconnect"}
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if rejected:
                return  # response already sent; swallow whatever the aborted app tries to emit
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        await self.app(scope, counting_receive, tracking_send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        body = b'{"detail":"Request body too large"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
