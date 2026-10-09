from datetime import UTC, datetime


def now_utc() -> datetime:
    """Returns current timezone-aware UTC datetime."""
    return datetime.now(UTC)
