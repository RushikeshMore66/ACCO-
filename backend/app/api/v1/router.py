from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter()

# Health & Diagnostics
api_router.include_router(health.router, prefix="/health", tags=["health"])

# Authentication
from app.api.v1.endpoints import auth

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Customers
from app.api.v1.endpoints import customers
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])

# Invoices
from app.api.v1.endpoints import invoices
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])

# Payments
from app.api.v1.endpoints import payments
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])

# Receivables
from app.api.v1.endpoints import receivables
api_router.include_router(receivables.router, prefix="/receivables", tags=["receivables"])

# NOTE: Domain endpoints (payments, collections, communications, policies, dashboard) are maintained
# as separate minimal placeholders until their respective implementation milestones.
