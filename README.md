# ACCO — AI Accounts Receivable Agent

ACCO is an enterprise-grade, multi-tenant SaaS platform for AI-assisted accounts receivable (AR) and collections automation. It combines deterministic financial policy enforcement with generative AI assistance for invoice parsing, payment reminder drafting, and communications classification.

---

## Architecture Overview

ACCO is built as a **modular monolith** emphasizing financial accuracy, tenant isolation, and strict auditability:

- **Backend**: Python 3.11+, FastAPI, Pydantic Settings, SQLAlchemy 2.x, PostgreSQL, Alembic, Celery, Redis.
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS.
- **Backend**: Python 3.11+, FastAPI, Pydantic Settings, SQLAlchemy 2.x, PostgreSQL, Alembic, Celery, Redis.
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS.
- **Development**: Native local setup (FastAPI on Uvicorn, Next.js dev server, local PostgreSQL 16).
- **Core Rules**:
  - `Decimal` / `NUMERIC` representation for all monetary balances.
  - Multi-tenant isolation at database query and service layers.
  - Advisory AI with deterministic policy approval gates.
  - Alembic-managed database migrations.

---

## Directory Structure

```
.
├── backend/            # FastAPI REST API, Alembic migrations & test suites
├── frontend/           # Next.js App Router front-end
├── docs/               # Architecture, domain models, and API specs
├── scripts/            # Development and verification scripts (PowerShell)
└── CLAUDE.md           # Architecture guidelines and conventions
```

---

## Native Local Development Setup

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+ & npm**
- **PostgreSQL 16+** installed and running locally

### 2. Database Setup (Local PostgreSQL)
Create the local development database and user using `psql` or `createdb`:
```sql
CREATE DATABASE acco_db;
CREATE USER acco_user WITH ENCRYPTED PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE acco_db TO acco_user;
```

### 3. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   # Windows PowerShell:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   # Linux/macOS:
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -e .
   ```
4. Configure environment variables:
   ```powershell
   # Copy backend/.env.example to backend/.env
   cp .env.example .env
   ```
   Ensure `ACCO_DATABASE_URL` matches your local PostgreSQL credentials:
   ```env
   ACCO_DATABASE_URL="postgresql+psycopg://acco_user:change_me@localhost:5432/acco_db"
   ```
5. Apply database migrations:
   ```bash
   alembic upgrade head
   ```
6. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Interactive Swagger docs are accessible at: `http://localhost:8000/docs`

### 4. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   The application will be available at: `http://localhost:3000`

### 5. Running Tests & Quality Checks
- **Backend Tests & Linting**:
  ```powershell
  cd backend
  pytest
  ruff check .
  ```
- **Frontend Tests, Typecheck & Build**:
  ```powershell
  cd frontend
  npm test
  npm run typecheck
  npm run lint
  npm run build
  ```

---

## Convenience Scripts (PowerShell)

- **Start Dev Environment**: `.\scripts\dev.ps1` (instructions/launcher for local frontend and backend)
- **Run Linting & Tests**: `.\scripts\check.ps1` (runs pytest, ruff, npm test, typecheck, lint, build)

