"""PostgreSQL integration harness (docs/tasks.md T-1.3).

Runs only when ACCO_TEST_DATABASE_URL points at a dedicated database whose name
ends in ``_test``. The public schema of that database is destroyed and rebuilt,
so the guard below is deliberately strict. Alembic runs in a subprocess with the
URL injected via environment so it can never fall back to the dev ``.env`` database.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]
FORBIDDEN_HOST_MARKERS = ("supabase", "pooler")


def _validated_test_url() -> str:
    raw = os.environ.get("ACCO_TEST_DATABASE_URL", "").strip()
    if not raw:
        pytest.skip("ACCO_TEST_DATABASE_URL not set; PostgreSQL integration tests skipped.")
    url = make_url(raw)
    if not url.drivername.startswith("postgresql"):
        pytest.fail("ACCO_TEST_DATABASE_URL must be a PostgreSQL URL.")
    if not (url.database or "").endswith("_test"):
        pytest.fail("Refusing to run: test database name must end with '_test'.")
    host = (url.host or "").lower()
    if any(marker in host for marker in FORBIDDEN_HOST_MARKERS):
        pytest.fail("Refusing to run: hosted databases are not permitted for tests.")
    return raw


def run_alembic(url: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "ACCO_DATABASE_URL": url,
        "ACCO_DATABASE_DIRECT_URL": url,
        "ACCO_ENVIRONMENT": "development",
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )


def reset_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="session")
def pg_url() -> str:
    return _validated_test_url()


@pytest.fixture(scope="session")
def pg_engine(pg_url: str):
    engine = create_engine(pg_url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture()
def empty_pg(pg_engine: Engine) -> Engine:
    """Engine bound to a freshly emptied schema."""
    reset_schema(pg_engine)
    return pg_engine


@pytest.fixture()
def migrated_pg(pg_url: str, empty_pg: Engine) -> Engine:
    result = run_alembic(pg_url, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-3000:]
    return empty_pg
