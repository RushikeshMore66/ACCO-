from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings

router = APIRouter()


@router.get("", response_model=dict[str, Any])
@router.get("/", response_model=dict[str, Any])
def health_check() -> dict[str, Any]:
    """
    Service liveness and diagnostic endpoint.
    Used by orchestrators, health checkers, and deployment verification.
    """
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
        "server_time_utc": datetime.now(UTC).isoformat(),
    }


@router.get("/liveness", response_model=dict[str, str])
def liveness() -> dict[str, str]:
    """Minimal liveness probe."""
    return {"status": "ok"}


@router.get("/readiness", response_model=dict[str, str])
def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
    """
    Readiness probe validating external dependencies (e.g., PostgreSQL).
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:  # noqa: BLE001 - map any DB failure to an opaque 503
        # Avoid exposing raw DB credentials or internal error traces
        raise HTTPException(status_code=503, detail="Service Unavailable: Database connection failed")
