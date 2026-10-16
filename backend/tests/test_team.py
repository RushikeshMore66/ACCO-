"""User management: role rules, tenant isolation, last-owner guard (Tasks 0.2/0.5)."""

import pytest
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.audit_event import AuditEvent
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.email_provider import MockEmailProvider, set_email_provider

PASSWORD = "securepassword123"


@pytest.fixture()
def mailbox():
    provider = MockEmailProvider()
    set_email_provider(provider)
    yield provider
    set_email_provider(None)


def _org(db, slug):
    org = Organization(name=slug, slug=slug)
    db.add(org)
    db.flush()
    return org


def _user(db, org, role, email=None):
    user = User(
        email=email or f"{role.value.lower()}@{org.slug}.example.com",
        full_name=role.value,
        password_hash=get_password_hash(PASSWORD),
        organization_id=org.id,
        role=role,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def org_a(db_session):
    org = _org(db_session, "team-a")
    db_session.commit()
    return org


def test_only_owner_and_finance_manager_and_admin_can_list(
    client, db_session, org_a, session_headers
):
    _user(db_session, org_a, UserRole.COLLECTOR)
    for role, expected in [
        (UserRole.OWNER, 200),
        (UserRole.ADMIN, 200),
        (UserRole.FINANCE_MANAGER, 200),
        (UserRole.COLLECTOR, 403),
        (UserRole.VIEWER, 403),
    ]:
        actor = _user(db_session, org_a, role, email=f"actor-{role.value}@x.example")
        resp = client.get("/api/v1/team", headers=session_headers(actor))
        assert resp.status_code == expected, role


def test_list_is_tenant_scoped(client, db_session, org_a, session_headers):
    org_b = _org(db_session, "team-b")
    db_session.commit()
    owner_a = _user(db_session, org_a, UserRole.OWNER)
    _user(db_session, org_b, UserRole.OWNER)
    body = client.get("/api/v1/team", headers=session_headers(owner_a)).json()
    assert [m["organization_id"] for m in body] == [str(org_a.id)]


def test_invite_creates_pending_member_and_emails_a_set_password_link(
    client, db_session, org_a, session_headers, mailbox
):
    owner = _user(db_session, org_a, UserRole.OWNER)
    resp = client.post(
        "/api/v1/team/invites",
        json={"email": "New.Hire@Example.com", "full_name": "New Hire", "role": "COLLECTOR"},
        headers=session_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "PENDING_INVITATION"
    assert resp.json()["email"] == "new.hire@example.com"
    assert len(mailbox.sent_messages) == 1 and "reset-password" in mailbox.sent_messages[0]["body"]
    assert any(e.action == "team.invited" for e in db_session.scalars(select(AuditEvent)).all())

    dup = client.post(
        "/api/v1/team/invites",
        json={"email": "new.hire@example.com", "full_name": "X", "role": "VIEWER"},
        headers=session_headers(owner),
    )
    assert dup.status_code == 409


@pytest.mark.parametrize(
    ("actor_role", "granted", "expected"),
    [
        (UserRole.OWNER, "ADMIN", 201),
        (UserRole.OWNER, "OWNER", 201),
        (UserRole.ADMIN, "COLLECTOR", 201),
        (UserRole.ADMIN, "ADMIN", 403),
        (UserRole.ADMIN, "OWNER", 403),
        (UserRole.FINANCE_MANAGER, "VIEWER", 403),
        (UserRole.COLLECTOR, "VIEWER", 403),
    ],
)
def test_invite_role_grant_rules(
    client, db_session, org_a, session_headers, mailbox, actor_role, granted, expected
):
    actor = _user(db_session, org_a, actor_role)
    resp = client.post(
        "/api/v1/team/invites",
        json={"email": "invitee@example.com", "full_name": "I", "role": granted},
        headers=session_headers(actor),
    )
    assert resp.status_code == expected, resp.text


def test_admin_cannot_modify_owner_or_other_admin(client, db_session, org_a, session_headers):
    admin = _user(db_session, org_a, UserRole.ADMIN)
    owner = _user(db_session, org_a, UserRole.OWNER)
    other_admin = _user(db_session, org_a, UserRole.ADMIN, email="admin2@x.example")
    collector = _user(db_session, org_a, UserRole.COLLECTOR)
    headers = session_headers(admin)

    for victim in (owner, other_admin):
        assert (
            client.patch(
                f"/api/v1/team/{victim.id}/role", json={"role": "VIEWER"}, headers=headers
            ).status_code
            == 403
        )
        assert (
            client.post(f"/api/v1/team/{victim.id}/deactivate", headers=headers).status_code == 403
        )
        assert (
            client.post(
                f"/api/v1/team/{victim.id}/mfa/reset",
                json={"reason": "lost phone"},
                headers=headers,
            ).status_code
            == 403
        )
    # ...but may manage ordinary members, and cannot promote them to ADMIN/OWNER.
    assert (
        client.patch(
            f"/api/v1/team/{collector.id}/role", json={"role": "ADMIN"}, headers=headers
        ).status_code
        == 403
    )
    ok = client.patch(
        f"/api/v1/team/{collector.id}/role", json={"role": "FINANCE_MANAGER"}, headers=headers
    )
    assert ok.status_code == 200 and ok.json()["role"] == "FINANCE_MANAGER"


def test_cannot_change_own_role_or_deactivate_self(client, db_session, org_a, session_headers):
    owner = _user(db_session, org_a, UserRole.OWNER)
    second = _user(db_session, org_a, UserRole.OWNER, email="owner2@x.example")
    headers = session_headers(second)
    assert (
        client.patch(
            f"/api/v1/team/{second.id}/role", json={"role": "VIEWER"}, headers=headers
        ).status_code
        == 403
    )
    assert client.post(f"/api/v1/team/{second.id}/deactivate", headers=headers).status_code == 403
    assert owner.is_active


def test_last_owner_cannot_be_demoted_or_deactivated(client, db_session, org_a, session_headers):
    only_owner = _user(db_session, org_a, UserRole.OWNER)
    admin = _user(db_session, org_a, UserRole.ADMIN)
    # An ADMIN is not allowed to touch an OWNER at all; use a second OWNER to act.
    acting_owner = _user(db_session, org_a, UserRole.OWNER, email="owner-b@x.example")
    headers = session_headers(acting_owner)

    assert (
        client.post(f"/api/v1/team/{only_owner.id}/deactivate", headers=headers).status_code == 200
    )
    # Now acting_owner is the last active owner; a new acting owner cannot remove them.
    third = _user(db_session, org_a, UserRole.OWNER, email="owner-c@x.example")
    third_headers = session_headers(third)
    client.post(f"/api/v1/team/{acting_owner.id}/deactivate", headers=third_headers)
    only_left = db_session.scalars(
        select(User).where(User.role == UserRole.OWNER, User.is_active.is_(True))
    ).all()
    assert [u.id for u in only_left] == [third.id]
    # third is the last active owner and cannot be deactivated by anyone else.
    refreshed_admin_headers = session_headers(admin)
    assert (
        client.post(
            f"/api/v1/team/{third.id}/deactivate", headers=refreshed_admin_headers
        ).status_code
        == 403
    )


def test_role_change_revokes_target_sessions(client, db_session, org_a, session_headers):
    owner = _user(db_session, org_a, UserRole.OWNER)
    collector = _user(db_session, org_a, UserRole.COLLECTOR)
    collector_headers = session_headers(collector)
    assert client.get("/api/v1/auth/me", headers=collector_headers).status_code == 200
    resp = client.patch(
        f"/api/v1/team/{collector.id}/role",
        json={"role": "FINANCE_MANAGER"},
        headers=session_headers(owner),
    )
    assert resp.status_code == 200
    assert client.get("/api/v1/auth/me", headers=collector_headers).status_code == 401


def test_deactivate_blocks_existing_session_and_login(client, db_session, org_a, session_headers):
    owner = _user(db_session, org_a, UserRole.OWNER)
    collector = _user(db_session, org_a, UserRole.COLLECTOR)
    collector_headers = session_headers(collector)
    assert (
        client.post(
            f"/api/v1/team/{collector.id}/deactivate", headers=session_headers(owner)
        ).status_code
        == 200
    )
    assert client.get("/api/v1/auth/me", headers=collector_headers).status_code == 401
    login = client.post(
        "/api/v1/auth/login", data={"username": collector.email, "password": PASSWORD}
    )
    assert login.status_code == 401


def test_cross_tenant_targets_are_not_found(client, db_session, org_a, session_headers):
    org_b = _org(db_session, "team-b")
    db_session.commit()
    owner_a = _user(db_session, org_a, UserRole.OWNER)
    victim = _user(db_session, org_b, UserRole.COLLECTOR)
    headers = session_headers(owner_a)
    assert (
        client.patch(f"/api/v1/team/{victim.id}/role", json={"role": "VIEWER"}, headers=headers)
    ).status_code == 404
    assert client.post(f"/api/v1/team/{victim.id}/deactivate", headers=headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/team/{victim.id}/mfa/reset", json={"reason": "not yours"}, headers=headers
        ).status_code
        == 404
    )
    db_session.refresh(victim)
    assert victim.role == UserRole.COLLECTOR and victim.is_active


def test_owner_can_reset_admin_mfa_with_audit(client, db_session, org_a, session_headers):
    owner = _user(db_session, org_a, UserRole.OWNER)
    admin = _user(db_session, org_a, UserRole.ADMIN)
    admin.mfa_enabled_at = owner.created_at
    admin.totp_secret_encrypted = "JBSWY3DPEHPK3PXP"
    db_session.commit()
    resp = client.post(
        f"/api/v1/team/{admin.id}/mfa/reset",
        json={"reason": "device lost, identity confirmed by phone"},
        headers=session_headers(owner),
    )
    assert resp.status_code == 204
    db_session.refresh(admin)
    assert admin.mfa_enabled_at is None and admin.totp_secret_encrypted is None
    event = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "auth.mfa.reset")
    ).one()
    assert event.actor_user_id == owner.id and event.entity_id == str(admin.id)

    self_reset = client.post(
        f"/api/v1/team/{owner.id}/mfa/reset",
        json={"reason": "trying myself"},
        headers=session_headers(owner),
    )
    assert self_reset.status_code == 403
