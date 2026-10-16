"""ADMIN role migration: upgrade adds the value; downgrade demotes ADMIN users safely."""

import uuid

import pytest
from sqlalchemy import text

from tests.pg.conftest import run_alembic

pytestmark = pytest.mark.postgres

ADMIN_REVISION = "9i0j1k2l3m4n"


def _enum_labels(conn) -> list[str]:
    return [
        r[0]
        for r in conn.execute(
            text(
                "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = 'userrole' ORDER BY e.enumsortorder"
            )
        )
    ]


def test_admin_value_added_and_downgrade_demotes(pg_url, migrated_pg):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    with migrated_pg.begin() as conn:
        assert "ADMIN" in _enum_labels(conn)
        conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at) "
                "VALUES (:id, 'Org', :slug, true, now(), now())"
            ),
            {"id": org_id, "slug": f"org-{org_id.hex[:8]}"},
        )
        conn.execute(
            text(
                "INSERT INTO users (id, organization_id, email, full_name, password_hash, role, "
                "is_active, failed_login_attempts, created_at, updated_at) VALUES (:id, :org, 'a@x.example', 'A', 'h', "
                "'ADMIN', true, 0, now(), now())"
            ),
            {"id": user_id, "org": org_id},
        )

    down = run_alembic(pg_url, "downgrade", "8h9i0j1k2l3m")
    assert down.returncode == 0, down.stderr[-3000:]
    with migrated_pg.connect() as conn:
        assert "ADMIN" not in _enum_labels(conn)
        role = conn.execute(text("SELECT role FROM users WHERE id = :i"), {"i": user_id}).scalar()
        assert role == "FINANCE_MANAGER"

    up = run_alembic(pg_url, "upgrade", "head")
    assert up.returncode == 0, up.stderr[-3000:]
    with migrated_pg.connect() as conn:
        assert "ADMIN" in _enum_labels(conn)
