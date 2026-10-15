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

## 5. Evidence Log (2026-10-15, actual runs)

| Check | Result |
| :--- | :--- |
| T-1.1 git reconcile | Committed locally: `49bd7a1` (2C/2C.1 DB lifecycle), `60264ce` (Task 0.1 config, partial), `51be862` (docs/.gsd). 3 old-doc deletions (`development.md`, `inbound-email-operations.md`, `launch-readiness-review.md`) and 4 empty-spec deletions intentionally **left unstaged** for owner decision. |
| T-1.2 backend pytest | **101 passed**, 1 warning (SQLite) |
| backend `ruff check app tests migrations` | **FAIL: 406 baseline errors** (224 auto-fixable) - pre-existing, not task-caused; CI lint step cannot be green until cleaned |
| backend `ruff format --check` | **Ruff panicked** (internal crash in renderer; baseline files unformatted) - unresolved tooling issue |
| frontend | `npm test` 135 passed / 19 files; typecheck, lint clean; build OK |
| T-1.3 PG tests | `pytest tests/pg` against local PG16 DB `acco_test`: **7 passed** (single head, upgrade from empty, downgrade base + re-upgrade, enum cleanup, no float columns, NUMERIC money columns, timestamptz). Suite: 102 passed / 6 skipped without URL. |
| T-1.3 CI | `postgres:16` + `redis:7` services and `tests/pg` step added; YAML parses, **not run on GitHub (unverified)** |

**Findings:** (1) model/migration drift in `collection_policies`, `payment_reversals` unique constraint vs index (recorded as `KNOWN_DRIFT` in test; fix pending). (2) `customer_reply_analyses.confidence_score` is `double precision` (AI probability, not money; allow-listed). (3) docs vs `.gsd` differences: ROADMAP lacks Phase -1; its Phases 1-4, task 0.4 (no email verification), 0.10 (no DB-privilege audit block) and 0.1 (CORS) diverge from `docs/tasks.md`; docs win.

**Local PG test run:** create DB `acco_test`; set `ACCO_TEST_DATABASE_URL=postgresql+psycopg://<user>:<pw>@localhost:5432/acco_test`; `.env\Scripts\pytest.exe tests/pg -v`. Harness refuses non-`_test` names and hosted hosts and wipes the `public` schema.

## 5a. Next Exact Task

```
DONE: T-1.1, T-1.2, T-1.3 (local). Task 0.1 remains PARTIAL per docs gate:
  needs real-Redis broker integration test (CI Redis service now present).
NEXT: finish Task 0.1, then decide on the 406 ruff baseline errors / ruff format crash.
```

## 6. Risks & Watch Items

1. **PostgreSQL RLS in SQLite Test Suite**: SQLite does not support PostgreSQL-specific RLS statements (`CREATE POLICY`, `current_setting`). Migrations and session hooks must check the active dialect and apply RLS statements conditionally or provide separate integration test harnesses for PostgreSQL.
2. **Account Lockout on MFA Loss**: If an `OWNER` loses their TOTP device and backup codes, an administrative recovery mechanism must exist (e.g., secondary owner verification or CLI recovery token script) to prevent permanent tenant abandonment.
3. **Pessimistic Concurrency on Invoices**: High-volume concurrent payment webhook ingestion requires row-level locks (`SELECT FOR UPDATE`) on target invoices to prevent balance decrement race conditions.
