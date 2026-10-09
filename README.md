# ACCO — AI Accounts Receivable Agent

ACCO is an enterprise-grade, multi-tenant SaaS platform for AI-assisted accounts receivable (AR) and collections automation. It combines deterministic financial policy enforcement with generative AI assistance for invoice parsing, payment reminder drafting, and communications classification.

---

## Architecture Overview

ACCO is built as a **modular monolith** emphasizing financial accuracy, tenant isolation, and strict auditability:

- **Backend**: Python 3.11+, FastAPI, Pydantic Settings, SQLAlchemy 2.x, PostgreSQL, Alembic, Celery, Redis.
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS.
- **Infrastructure**: Docker Compose (PostgreSQL 16, Redis 7, Backend API).
- **Core Rules**:
  - `Decimal` / `NUMERIC` representation for all monetary balances.
  - Multi-tenant isolation at database query and service layers.
  - Advisory AI with deterministic policy approval gates.
  - Alembic-managed database migrations.

---

## Directory Structure

```
.
├── backend/            # FastAPI REST API & worker services
├── frontend/           # Next.js App Router front-end
├── docs/               # Architecture, domain models, and API specs
├── scripts/            # Development and verification scripts
├── docker-compose.yml  # Local multi-container development environment
└── CLAUDE.md           # Architecture guidelines and conventions
```

---

## Quickstart

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 18+ & npm

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

### 3. Local Development with Docker Compose
Start PostgreSQL, Redis, and the backend service:
```bash
docker compose up -d
```

### 4. Running Backend Locally
Navigate to the backend directory, activate your virtual environment, and run:
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -e .
uvicorn app.main:app --reload --port 8000
```
API Documentation will be accessible at: `http://localhost:8000/docs`

### 5. Running Tests
```bash
cd backend
pytest
```

---

## Verification Scripts (PowerShell)

- **Start Dev Environment**: `.\scripts\dev.ps1`
- **Run Linting & Tests**: `.\scripts\check.ps1`
