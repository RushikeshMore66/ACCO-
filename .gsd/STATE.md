# ACCO — System State & Session Memory

> **Updated**: 2026-10-13T13:45:00+05:30  
> **Milestone**: Production Readiness & Security Architecture (Phases 0–4)  
> **Status**: `PLANNING COMPLETE — READY FOR PHASE 0 EXECUTION`  

---

## 1. Current Repository Position

- **Git Branch**: `main`
- **Head Commit**: `7270aa3 make it supabase compatible code base`
- **Working Tree Status**: 6 modified files unstaged (Milestones 2C and 2C.1 verified work):
  - `backend/app/core/config.py`: Added pool parameters and `database_direct_url`.
  - `backend/app/db/session.py`: Added `close` parameter to `dispose_engine(close: bool = True)`.
  - `backend/app/main.py`: Made `lifespan` exception-safe with `try ... finally: dispose_engine()`.
  - `backend/app/workers/celery_app.py`: Wired `worker_process_init` to `dispose_engine(close=False)` and shutdown to `dispose_engine(close=True)`.
  - `backend/migrations/env.py`: Added direct URL fallback for Alembic migrations.
  - `backend/tests/test_database.py`: Added 14 focused tests verifying post-fork disposal, lifespan exception safety, and pool validation.

---

## 2. Completed Work Supported by Empirical Proof

All baseline and Task 0.1 verification checks passed with zero regressions:

| Area | Verification Command | Empirical Result |
| :--- | :--- | :--- |
| **Backend Config Hardening (Task 0.1)** | `.\venv\Scripts\pytest.exe -v tests/test_config.py` | **13 passed** in 0.18s |
| **Backend Database Lifecycle (2C.1)** | `.\venv\Scripts\pytest.exe -v tests/test_database.py` | **14 passed** in 0.73s |
| **Backend Full Test Suite** | `.\venv\Scripts\pytest.exe` | **101 passed**, 1 warning, 0 failures in 10.98s |
| **Backend Lint & Format (Task 0.1 files)** | `.\venv\Scripts\ruff.exe check app/core/config.py app/main.py tests/test_config.py` | **All checks passed!** |
| **Frontend Test Suite** | `npm test` (vitest run) | **19 test files passed**, **135 tests passed** in 17.84s |
| **Frontend TypeScript Types** | `npm run typecheck` (tsc --noEmit) | **Zero errors** (exit code 0) |
| **Frontend Linting** | `npm run lint` (next lint) | **No ESLint warnings or errors** |
| **Frontend Production Build** | `npm run build` (next build) | **Compiled successfully** (23/23 pages) |
| **Supabase MCP Server** | Local JSON config & Node API probe | Authenticated via PAT; connected to project `ubnxqookffeondmtsarn` (ACCO, PostgreSQL 17) |

---

## 3. Planning Artifacts Status

| Artifact | File Path | Status | Summary |
| :--- | :--- | :--- | :--- |
| **SPEC.md** | `.gsd/SPEC.md` | `FINALIZED` | Comprehensive architectural & security specification for Phases 0–4. Covers secret handling, auth, refresh token rotation, TOTP MFA, RBAC expansion, tenant isolation & PostgreSQL RLS, field encryption, audit logging, multi-channel compliance, payments, and data privacy. |
| **ROADMAP.md** | `.gsd/ROADMAP.md` | `FINALIZED` | Dependency-ordered roadmap decomposing Phases 0–4 into 27 granular, verifiable tasks with exact file targets, migration considerations, test requirements, and acceptance criteria. |
| **STATE.md** | `.gsd/STATE.md` | `ACTIVE` | Authoritative source of project state, verified evidence, active decisions, and next steps. |

---

## 4. Key Architectural Decisions & Resolved Discoveries

| ID | Topic | Finding / Choice | Rationale |
| :--- | :--- | :--- | :--- |
| **DEC-01** | **Missing `ADMIN` Role** | Code inspection revealed `UserRole` only has `OWNER`, `FINANCE_MANAGER`, `COLLECTOR`, `VIEWER`. | `ADMIN` role will be introduced in Task 0.2 via an Alembic migration (`ALTER TYPE userrole ADD VALUE 'ADMIN'`), and required for MFA alongside `OWNER`. |
| **DEC-02** | **Token Architecture** | Access token 15 min; refresh token 7 days stored as SHA-256 hash. | Refresh tokens are single-use with token family tracking. Replay detection revokes the entire family immediately. |
| **DEC-03** | **MFA Strategy** | RFC 6238 TOTP with encrypted secret storage and 10 single-use hashed recovery backup codes. | Enforced for `OWNER` and `ADMIN` prior to accessing any tenant management or operational endpoints. |
| **DEC-04** | **PostgreSQL RLS** | Dual-layer isolation: Application repository filter + PostgreSQL RLS policies bound to `app.current_tenant_id`. | Defense-in-depth against application-level query bugs; graceful fallback on SQLite in unit test runner. |
| **DEC-05** | **Field Encryption** | Authenticated AES-256-GCM / Fernet with key ID prefix and fallback decryption keys. | Enables zero-downtime key rotation for stored webhook secrets and third-party API credentials. |

---

## 5. Next Exact Task to Execute
 
```
▶ CURRENT: Phase 0 — Task 0.1 Completed & Verified
Task 0.1 implementation and test verification are complete (101/101 backend tests passing).
Atomic commit paused per Section 8 protocol awaiting authorization to commit Milestone 2C/2C.1 or stage in unified sequence.

▶ NEXT UP: Phase 0 — Task 0.2
Task: RBAC Schema Expansion & ADMIN Role Migration
Objective: Add ADMIN role to UserRole enum in model, Alembic migration, and endpoint authorization dependencies.
Target Files: backend/app/models/user.py, backend/migrations/versions/, backend/app/api/deps.py
```

---

## 6. Risks & Watch Items

1. **PostgreSQL RLS in SQLite Test Suite**: SQLite does not support PostgreSQL-specific RLS statements (`CREATE POLICY`, `current_setting`). Migrations and session hooks must check the active dialect and apply RLS statements conditionally or provide separate integration test harnesses for PostgreSQL.
2. **Account Lockout on MFA Loss**: If an `OWNER` loses their TOTP device and backup codes, an administrative recovery mechanism must exist (e.g., secondary owner verification or CLI recovery token script) to prevent permanent tenant abandonment.
3. **Pessimistic Concurrency on Invoices**: High-volume concurrent payment webhook ingestion requires row-level locks (`SELECT FOR UPDATE`) on target invoices to prevent balance decrement race conditions.
