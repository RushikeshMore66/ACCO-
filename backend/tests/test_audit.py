"""Audit trail tests (Task 0.10)."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.request_context import RequestContext, reset_request_context, set_request_context
from app.core.security import get_password_hash
from app.models.audit_event import AuditEvent, AuditImmutableError
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.audit_service import diff_fields, record_audit_event, sanitize_payload


def _org(db, slug: str) -> Organization:
    org = Organization(name=slug, slug=slug)
    db.add(org)
    db.commit()
    return org


def _user(db, org: Organization, role: UserRole) -> User:
    user = User(
        email=f"{role.value.lower()}@{org.slug}.example.com",
        full_name="U",
        password_hash=get_password_hash("securepassword123"),
        organization_id=org.id,
        role=role,
    )
    db.add(user)
    db.commit()
    return user


def test_sanitize_redacts_sensitive_keys_and_serialises_types():
    out = sanitize_payload(
        {
            "password": "x",
            "nested": {"api_key": "k", "totp_secret": "t", "amount": Decimal("10.5000")},
            "refresh_token_hash": "h",
            "id": uuid.UUID(int=1),
            "name": "ok",
        }
    )
    assert out["password"] == "[REDACTED]"
    assert out["nested"]["api_key"] == "[REDACTED]"
    assert out["nested"]["totp_secret"] == "[REDACTED]"
    assert out["nested"]["amount"] == "10.5000"
    assert out["refresh_token_hash"] == "[REDACTED]"
    assert out["name"] == "ok" and out["id"] == str(uuid.UUID(int=1))


def test_diff_fields_only_changed_keys():
    before, after = diff_fields({"a": 1, "b": 2}, {"a": 1, "b": 3})
    assert before == {"b": 2} and after == {"b": 3}


def test_record_event_captures_actor_and_request_context(db_session):
    org = _org(db_session, "audit-a")
    owner = _user(db_session, org, UserRole.OWNER)
    token = set_request_context(RequestContext("req-12345678", "203.0.113.9", "pytest-agent"))
    try:
        record_audit_event(
            db_session,
            action="customer.update",
            actor=owner,
            entity_type="customer",
            entity_id="abc",
            before={"name": "Old"},
            after={"name": "New"},
        )
        db_session.commit()
    finally:
        reset_request_context(token)
    event = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "customer.update")
    ).one()
    assert event.organization_id == org.id and event.actor_user_id == owner.id
    assert (event.request_id, event.ip_address, event.user_agent) == (
        "req-12345678",
        "203.0.113.9",
        "pytest-agent",
    )
    assert event.before == {"name": "Old"} and event.after == {"name": "New"}
    assert event.created_at is not None


def test_orm_blocks_update_and_delete(db_session):
    org = _org(db_session, "audit-b")
    record_audit_event(db_session, action="x.y", organization_id=org.id)
    db_session.commit()
    event = db_session.scalars(select(AuditEvent).where(AuditEvent.action == "x.y")).one()

    event.action = "tampered"
    with pytest.raises(AuditImmutableError):
        db_session.commit()
    db_session.rollback()

    db_session.delete(
        db_session.scalars(select(AuditEvent).where(AuditEvent.action == "x.y")).one()
    )
    with pytest.raises(AuditImmutableError):
        db_session.commit()
    db_session.rollback()


def test_audit_endpoint_is_tenant_scoped_and_role_restricted(client, db_session, session_headers):
    _headers = session_headers
    org_a, org_b = _org(db_session, "tenant-a"), _org(db_session, "tenant-b")
    owner_a = _user(db_session, org_a, UserRole.OWNER)
    admin_a = _user(db_session, org_a, UserRole.ADMIN)
    viewer_a = _user(db_session, org_a, UserRole.VIEWER)
    fm_a = _user(db_session, org_a, UserRole.FINANCE_MANAGER)
    record_audit_event(db_session, action="a.one", organization_id=org_a.id, entity_type="t")
    record_audit_event(db_session, action="a.two", organization_id=org_a.id, entity_type="u")
    record_audit_event(db_session, action="b.one", organization_id=org_b.id)
    record_audit_event(db_session, action="pre.auth", organization_id=None)
    db_session.commit()

    resp = client.get("/api/v1/audit-events", headers=_headers(owner_a))
    assert resp.status_code == 200
    body = resp.json()
    actions = {e["action"] for e in body["items"]}
    # Explicit events plus the automatic create events for this tenant's own records.
    assert {"a.one", "a.two", "organization.create", "user.create"} <= actions
    assert "b.one" not in actions and "pre.auth" not in actions
    assert all(e["organization_id"] == str(org_a.id) for e in body["items"])

    assert client.get("/api/v1/audit-events", headers=_headers(admin_a)).status_code == 200
    assert client.get("/api/v1/audit-events", headers=_headers(viewer_a)).status_code == 403
    assert client.get("/api/v1/audit-events", headers=_headers(fm_a)).status_code == 403
    assert client.get("/api/v1/audit-events").status_code == 401

    filtered = client.get("/api/v1/audit-events?action=a.two", headers=_headers(owner_a)).json()
    assert [e["action"] for e in filtered["items"]] == ["a.two"]


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_no_mutating_audit_endpoints(client, db_session, session_headers, method):
    _headers = session_headers
    org = _org(db_session, "audit-c")
    owner = _user(db_session, org, UserRole.OWNER)
    resp = getattr(client, method)("/api/v1/audit-events", headers=_headers(owner))
    assert resp.status_code in (404, 405)


def test_business_changes_emit_audit_events_with_actor_and_diff(
    client, db_session, session_headers
):
    _headers = session_headers
    org = _org(db_session, "auto-audit")
    owner = _user(db_session, org, UserRole.OWNER)
    headers = _headers(owner)

    created = client.post(
        "/api/v1/customers",
        json={"name": "Acme Ltd", "email": "ap@acme.example"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    customer_id = created.json()["id"]
    patched = client.patch(
        f"/api/v1/customers/{customer_id}", json={"name": "Acme Holdings"}, headers=headers
    )
    assert patched.status_code == 200, patched.text

    events = db_session.scalars(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "customer", AuditEvent.entity_id == customer_id)
        .order_by(AuditEvent.created_at)
    ).all()
    assert [e.action for e in events] == ["customer.create", "customer.update"]
    assert all(e.actor_user_id == owner.id and e.organization_id == org.id for e in events)
    assert events[1].before == {"name": "Acme Ltd"}
    assert events[1].after == {"name": "Acme Holdings"}
    # PII values are masked in the trail.
    assert events[0].after["email"] == "[REDACTED]"
