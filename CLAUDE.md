# ACCO — Architecture & Development Guidelines

ACCO is a code-first, multi-tenant SaaS platform for AI-assisted accounts receivable (AR) and collections automation.

## Core Architectural Principles

1. **Modular Monolith**:
   - Single cohesive codebase with strict domain layer boundaries (`api`, `core`, `db`, `models`, `schemas`, `repositories`, `services`, `ai`, `integrations`, `workers`).
   - Direct database access is restricted to the repository layer. Services coordinate domain logic and enforce business invariants.
   - Do not create distributed microservices prematurely.

2. **Multi-Tenancy & Tenant Isolation**:
   - Every domain record belongs to an `Organization` (tenant).
   - All database queries and modifications MUST be tenant-scoped using `organization_id`.
   - Tenant context is extracted and verified at the API boundary via authentication dependencies. Never rely on client-supplied tenant identifiers without authorization checks.

3. **Financial Data Integrity**:
   - **PostgreSQL as Source of Truth**: Relational integrity and ACID transactions govern all invoices, payments, allocations, and collection state.
   - **Money Representation**: Always use Python `Decimal` and SQL `NUMERIC(18, 4)` or `NUMERIC(12, 2)` for amounts and balances. NEVER use floating-point types (`float`, `DOUBLE PRECISION`) for monetary values.
   - **Timestamps**: All timestamps must be timezone-aware (stored as `TIMESTAMPTZ` in UTC). Explicit organization business timezones apply solely at the presentation layer.
   - **Alembic Migrations**: Schema changes must strictly be managed via version-controlled Alembic migrations (`backend/migrations`). Never use `Base.metadata.create_all()` in production environments.

4. **Deterministic Policy Control Over AI**:
   - AI language models and classifiers are strictly advisory: they categorize inbound emails, extract invoice metadata, and draft communication suggestions.
   - **All financial actions and collection state transitions must pass deterministic policy evaluations** (e.g., grace periods, credit hold limits, balance thresholds, customer contact frequency caps).
   - Sensitive actions (e.g., sending formal demand notices, escalating to legal/collections agencies, dispute adjustments) require human approval workflows.

5. **Auditability & Idempotency**:
   - Every state-altering action must record an `AuditEvent` with actor identity, timestamp, and payload diff.
   - External integration hooks, payment syncs, and reminder dispatches must enforce idempotency via unique idempotency keys.

---

## Directory Organization

```
acco/
├── backend/            # Python 3.11+ / FastAPI / SQLAlchemy / Alembic / Celery
│   ├── app/
│   │   ├── core/       # Settings, security, logging, exceptions, constants
│   │   ├── api/        # FastAPI routers, dependencies, and v1 endpoints
│   │   ├── db/         # Engine, session, and declarative Base
│   │   ├── models/     # SQLAlchemy ORM models (tenant-scoped)
│   │   ├── schemas/    # Pydantic request/response schemas
│   │   ├── repositories/ # Database persistence and tenant queries
│   │   ├── services/   # Business logic and deterministic policy engines
│   │   ├── ai/         # LLM providers, prompts, classifiers, collectors
│   │   ├── integrations/ # Email (SMTP/Resend), storage (S3), ERP/accounting
│   │   ├── workers/    # Celery tasks (reminders, escalations, followups)
│   │   └── utils/      # Money, datetime, pagination helpers
│   ├── migrations/     # Alembic schema migration versions
│   └── tests/          # Unit, integration, and API test suites
├── frontend/           # Next.js App Router / TypeScript / Tailwind CSS
│   └── src/
│       ├── app/        # App Router pages and route groups
│       ├── components/ # UI component library and design system
│       ├── features/   # Domain-specific UI features (invoices, collections, etc.)
│       └── lib/        # API clients, auth helpers, utility functions
├── docs/               # Domain specifications, architecture, and contracts
├── scripts/            # Automation scripts for dev and validation
└── .github/workflows/  # CI pipeline configurations
```

---

## Development & Test Conventions

- **Virtual Environment**: Use the dedicated virtual environment in `backend/venv`.
- **Backend Tests**: Run `pytest` inside `backend/`. Every endpoint and service requires automated tests.
- **Typing & Linting**: Strict type annotations with `mypy` / `ruff`.
- **Secrets Management**: Configuration is managed exclusively via Pydantic Settings reading environment variables or `.env`. Never commit secrets or real customer financial records.
