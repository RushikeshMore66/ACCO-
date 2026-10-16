"""Per-request context (request id, client IP, user agent) for logs and audit events."""

from contextvars import ContextVar, Token
from dataclasses import dataclass

MAX_USER_AGENT_LENGTH = 255


@dataclass(frozen=True)
class RequestContext:
    request_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


_EMPTY = RequestContext()
_current: ContextVar[RequestContext] = ContextVar("acco_request_context", default=_EMPTY)


def set_request_context(ctx: RequestContext) -> Token[RequestContext]:
    return _current.set(ctx)


def reset_request_context(token: Token[RequestContext]) -> None:
    _current.reset(token)


def get_request_context() -> RequestContext:
    return _current.get()
