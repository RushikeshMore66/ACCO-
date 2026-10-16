"""Email verification and password recovery (Task 0.4)."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.auth_tokens import RefreshToken, UserToken, UserTokenPurpose
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.email_provider import MockEmailProvider, set_email_provider

PASSWORD = "securepassword123"
NEW_PASSWORD = "an-entirely-new-passphrase"


@pytest.fixture()
def mailbox():
    provider = MockEmailProvider()
    set_email_provider(provider)
    yield provider
    set_email_provider(None)


def _token_from(mail: dict) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-%]+)", mail["body"])
    assert match, mail["body"]
    return match.group(1)


def _collector(db, email="coll@example.com"):
    org = Organization(name="O", slug=f"o-{email.split('@')[0]}")
    db.add(org)
    db.flush()
    user = User(
        email=email,
        full_name="C",
        password_hash=get_password_hash(PASSWORD),
        organization_id=org.id,
        role=UserRole.COLLECTOR,
        email_verified_at=datetime.now(UTC),
    )
    db.add(user)
    db.commit()
    return user


def _login(client, email, password):
    return client.post("/api/v1/auth/login", data={"username": email, "password": password})


def test_forgot_password_response_is_identical_for_known_and_unknown_email(
    client, db_session, mailbox
):
    _collector(db_session)
    known = client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    # Only the real account receives mail.
    assert [m["to"] for m in mailbox.sent_messages] == ["coll@example.com"]


def test_reset_flow_changes_password_and_invalidates_sessions_and_token_is_single_use(
    client, db_session, mailbox
):
    _collector(db_session)
    session = _login(client, "coll@example.com", PASSWORD).json()

    client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    token = _token_from(mailbox.sent_messages[-1])
    stored = db_session.scalars(select(UserToken)).one()
    assert stored.token_hash != token and len(stored.token_hash) == 64
    assert stored.expires_at is not None

    done = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert done.status_code == 200, done.text

    # Prior session is dead (access + refresh).
    auth = {"Authorization": f"Bearer {session['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": session["refresh_token"]}
        ).status_code
        == 401
    )
    assert all(r.revoked_at for r in db_session.scalars(select(RefreshToken)).all())

    # Old password no longer works, new one does.
    assert _login(client, "coll@example.com", PASSWORD).status_code == 401
    assert _login(client, "coll@example.com", NEW_PASSWORD).status_code == 200

    # Token cannot be reused.
    again = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "yet-another-passphrase"},
    )
    assert again.status_code == 400


def test_expired_token_rejected(client, db_session, mailbox):
    _collector(db_session)
    client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    token = _token_from(mailbox.sent_messages[-1])
    row = db_session.scalars(select(UserToken)).one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    resp = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert resp.status_code == 400


def test_reset_token_lifetime_is_60_minutes_by_default(client, db_session, mailbox):
    from app.core.config import Settings

    assert Settings(_env_file=None).password_reset_ttl_minutes == 60
    _collector(db_session)
    client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    row = db_session.scalars(select(UserToken)).one()
    delta = row.expires_at.replace(tzinfo=UTC) - datetime.now(UTC)
    assert timedelta(minutes=settings.password_reset_ttl_minutes - 1) < delta
    assert delta <= timedelta(minutes=settings.password_reset_ttl_minutes)


def test_new_request_invalidates_previous_reset_token(client, db_session, mailbox):
    _collector(db_session)
    client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    first = _token_from(mailbox.sent_messages[-1])
    client.post("/api/v1/auth/forgot-password", json={"email": "coll@example.com"})
    second = _token_from(mailbox.sent_messages[-1])
    assert first != second
    bad = client.post(
        "/api/v1/auth/reset-password", json={"token": first, "new_password": NEW_PASSWORD}
    )
    assert bad.status_code == 400
    ok = client.post(
        "/api/v1/auth/reset-password", json={"token": second, "new_password": NEW_PASSWORD}
    )
    assert ok.status_code == 200


def test_weak_new_password_and_garbage_token_rejected(client, db_session, mailbox):
    _collector(db_session)
    assert (
        client.post(
            "/api/v1/auth/reset-password", json={"token": "t" * 43, "new_password": "short"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/auth/reset-password", json={"token": "t" * 43, "new_password": NEW_PASSWORD}
        ).status_code
        == 400
    )


def test_a_verification_token_cannot_reset_a_password(client, db_session, mailbox):
    user = _collector(db_session)
    from app.services.auth_service import start_email_verification

    raw = start_email_verification(db_session, user)
    db_session.commit()
    resp = client.post(
        "/api/v1/auth/reset-password", json={"token": raw, "new_password": NEW_PASSWORD}
    )
    assert resp.status_code == 400
    assert (
        db_session.scalars(
            select(UserToken).where(UserToken.purpose == UserTokenPurpose.EMAIL_VERIFICATION)
        )
        .one()
        .used_at
        is None
    )


# ----------------------------------------------------------------- email verification


@pytest.fixture()
def verification_required(monkeypatch):
    monkeypatch.setattr(settings, "require_email_verification", True)


def _register(client, email="newowner@example.com", slug="new-org"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "New Org",
            "organization_slug": slug,
            "full_name": "New Owner",
            "email": email,
            "password": PASSWORD,
        },
    )


def test_registration_sends_verification_email_and_login_blocked_until_verified(
    client, mailbox, verification_required
):
    created = _register(client)
    assert created.status_code == 201
    assert created.json()["email_verified"] is False
    assert len(mailbox.sent_messages) == 1
    assert "verify-email" in mailbox.sent_messages[0]["body"]

    blocked = _login(client, "newowner@example.com", PASSWORD)
    assert blocked.status_code == 403
    assert "not verified" in blocked.json()["detail"]

    token = _token_from(mailbox.sent_messages[0])
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    assert _login(client, "newowner@example.com", PASSWORD).status_code == 200

    # Single use.
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400


def test_resend_verification_is_neutral(client, mailbox, verification_required):
    _register(client)
    mailbox.sent_messages.clear()
    known = client.post("/api/v1/auth/resend-verification", json={"email": "newowner@example.com"})
    unknown = client.post("/api/v1/auth/resend-verification", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(mailbox.sent_messages) == 1


def test_verification_not_required_in_development_by_default(client, mailbox):
    _register(client)
    assert _login(client, "newowner@example.com", PASSWORD).status_code == 200
