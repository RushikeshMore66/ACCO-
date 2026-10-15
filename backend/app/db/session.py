from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Engine configured with pool_pre_ping to automatically recover from dropped connections
engine = None
SessionLocal = None

def _build_engine(database_url: str):
    """
    Construct a hardened SQLAlchemy engine with dialect-specific connection arguments.
    PostgreSQL/psycopg: TCP keepalives and connect_timeout.
    SQLite/other: dialect defaults without invalid PG arguments.
    """
    is_sqlite = database_url.startswith("sqlite")
    connect_args = {}

    if not is_sqlite:
        connect_args = {
            "connect_timeout": settings.database_connect_timeout_seconds,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        }

    return create_engine(
        database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout_seconds,
        pool_recycle=settings.database_pool_recycle_seconds,
        connect_args=connect_args,
    )


if settings.database_url:
    engine = _build_engine(settings.database_url)
    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )


def dispose_engine(close: bool = True) -> None:
    """
    Safely dispose of the engine connection pool.

    When close=True (default, for shutdown), checked-in connections are actively closed.
    When close=False (e.g., worker_process_init post-fork), the pool is replaced passively
    without closing underlying connections owned by the parent process.
    """
    if engine is not None:
        engine.dispose(close=close)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a SQLAlchemy database session.
    Automatically closes the session. Caller is responsible for explicit commits.
    Rolls back transaction on unhandled exceptions.
    """
    if SessionLocal is None:
        raise RuntimeError("Database URL is not configured.")

    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
