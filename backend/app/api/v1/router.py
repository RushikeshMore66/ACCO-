from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    collections,
    collections_messages,
    customers,
    dashboard,
    email_deliveries,
    health,
    invoices,
    payments,
    promises_disputes,
    receivables,
    reply_analyses,
    webhooks,
)

api_router = APIRouter()

# Health & Diagnostics
api_router.include_router(health.router, prefix="/health", tags=["health"])

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Customers
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])

# Invoices
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])

# Payments
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])

# Receivables
api_router.include_router(receivables.router, prefix="/receivables", tags=["receivables"])

# Dashboard
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])

# Collections
api_router.include_router(collections.router, prefix="/collections", tags=["collections"])
api_router.include_router(collections_messages.router, prefix="/collections", tags=["collections_messages"])
api_router.include_router(promises_disputes.router, prefix="/collections", tags=["promises_disputes"])
api_router.include_router(email_deliveries.router, prefix="/collections", tags=["email_deliveries"])
api_router.include_router(reply_analyses.router, prefix="/collections", tags=["reply_analyses"])

# Webhooks
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

# NOTE: Domain endpoints (payments, collections, communications, policies, dashboard) are maintained
# as separate minimal placeholders until their respective implementation milestones.
