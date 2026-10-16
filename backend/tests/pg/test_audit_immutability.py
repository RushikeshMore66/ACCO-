"""audit_events must be append-only at the database level (trigger + privileges)."""

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.postgres


def _insert(conn, event_id: uuid.UUID) -> None:
    conn.execute(
        text(
            "INSERT INTO audit_events (id, actor_type, action, created_at) "
            "VALUES (:i, 'SYSTEM', 'test.event', now())"
        ),
        {"i": event_id},
    )


def test_owner_cannot_update_delete_or_truncate(migrated_pg):
    event_id = uuid.uuid4()
    with migrated_pg.begin() as conn:
        _insert(conn, event_id)
    for stmt in (
        "UPDATE audit_events SET action = 'tampered'",
        "DELETE FROM audit_events",
        "TRUNCATE audit_events",
    ):
        with pytest.raises(DBAPIError) as exc, migrated_pg.begin() as conn:
            conn.execute(text(stmt))
        assert "append-only" in str(exc.value)
    with migrated_pg.connect() as conn:
        action = conn.execute(
            text("SELECT action FROM audit_events WHERE id = :i"), {"i": event_id}
        ).scalar()
    assert action == "test.event"


def test_least_privilege_role_has_no_update_delete_truncate(pg_url, migrated_pg):
    role = "acco_app_audit_probe"
    with migrated_pg.begin() as conn:
        conn.execute(text(f"DROP ROLE IF EXISTS {role}"))
        conn.execute(text(f"CREATE ROLE {role} LOGIN PASSWORD 'probe-only-password'"))
        conn.execute(text(f"GRANT USAGE ON SCHEMA public TO {role}"))
        conn.execute(
            text(f"GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON audit_events TO {role}")
        )
        # Even an explicit grant is neutralised by the trigger; the REVOKE FROM PUBLIC means a
        # role without an explicit grant has no privileges at all:
        conn.execute(text(f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM {role}"))
        conn.execute(
            text(
                "INSERT INTO audit_events (id, actor_type, action, created_at) "
                "VALUES (gen_random_uuid(), 'SYSTEM', 'seed', now())"
            )
        )
    url = make_url(pg_url).set(username=role, password="probe-only-password")
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            _insert(conn, uuid.uuid4())  # INSERT allowed
            assert conn.execute(text("SELECT count(*) FROM audit_events")).scalar() >= 1
        for stmt in ("UPDATE audit_events SET action = 'x'", "DELETE FROM audit_events"):
            with pytest.raises(DBAPIError) as exc, engine.begin() as conn:
                conn.execute(text(stmt))
            assert "permission denied" in str(exc.value).lower()
    finally:
        engine.dispose()
        with migrated_pg.begin() as conn:
            conn.execute(text(f"DROP OWNED BY {role}"))
            conn.execute(text(f"DROP ROLE IF EXISTS {role}"))
