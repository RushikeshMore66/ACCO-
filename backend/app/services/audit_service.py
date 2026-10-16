"""Append-only audit trail.

``record_audit_event`` only *adds* to the caller's session; it never commits. The event
therefore commits (or rolls back) atomically with the state change it describes.
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from app.core.request_context import MAX_USER_AGENT_LENGTH, get_request_context
from app.models.audit_event import AuditActorType, AuditEvent
from app.models.user import User

REDACTED = "[REDACTED]"
_SENSITIVE_KEY = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|authorization|hash|totp|recovery|backup_code|"
    r"credential|private[_-]?key)",
    re.IGNORECASE,
)
_MAX_DEPTH = 6


def _jsonable(value: Any, depth: int = 0) -> Any:
    if depth > _MAX_DEPTH:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        return {
            str(k): (REDACTED if _SENSITIVE_KEY.search(str(k)) else _jsonable(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, list | tuple | set | frozenset):
        return [_jsonable(v, depth + 1) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return str(value)


def sanitize_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """JSON-safe copy of ``payload`` with sensitive keys redacted."""
    return None if payload is None else _jsonable(payload)


def diff_fields(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict, dict]:
    """Return ``(before, after)`` reduced to the keys whose values actually changed."""
    changed = [k for k in after if before.get(k) != after.get(k)]
    return {k: before.get(k) for k in changed}, {k: after.get(k) for k in changed}


def snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    """Capture ``fields`` of an ORM object for before/after diffs."""
    return {f: getattr(obj, f, None) for f in fields}


def record_audit_event(
    db: Session,
    *,
    action: str,
    actor: User | None = None,
    actor_type: AuditActorType | None = None,
    organization_id: uuid.UUID | str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> AuditEvent:
    ctx = get_request_context()
    if actor_type is None:
        actor_type = AuditActorType.USER if actor is not None else AuditActorType.SYSTEM
    org: uuid.UUID | str | None = organization_id
    if org is None and actor is not None:
        org = actor.organization_id
    if isinstance(org, str):
        org = uuid.UUID(org)
    event = AuditEvent(
        organization_id=org,
        actor_type=actor_type,
        actor_user_id=actor.id if actor is not None else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        request_id=ctx.request_id,
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent[:MAX_USER_AGENT_LENGTH] if ctx.user_agent else None,
        before=sanitize_payload(before),
        after=sanitize_payload(after),
    )
    db.add(event)
    return event
