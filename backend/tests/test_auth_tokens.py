"""Access/refresh token lifecycle (Task 0.3)."""

from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select

from app.core.config import Settings, settings
from app.core.security import create_access_token, create_mfa_ticket, get_password_hash, hash_token
from app.models.auth_tokens import RefreshToken
from app.models.organization import Organization
from app.models.user import User, UserRole
from tests.conftest import enroll_mfa

PASSWORD = "securepassword123"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _collector_login(client, db_session, email="coll@example.com"):
    """Create a COLLECTOR (not MFA-gated) and sign in through the real endpoint."""
    org = Organization(name="Coll Org", slug="coll-org")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        User(
            email=email,
            full_name="C",
            password_hash=get_password_hash(PASSWORD),
            organization_id=org.id,
            role=UserRole.COLLECTOR,
        )
    )
    db_session.commit()
    r = client.post("/api/v1/auth/login", data={"username": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


def test_default_access_token_lifetime_is_15_minutes():
    # Code default, independent of any developer .env override.
    assert Settings(_env_file=None).access_token_expire_minutes == 15


def test_login_issues_short_access_and_hashed_refresh_token(client, db_session):
    body = _collector_login(client, db_session)
    assert body["expires_in"] == settings.access_token_expire_minutes * 60
    assert body["refresh_token"] and body["refresh_expires_in"] == 7 * 86400

    claims = jwt.decode(body["access_token"], options={"verify_signature": False})
    assert claims["exp"] - claims["iat"] == settings.access_token_expire_minutes * 60
    assert "sid" in claims and claims["typ"] == "access"

    rows = db_session.scalars(select(RefreshToken)).all()
    assert len(rows) == 1
    assert rows[0].token_hash == hash_token(body["refresh_token"])
    assert len(rows[0].token_hash) == 64
    assert rows[0].token_hash != body["refresh_token"]


def test_refresh_rotates_and_keeps_session_family(client, db_session):
    first = _collector_login(client, db_session)
    second = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200, second.text
    pair = second.json()
    assert pair["refresh_token"] != first["refresh_token"]
    assert client.get("/api/v1/auth/me", headers=_bearer(pair["access_token"])).status_code == 200
    assert len({r.family_id for r in db_session.scalars(select(RefreshToken)).all()}) == 1


def test_replaying_a_used_refresh_token_revokes_the_whole_family(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "refresh_reuse_leeway_seconds", 0)
    first = _collector_login(client, db_session)
    rotated = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()

    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401

    # The legitimately rotated token and its access token are dead as well.
    again = client.post("/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert again.status_code == 401
    assert (
        client.get("/api/v1/auth/me", headers=_bearer(rotated["access_token"])).status_code == 401
    )
    assert all(r.revoked_at is not None for r in db_session.scalars(select(RefreshToken)).all())


def test_logout_revokes_session_and_access_token(client, db_session):
    body = _collector_login(client, db_session)
    assert client.get("/api/v1/auth/me", headers=_bearer(body["access_token"])).status_code == 200

    out = client.post("/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]})
    assert out.status_code == 204
    assert client.get("/api/v1/auth/me", headers=_bearer(body["access_token"])).status_code == 401
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert reuse.status_code == 401
    # Idempotent and silent for unknown tokens.
    assert client.post("/api/v1/auth/logout", json={"refresh_token": "x" * 40}).status_code == 204


def test_unknown_and_expired_refresh_tokens_rejected(client, db_session):
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": "z" * 43}).status_code == 401
    body = _collector_login(client, db_session)
    row = db_session.scalars(select(RefreshToken)).one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    expired = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert expired.status_code == 401


def test_refresh_and_mfa_ticket_are_not_usable_as_access_tokens(client, db_session):
    body = _collector_login(client, db_session)
    assert client.get("/api/v1/auth/me", headers=_bearer(body["refresh_token"])).status_code == 401
    user = db_session.scalars(select(User)).one()
    ticket = create_mfa_ticket(user.id, user.organization_id)
    assert client.get("/api/v1/auth/me", headers=_bearer(ticket)).status_code == 401


def test_access_token_without_session_id_is_rejected(client, db_session):
    _collector_login(client, db_session)
    user = db_session.scalars(select(User)).one()
    legacy = create_access_token(subject=user.id, organization_id=user.organization_id)
    assert client.get("/api/v1/auth/me", headers=_bearer(legacy)).status_code == 401


def test_deactivated_user_cannot_refresh(client, db_session):
    body = _collector_login(client, db_session)
    user = db_session.scalars(select(User)).one()
    user.is_active = False
    db_session.commit()
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert resp.status_code == 401


def test_privileged_refresh_preserves_mfa_proof(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Org A",
            "organization_slug": "org-a",
            "full_name": "Owner",
            "email": "owner-a@example.com",
            "password": PASSWORD,
        },
    )
    login = client.post(
        "/api/v1/auth/login", data={"username": "owner-a@example.com", "password": PASSWORD}
    ).json()
    session, _ = enroll_mfa(client, login["access_token"])
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": session["session"]["refresh_token"]}
    )
    assert refreshed.status_code == 200
    me = client.get("/api/v1/auth/me", headers=_bearer(refreshed.json()["access_token"]))
    assert me.status_code == 200


def test_refresh_requires_body(client):
    assert client.post("/api/v1/auth/refresh", json={}).status_code == 422


def test_immediate_reuse_within_leeway_is_a_benign_race_not_theft(client, db_session):
    first = _collector_login(client, db_session)
    a = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    b = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert a.status_code == b.status_code == 200
    assert a.json()["refresh_token"] != b.json()["refresh_token"]
    assert (
        client.get("/api/v1/auth/me", headers=_bearer(b.json()["access_token"])).status_code == 200
    )


def test_reuse_after_leeway_revokes_family(client, db_session):
    first = _collector_login(client, db_session)
    client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    old = db_session.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(first["refresh_token"]))
    ).one()
    old.used_at = datetime.now(UTC) - timedelta(seconds=settings.refresh_reuse_leeway_seconds + 5)
    db_session.commit()
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401
    assert all(r.revoked_at is not None for r in db_session.scalars(select(RefreshToken)).all())
