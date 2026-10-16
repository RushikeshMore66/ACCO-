from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings, validate_settings
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.db.session import dispose_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager ensuring configuration is valid and database resources are disposed gracefully."""
    try:
        validate_settings(settings)
        yield
    finally:
        dispose_engine()


app = FastAPI(
    title=settings.app_name,
    description=("ACCO is an AI-assisted accounts receivable and collections management platform."),
    version="0.1.0",
    lifespan=lifespan,
    # Interactive docs are an information leak in production unless explicitly enabled.
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)
# Middleware order: last added = outermost. Request context wraps everything so even error
# responses (413, CORS rejections) carry X-Request-ID and security headers.
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
app.add_middleware(
    BodySizeLimitMiddleware,
    default_limit=settings.max_request_body_bytes,
    upload_limit=settings.max_upload_body_bytes,
)
app.add_middleware(
    SecurityHeadersMiddleware,
    hsts=not settings.is_development,
    docs_paths=("/docs", "/redoc", "/openapi.json"),
)
app.add_middleware(RequestContextMiddleware)
app.include_router(api_router, prefix=settings.api_v1_prefix)


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
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="Database is unreachable.",
        )

    return {
        "status": "ok",
        "service": settings.app_name,
        "database": "reachable",
    }
