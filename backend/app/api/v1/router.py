from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter()

# Health & Diagnostics
api_router.include_router(health.router, prefix="/health", tags=["health"])

# NOTE: Domain endpoints (auth, organizations, users, customers, invoices,
# payments, collections, communications, policies, dashboard) are maintained
# as separate minimal placeholders until their respective implementation milestones.
