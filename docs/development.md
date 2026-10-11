# Native Local Development Guide — ACCO

ACCO uses a native development workflow without Docker, containers, or virtualization. This ensures rapid feedback, straightforward debugging, and direct integration with your development workstation.

---

## Architecture Stack

- **Backend**: Python 3.11+ using FastAPI, Pydantic Settings, SQLAlchemy 2.0 (async/sync models), Alembic migrations, and Uvicorn.
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons.
- **Database**: PostgreSQL 16+ running natively on `localhost:5432`.
- **Workers/Cache (Optional in early dev)**: Redis 7 running natively for Celery background tasks.

---

## 1. System Prerequisites

1. **Python**: 3.11 or higher
2. **Node.js**: v18.x or v20.x with `npm`
3. **PostgreSQL**: Version 15 or 16 installed as a native Windows service or macOS/Linux daemon.

---

## 2. PostgreSQL Setup (Native)

ACCO requires a dedicated PostgreSQL database and user.

### A. Database Creation
Connect to your local PostgreSQL instance (via `psql` or pgAdmin):
```sql
CREATE DATABASE acco_db;
CREATE USER acco_user WITH ENCRYPTED PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE acco_db TO acco_user;
ALTER DATABASE acco_db OWNER TO acco_user;
```

### B. Verification
Test connection via command line:
```bash
psql -U acco_user -d acco_db -h localhost -p 5432
```

---

## 3. Backend Setup

### A. Virtual Environment
Navigate to the `backend/` directory:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```
*(On macOS/Linux: `source venv/bin/activate`)*

### B. Install Dependencies
```bash
pip install -e .
```
*(Dependencies are tracked in `pyproject.toml` and `requirements.txt` using `psycopg` binary drivers.)*

### C. Environment Configuration
Copy the sample environment file:
```powershell
cp .env.example .env
```
Ensure your database connection string and secret keys are configured in `backend/.env`:
```env
ACCO_APP_NAME=ACCO
ACCO_ENVIRONMENT=development
ACCO_API_V1_PREFIX=/api/v1
ACCO_DATABASE_URL="postgresql+psycopg://acco_user:change_me@localhost:5432/acco_db"
ACCO_JWT_SECRET_KEY="generate_a_secure_random_key_here"
ACCO_ACCESS_TOKEN_EXPIRE_MINUTES=30
ACCO_JWT_ISSUER="acco"
```

### D. Run Database Migrations
Run Alembic migrations to bring the database schema to the latest version:
```bash
alembic upgrade head
```

### E. Start Backend Server
```bash
uvicorn app.main:app --reload --port 8000
```
- API Base: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- Healthcheck: `http://localhost:8000/api/v1/health`

---

## 4. Frontend Setup

### A. Install Dependencies
Navigate to the `frontend/` directory:
```bash
cd frontend
npm install
```

### B. Start Development Server
```bash
npm run dev
```
- Application: `http://localhost:3000`

---

## 5. Verification & Testing

### Automated Quality Check Script
You can run all backend and frontend validation checks with a single PowerShell script:
```powershell
.\scripts\check.ps1
```

### Manual Individual Commands
- **Backend Tests**:
  ```powershell
  cd backend
  pytest
  ```
- **Backend Code Quality & Linting**:
  ```powershell
  cd backend
  ruff check .
  ```
- **Frontend Unit & Component Tests**:
  ```powershell
  cd frontend
  npm test
  ```
- **Frontend TypeScript Validation**:
  ```powershell
  cd frontend
  npm run typecheck
  ```
- **Frontend ESLint**:
  ```powershell
  cd frontend
  npm run lint
  ```
- **Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  ```

---

## 6. Safe Database Migrations & Backups

- **Generate new migration**: `alembic revision --autogenerate -m "describe_change"`
- **Review migration**: Always inspect generated migrations under `backend/migrations/versions/` prior to running `alembic upgrade head`.
- **Local DB Backup (pg_dump)**:
  ```powershell
  pg_dump -U acco_user -h localhost -F c -b -v -f acco_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump acco_db
  ```
- **Local DB Restore (pg_restore)**:
  ```powershell
  pg_restore -U acco_user -h localhost -d acco_db -v acco_backup.dump
  ```
