"""Alembic and schema-integrity checks against a real PostgreSQL database."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text

import app.models  # noqa: F401
from app.db.base import Base
from tests.pg.conftest import BACKEND_DIR, run_alembic

pytestmark = pytest.mark.postgres


def _script() -> ScriptDirectory:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return ScriptDirectory.from_config(cfg)


def test_single_migration_head():
    assert len(_script().get_heads()) == 1


def test_upgrade_head_from_empty_schema(pg_url, migrated_pg):
    head = _script().get_current_head()
    with migrated_pg.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == head
        tables = {
            r[0]
            for r in conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
            )
        }
    assert set(Base.metadata.tables) <= tables


def test_downgrade_to_base_and_reupgrade(pg_url, migrated_pg):
    down = run_alembic(pg_url, "downgrade", "base")
    assert down.returncode == 0, down.stderr[-3000:]
    with migrated_pg.connect() as conn:
        left = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name <> 'alembic_version'"
            )
        ).fetchall()
        enums = conn.execute(text("SELECT typname FROM pg_type WHERE typtype='e'")).fetchall()
    assert left == [], f"tables left after downgrade: {left}"
    assert enums == [], f"enum types left after downgrade: {enums}"
    up = run_alembic(pg_url, "upgrade", "head")
    assert up.returncode == 0, up.stderr[-3000:]


# Known, reviewed baseline drift (uniqueness is enforced either way; only its
# representation differs between models and migrations). Do not extend this set
# without a decision; fix by aligning models/migrations in a reviewed change.
KNOWN_DRIFT = {
    ("remove_constraint", "collection_policies"),
    ("remove_constraint", "payment_reversals"),
    ("add_index", "payment_reversals"),
}


def _summarise(diff):
    out = set()
    for item in diff:
        op, obj = item[0], item[1]
        table = getattr(obj, "table", None)
        out.add((op, getattr(table, "name", str(obj))))
    return out


def test_models_match_migrations(migrated_pg):
    with migrated_pg.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert _summarise(diff) == KNOWN_DRIFT, f"unexpected model/migration drift: {diff}"


def test_no_floating_point_columns(migrated_pg):
    with migrated_pg.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name, data_type FROM information_schema.columns "
                "WHERE table_schema='public' "
                "AND data_type IN ('double precision','real')"
            )
        ).fetchall()
    # AI confidence scores are probabilities, not monetary values.
    rows = [r for r in rows if (r[0], r[1]) != ("customer_reply_analyses", "confidence_score")]
    assert rows == [], f"floating-point columns found: {rows}"


def test_money_columns_are_numeric(migrated_pg):
    with migrated_pg.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name, data_type FROM information_schema.columns "
                "WHERE table_schema='public' "
                "AND (column_name LIKE '%amount%' OR column_name LIKE '%balance%') "
                "AND data_type <> 'numeric' "
            )
        ).fetchall()
    rows = [r for r in rows if not r[1].endswith(("_id", "_at")) and "currency" not in r[1]]
    assert rows == [], f"non-NUMERIC money-like columns: {rows}"


def test_timestamps_are_timezone_aware(migrated_pg):
    with migrated_pg.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema='public' "
                "AND data_type = 'timestamp without time zone'"
            )
        ).fetchall()
    assert rows == [], f"naive timestamp columns: {rows}"
