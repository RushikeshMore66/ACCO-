from fastapi import FastAPI

from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    description=(
        "ACCO is an AI-assisted accounts receivable "
        "and collections management platform."
    ),
    version="0.1.0",
)


@app.get("/", tags=["General"])
def read_root() -> dict[str, str]:
    """Return basic information about the application."""
    return {
        "name": settings.app_name,
        "message": "ACCO API is running.",
    }


@app.get("/health", tags=["Health"])
@app.get(f"{settings.api_v1_prefix}/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Report whether the API process is responding."""
    return {
        "status": "ok",
        "service": settings.app_name,
    }


@app.get("/health/ready", tags=["Health"])
@app.get(f"{settings.api_v1_prefix}/health/ready", tags=["Health"])
def readiness_check() -> dict[str, str]:
    """Report whether the application dependencies (e.g., database) are reachable."""
    from fastapi import HTTPException
    from sqlalchemy import text

    from app.db.session import engine

    if engine is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured.",
        )

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database is unreachable.",
        )

    return {
        "status": "ok",
        "service": settings.app_name,
        "database": "reachable",
    }

