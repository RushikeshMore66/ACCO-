from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db

from app.core.config import settings

router = APIRouter()


@router.get("", response_model=Dict[str, Any])
@router.get("/", response_model=Dict[str, Any])
def health_check() -> Dict[str, Any]:
    """
    Service liveness and diagnostic endpoint.
    Used by orchestrators, health checkers, and deployment verification.
    """
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/liveness", response_model=Dict[str, str])
def liveness() -> Dict[str, str]:
    """Minimal liveness probe."""
    return {"status": "ok"}


@router.get("/readiness", response_model=Dict[str, str])
def readiness(db: Session = Depends(get_db)) -> Dict[str, str]:
    """
    Readiness probe validating external dependencies (e.g., PostgreSQL).
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        # Avoid exposing raw DB credentials or internal error traces
        raise HTTPException(status_code=503, detail="Service Unavailable: Database connection failed")
