"""Automatic audit capture for tenant-owned business entities.

A SQLAlchemy ``before_flush`` hook records an ``AuditEvent`` (create / update / delete with a
changed-fields before/after diff) for every audited model, in the *same* transaction as the
change. That makes "every state change emits an audit event" structural instead of relying on
each endpoint to remember. Semantic events (login, approve, reverse, ...) are recorded
explicitly through ``audit_service.record_audit_event``.

Actor attribution comes from ``session.info`` (set by ``mark_session_actor``), because FastAPI
runs sync dependencies and endpoints in separate worker threads whose context variables do not
propagate back; the request-scoped session is shared between them.
"""

import uuid
from typing import Any

from sqlalchemy import JSON, Text, event, inspect
from sqlalchemy.orm import Session

from app.core.request_context import MAX_USER_AGENT_LENGTH, get_request_context
from app.models.audit_event import AuditActorType, AuditEvent
from app.models.collection_policy import CollectionPolicy
from app.models.collection_workflow import (
    CollectionDispute,
    CollectionMessage,
    PaymentPromise,
)
from app.models.customer import Customer
from app.models.email_delivery import EmailDelivery
from app.models.invoice import Invoice
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_reversal import PaymentReversal
from app.models.reply_analysis import CustomerReplyAnalysis
from app.models.user import User
from app.services.audit_service import REDACTED, sanitize_payload

ACTOR_USER_ID = "audit_actor_user_id"
ACTOR_ORG_ID = "audit_actor_org_id"
ACTOR_TYPE = "audit_actor_type"

_NOISE = {"created_at", "updated_at"}
_MAX_VALUE_LENGTH = 200

# entity label -> (excluded columns, columns whose *value* is replaced by a placeholder)
_SPECS: dict[type, tuple[str, set[str], set[str]]] = {
    Customer: (
        "customer",
        set(),
        {"email", "phone", "billing_address", "tax_identifier", "contact_name"},
    ),
    Invoice: ("invoice", set(), set()),
    Payment: ("payment", set(), set()),
    PaymentAllocation: ("payment_allocation", set(), set()),
    PaymentReversal: ("payment_reversal", set(), set()),
    CollectionPolicy: ("collection_policy", set(), set()),
    CollectionMessage: ("collection_message", {"subject"}, set()),
    PaymentPromise: ("payment_promise", set(), set()),
    CollectionDispute: ("collection_dispute", set(), set()),
    EmailDelivery: ("email_delivery", {"subject_snapshot"}, {"recipient_email"}),
    CustomerReplyAnalysis: ("customer_reply_analysis", set(), set()),
    User: (
        "user",
        {
            "password_hash",
            "failed_login_attempts",
            "locked_until",
            "last_login_at",
            "totp_last_step",
            "totp_secret_encrypted",
        },
        {"email", "full_name"},
    ),
    Organization: ("organization", set(), set()),
}


def mark_session_actor(
    db: Session,
    *,
    user: User | None = None,
    actor_type: AuditActorType | None = None,
) -> None:
    """Attribute subsequent flushes of ``db`` to ``user`` (or to a system/worker/webhook actor)."""
    if user is not None:
        db.info[ACTOR_USER_ID] = user.id
        db.info[ACTOR_ORG_ID] = user.organization_id
        db.info[ACTOR_TYPE] = AuditActorType.USER
    if actor_type is not None:
        db.info[ACTOR_TYPE] = actor_type


def _shorten(value: Any) -> Any:
    if isinstance(value, str) and len(value) > _MAX_VALUE_LENGTH:
        return f"[{len(value)} chars]"
    return value


def _is_free_text(attr: Any) -> bool:
    """Free-text / JSON columns may hold customer content; audit records only structured fields."""
    return isinstance(attr.columns[0].type, Text | JSON)


def _column_values(obj: Any, spec: tuple[str, set[str], set[str]]) -> dict[str, Any]:
    _, excluded, redacted = spec
    state = inspect(obj)
    out: dict[str, Any] = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in _NOISE or key in excluded or _is_free_text(attr):
            continue
        value = state.dict.get(key)
        out[key] = REDACTED if (key in redacted and value is not None) else _shorten(value)
    return out


def _changed(
    obj: Any, spec: tuple[str, set[str], set[str]]
) -> tuple[dict[str, Any], dict[str, Any]]:
    _, excluded, redacted = spec
    state = inspect(obj)
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in _NOISE or key in excluded or _is_free_text(attr):
            continue
        hist = state.attrs[key].history
        if not hist.has_changes():
            continue
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else None
        if key in redacted:
            before[key] = REDACTED if old is not None else None
            after[key] = REDACTED if new is not None else None
        else:
            before[key], after[key] = _shorten(old), _shorten(new)
    return before, after


def _org_id(obj: Any) -> uuid.UUID | None:
    if isinstance(obj, Organization):
        return obj.id
    org_id = getattr(obj, "organization_id", None)
    if org_id is None:
        # FK not populated yet when the parent was attached through a relationship.
        parent = inspect(obj).dict.get("organization")
        org_id = getattr(parent, "id", None)
    return org_id


def _audit_flush(session: Session, flush_context: Any, instances: Any) -> None:
    events: list[tuple[str, Any, tuple[str, set[str], set[str]]]] = []
    for obj in list(session.new):
        spec = _SPECS.get(type(obj))
        if spec:
            events.append(("create", obj, spec))
    for obj in list(session.dirty):
        spec = _SPECS.get(type(obj))
        if spec and session.is_modified(obj, include_collections=False):
            events.append(("update", obj, spec))
    for obj in list(session.deleted):
        spec = _SPECS.get(type(obj))
        if spec:
            events.append(("delete", obj, spec))
    if not events:
        return

    ctx = get_request_context()
    actor_user = session.info.get(ACTOR_USER_ID)
    actor_type = session.info.get(ACTOR_TYPE) or AuditActorType.SYSTEM
    for verb, obj, spec in events:
        if verb == "update":
            before, after = _changed(obj, spec)
            if not after and not before:
                continue
        elif verb == "create":
            before, after = None, _column_values(obj, spec)
        else:
            before, after = _column_values(obj, spec), None
        entity_id = getattr(obj, "id", None)
        if entity_id is None and verb == "create" and hasattr(obj, "id"):
            # Python-side PK defaults are applied during flush; assign now so the event links.
            entity_id = obj.id = uuid.uuid4()
        org = _org_id(obj) or session.info.get(ACTOR_ORG_ID)
        session.add(
            AuditEvent(
                organization_id=org,
                actor_type=actor_type,
                actor_user_id=actor_user,
                action=f"{spec[0]}.{verb}",
                entity_type=spec[0],
                entity_id=str(entity_id) if entity_id is not None else None,
                request_id=ctx.request_id,
                ip_address=ctx.ip_address,
                user_agent=ctx.user_agent[:MAX_USER_AGENT_LENGTH] if ctx.user_agent else None,
                before=sanitize_payload(before),
                after=sanitize_payload(after),
            )
        )


_registered = False


def register_audit_hooks() -> None:
    global _registered
    if not _registered:
        event.listen(Session, "before_flush", _audit_flush)
        _registered = True
