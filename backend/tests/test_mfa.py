"""TOTP MFA: enrolment, challenge, recovery codes and role enforcement (Task 0.5)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import totp
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, hash_token
from app.models.audit_event import AuditEvent
from app.models.auth_tokens import MfaRecoveryCode
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import auth_service
from tests.conftest import enroll_mfa

PASSWORD = "securepassword123"
EMAIL = "owner@example.com"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _register_owner(client):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Org",
            "organization_slug": "org",
            "full_name": "Owner",
            "email": EMAIL,
            "password": PASSWORD,
        },
    )
    assert r.status_code == 201, r.text


def _login(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/v1/auth/login", data={"username": email, "password": password})


@pytest.fixture()
def enrolled(client):
    """Owner with MFA enabled: returns (secret, recovery_codes)."""
    _register_owner(client)
    first = _login(client).json()
    session, secret = enroll_mfa(client, first["access_token"])
    return secret, session["recovery_codes"]


def _next_code(secret, db_session):
    """A currently valid code, as if >=1 TOTP step elapsed since the last accepted one."""
    user = db_session.scalars(select(User).where(User.email == EMAIL)).one()
    user.totp_last_step = totp.time_step() - 2
    db_session.commit()
    return totp.generate_totp(secret)


def test_privileged_login_without_mfa_gets_limited_enrollment_token(client):
    _register_owner(client)
    resp = _login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["mfa_enrollment_required"] is True
    assert body["refresh_token"] is None

    headers = _bearer(body["access_token"])
    for path in ("/api/v1/auth/me", "/api/v1/dashboard/summary", "/api/v1/audit-events"):
        assert client.get(path, headers=headers).status_code == 403, path
    assert client.post("/api/v1/auth/mfa/setup", headers=headers).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 40}).status_code == 401


def test_enrollment_flow_returns_recovery_codes_and_full_session(client, db_session):
    _register_owner(client)
    first = _login(client).json()
    headers = _bearer(first["access_token"])

    setup = client.post("/api/v1/auth/mfa/setup", headers=headers).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    user = db_session.scalars(select(User)).one()
    assert user.mfa_enabled_at is None  # pending until confirmed

    # Secret is encrypted at rest.
    raw = (
        db_session.connection().exec_driver_sql("SELECT totp_secret_encrypted FROM users").scalar()
    )
    assert raw.startswith("v1:") and setup["secret"] not in raw

    wrong = client.post("/api/v1/auth/mfa/enable", json={"code": "000000"}, headers=headers)
    assert wrong.status_code == 400

    ok = client.post(
        "/api/v1/auth/mfa/enable",
        json={"code": totp.generate_totp(setup["secret"])},
        headers=headers,
    )
    assert ok.status_code == 200
    body = ok.json()
    assert len(body["recovery_codes"]) == settings.mfa_recovery_code_count
    assert (
        client.get("/api/v1/auth/me", headers=_bearer(body["session"]["access_token"])).status_code
        == 200
    )

    # Recovery codes are stored hashed.
    hashes = {r.code_hash for r in db_session.scalars(select(MfaRecoveryCode)).all()}
    assert all(hash_token(c.replace("-", "")) in hashes for c in body["recovery_codes"])
    # Already enabled -> cannot re-run setup.
    assert (
        client.post(
            "/api/v1/auth/mfa/setup", headers=_bearer(body["session"]["access_token"])
        ).status_code
        == 409
    )


def test_login_with_mfa_requires_second_factor(client, db_session, enrolled):
    secret, _ = enrolled
    resp = _login(client)
    assert resp.status_code == 202
    ticket = resp.json()["mfa_ticket"]
    assert "access_token" not in resp.json()

    # The ticket alone grants nothing.
    assert client.get("/api/v1/auth/me", headers=_bearer(ticket)).status_code == 401

    bad = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": "123456"})
    assert bad.status_code == 401

    good = client.post(
        "/api/v1/auth/mfa/verify",
        json={"mfa_ticket": ticket, "code": _next_code(secret, db_session)},
    )
    assert good.status_code == 200, good.text
    me = client.get("/api/v1/auth/me", headers=_bearer(good.json()["access_token"]))
    assert me.status_code == 200 and me.json()["mfa_enabled"] is True


def test_totp_code_cannot_be_replayed(client, db_session, enrolled):
    secret, _ = enrolled
    ticket = _login(client).json()["mfa_ticket"]
    code = _next_code(secret, db_session)
    assert (
        client.post(
            "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code}
        ).status_code
        == 200
    )
    ticket2 = _login(client).json()["mfa_ticket"]
    replay = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket2, "code": code})
    assert replay.status_code == 401


def test_recovery_code_is_single_use_and_audited(client, db_session, enrolled):
    _, codes = enrolled
    ticket = _login(client).json()["mfa_ticket"]
    ok = client.post(
        "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "recovery_code": codes[0]}
    )
    assert ok.status_code == 200, ok.text

    ticket2 = _login(client).json()["mfa_ticket"]
    reuse = client.post(
        "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket2, "recovery_code": codes[0]}
    )
    assert reuse.status_code == 401
    other = client.post(
        "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket2, "recovery_code": codes[1]}
    )
    assert other.status_code == 200

    actions = [e.action for e in db_session.scalars(select(AuditEvent)).all()]
    assert actions.count("auth.mfa.recovery_code_used") == 2


def test_must_supply_exactly_one_factor(client, enrolled):
    ticket = _login(client).json()["mfa_ticket"]
    neither = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket})
    both = client.post(
        "/api/v1/auth/mfa/verify",
        json={"mfa_ticket": ticket, "code": "123456", "recovery_code": "abcde-fghij"},
    )
    assert neither.status_code == both.status_code == 422


def test_repeated_wrong_codes_lock_the_account(client, db_session, enrolled):
    ticket = _login(client).json()["mfa_ticket"]
    statuses = [
        client.post(
            "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": "000000"}
        ).status_code
        for _ in range(settings.login_max_failed_attempts + 1)
    ]
    assert (
        statuses[: settings.login_max_failed_attempts] == [401] * settings.login_max_failed_attempts
    )
    assert statuses[-1] == 429
    # Even the correct password is now refused until the lock expires.
    assert _login(client).status_code == 429


def test_expired_or_forged_ticket_rejected(client, db_session, enrolled):
    user = db_session.scalars(select(User)).one()
    forged = create_access_token(subject=user.id, organization_id=user.organization_id)
    resp = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": forged, "code": "123456"})
    assert resp.status_code == 401
    garbage = client.post(
        "/api/v1/auth/mfa/verify", json={"mfa_ticket": "g" * 60, "code": "123456"}
    )
    assert garbage.status_code == 401


def test_regenerating_recovery_codes_invalidates_old_ones(client, db_session, enrolled):
    secret, old_codes = enrolled
    ticket = _login(client).json()["mfa_ticket"]
    session = client.post(
        "/api/v1/auth/mfa/verify",
        json={"mfa_ticket": ticket, "code": _next_code(secret, db_session)},
    ).json()
    regen = client.post(
        "/api/v1/auth/mfa/recovery-codes",
        json={"code": _next_code(secret, db_session)},
        headers=_bearer(session["access_token"]),
    )
    assert regen.status_code == 200
    new_codes = regen.json()["recovery_codes"]
    assert set(new_codes).isdisjoint(old_codes)

    ticket2 = _login(client).json()["mfa_ticket"]
    stale = client.post(
        "/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket2, "recovery_code": old_codes[0]}
    )
    assert stale.status_code == 401


@pytest.mark.parametrize(
    ("role", "gated"),
    [
        (UserRole.OWNER, True),
        (UserRole.ADMIN, True),
        (UserRole.FINANCE_MANAGER, False),
        (UserRole.COLLECTOR, False),
        (UserRole.VIEWER, False),
    ],
)
def test_mfa_enforced_only_for_privileged_roles(client, db_session, role, gated):
    org = Organization(name="R", slug="r")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        User(
            email="r@example.com",
            full_name="R",
            password_hash=get_password_hash(PASSWORD),
            organization_id=org.id,
            role=role,
        )
    )
    db_session.commit()
    resp = _login(client, "r@example.com")
    assert resp.status_code == 200
    assert resp.json()["mfa_enrollment_required"] is gated


def test_privileged_session_without_mfa_claim_is_forbidden(client, db_session):
    """A role elevated after sign-in must re-authenticate with MFA."""
    org = Organization(name="E", slug="e")
    db_session.add(org)
    db_session.flush()
    user = User(
        email="e@example.com",
        full_name="E",
        password_hash=get_password_hash(PASSWORD),
        organization_id=org.id,
        role=UserRole.COLLECTOR,
    )
    db_session.add(user)
    db_session.commit()
    tokens = auth_service.issue_session(db_session, user, mfa_verified=False)
    db_session.commit()
    headers = _bearer(tokens.access_token)
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

    user.role = UserRole.ADMIN
    db_session.commit()
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 403 and resp.json()["detail"] == "MFA required"
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens.refresh_token})
    assert refreshed.status_code == 401


def test_admin_reset_clears_mfa_and_sessions_with_audit(client, db_session, enrolled):
    user = db_session.scalars(select(User)).one()
    auth_service.reset_user_mfa(db_session, user, actor=None, reason="lost device (test)")
    db_session.commit()

    db_session.refresh(user)
    assert user.mfa_enabled_at is None and user.totp_secret_encrypted is None
    assert (
        db_session.scalars(select(MfaRecoveryCode).where(MfaRecoveryCode.used_at.is_(None))).all()
        == []
    )
    # Next login is an enrolment again, never an MFA bypass.
    assert _login(client).json()["mfa_enrollment_required"] is True
    event = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "auth.mfa.reset")
    ).one()
    assert event.after == {"reason": "lost device (test)"}


def test_lockout_expires(client, db_session):
    _register_owner(client)
    for _ in range(settings.login_max_failed_attempts):
        assert _login(client, password="wrong-password-123").status_code == 401
    assert _login(client).status_code == 429
    user = db_session.scalars(select(User)).one()
    user.locked_until = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert _login(client).status_code == 200
