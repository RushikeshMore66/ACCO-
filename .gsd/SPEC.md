# ACCO — System Specification & Security Architecture

> **Status**: `FINALIZED`  
> **Milestone**: Production Readiness & Security Architecture (Phases 0–4)  
> **Target Version**: `0.2.0`  
> **Date**: 13 October 2026  
> **Classification**: Internal Engineering Specification

---

## 1. Executive Summary & Product Vision

**ACCO** is a code-first, multi-tenant Software-as-a-Service (SaaS) platform providing AI-assisted Accounts Receivable (AR) management, intelligent customer communications, and deterministic collection policy automation.

The platform bridges financial ledger accuracy and generative workflow automation:
- **Relational Ledger Source of Truth**: All invoices, payments, allocations, balances, and dispute statuses are governed by strict relational constraints, transactional ACID properties, and explicit precision arithmetic.
- **Deterministic Policy Controls**: Artificial intelligence and language models operate strictly in an advisory capacity (e.g., classifying inbound customer emails, suggesting payment promises, drafting empathetic collection notes). Every state-altering action—including dispatches, escalations, payment allocations, balance write-offs, and credit holds—is governed by deterministic policy checks and human-in-the-loop controls.
- **Enterprise Security & Tenant Isolation**: Every tenant's financial, operational, and customer records are cryptographically and logically isolated with defense-in-depth authorization, append-only audit tracking, and field-level sensitive data encryption.

---

## 2. Inviolable Architectural & Security Invariants

All platform components, extensions, endpoints, and background workers must adhere to these foundational invariants:

1. **Monetary Precision**:
   - Python code must always use `decimal.Decimal` with explicit rounding (`ROUND_HALF_UP`). Floating-point types (`float`, `DOUBLE PRECISION`) are prohibited for financial calculations.
   - Database schemas must use `NUMERIC(18, 4)` for monetary amounts and unit prices, and `NUMERIC(12, 2)` for summary presentation balances.
2. **Absolute Tenant Isolation**:
   - Every domain table (with the sole exception of global system lookup tables) must carry an indexed `organization_id` column.
   - Every repository query, mutation, batch operation, and background worker must be explicitly filtered and validated by `organization_id`. Client-supplied tenant IDs must never be trusted without cryptographic authentication context validation.
3. **Deterministic Policy Primacy over AI**:
   - AI outputs (intent classifications, promise extractions, suggested message drafts) are strictly uncommitted proposals until validated against deterministic policy rules (e.g., minimum balance thresholds, active payment promises, open dispute holds, customer contact frequency caps).
   - Inbound email claims (e.g., "I already paid $500 yesterday") never mark invoices paid or modify financial balances without a verified banking receipt or payment gateway reconciliation.
4. **Endpoint Authorization & Auditability**:
   - Every API endpoint must enforce authentication, explicit role-based access control (RBAC), and tenant boundary verification.
   - Every state-altering operation must write an immutable `AuditEvent` capturing actor identity, tenant context, affected entity, timestamp, and metadata diff.
5. **Database Migration Discipline**:
   - All database schema modifications must be introduced via version-controlled Alembic migrations with fully reviewed `upgrade()` and `downgrade()` procedures. Direct schema alterations or `Base.metadata.create_all()` in production environments are strictly forbidden.
6. **Zero Secret & PII Leakage**:
   - Secrets, tokens, encryption keys, and sensitive personally identifiable information (PII) must never be logged, printed to consoles, exposed in error responses, or checked into version control.
   - PII-safe logging filters must redact names, email addresses, phone numbers, and payment details in application logs.
7. **Non-Regressive Financial Safety**:
   - No existing financial safety guarantee, foreign key constraint, transaction isolation boundary, or regression test suite may be disabled, mocked out, or weakened to facilitate new feature delivery.

---

## 3. Role-Based Access Control (RBAC) & Role Migration

### 3.1 Role Discovery & Gap Analysis
Inspection of the current codebase (`backend/app/models/user.py`) reveals the following role enum:
```python
class UserRole(str, enum.Enum):
    OWNER = "OWNER"
    FINANCE_MANAGER = "FINANCE_MANAGER"
    COLLECTOR = "COLLECTOR"
    VIEWER = "VIEWER"
```
**Finding**: The `ADMIN` role requested for multi-factor authentication (MFA) enforcement does not currently exist in the database or model definition.

### 3.2 Role Hierarchy & Compatibility Specification
To satisfy administrative separation without breaking existing tenants, the `UserRole` enum will be expanded via a dedicated Alembic migration:

| Role | Operational Scope | MFA Requirement | Key Permissions |
| :--- | :--- | :--- | :--- |
| **`OWNER`** | Organization Owner | **Enforced (Mandatory)** | Full tenant management, ownership transfer, billing, delete tenant, all administrative functions. |
| **`ADMIN`** | Organization Administrator | **Enforced (Mandatory)** | User invitations, role modifications, security policies, collection policies, audit log inspection. |
| **`FINANCE_MANAGER`** | AR & Financial Lead | Optional (Recommended) | Write-off approvals, dispute resolution, manual payment recording, allocation reversal. |
| **`COLLECTOR`** | Collection Specialist | Optional | Case management, outbound message drafting, customer communication timeline, promise logging. |
| **`VIEWER`** | Read-Only Auditor | Optional | Read-only access to dashboards, invoices, reports, audit log. |

### 3.3 Migration & Backward Compatibility Plan
1. **Database Migration**:
   - For PostgreSQL: Execute `ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ADMIN' AFTER 'OWNER';` within an Alembic migration.
   - For SQLite (test suite): SQLAlchemy string/varchar enum compatibility requires no binary type mutation, preserving test execution speed.
2. **Permission Dependency Compatibility**:
   - Existing endpoints currently checking `[UserRole.OWNER, UserRole.FINANCE_MANAGER]` will be updated to `[UserRole.OWNER, UserRole.ADMIN, UserRole.FINANCE_MANAGER]` where administrative control is warranted, preventing privilege lockouts.

---

## 4. Phase-by-Phase Technical Specifications

### Phase 0: Security & Production Hardening Foundations

#### 0.1 Configuration & Secret Management
- **Fail-Closed Validation**: Use Pydantic `BaseSettings` (`backend/app/core/config.py`). When `ACCO_ENVIRONMENT == "production"`, application startup must fail immediately if mandatory secrets (`ACCO_JWT_SECRET_KEY`, `ACCO_DATABASE_URL`, `ACCO_ENCRYPTION_KEY`) are missing, default placeholders, or weaker than 32 random bytes.
- **Environment Isolation**: Separate test, development, and production configurations with explicit validation rules.

#### 0.2 Authentication, Refresh Token Rotation & Session Revocation
- **Access Tokens**: Short-lived JWTs (15-minute lifetime) containing `sub` (user_id), `org_id` (organization_id), `role`, and `token_family_id`.
- **Refresh Token Storage**: Dedicated `refresh_tokens` table:
  - `id`: UUID (Primary Key)
  - `user_id`: UUID (Foreign Key to users)
  - `token_hash`: String(64) (SHA-256 hash of random 64-character token; plaintext token is never stored)
  - `family_id`: UUID (Token family tracking for reuse detection)
  - `is_revoked`: Boolean
  - `expires_at`: TIMESTAMPTZ (7-day maximum lifetime)
  - `created_at`: TIMESTAMPTZ
- **Single-Use Rotation**: Exchanging a refresh token immediately marks it revoked and issues a new access token and fresh refresh token within the same `family_id`.
- **Replay / Breach Invalidation**: If an already-revoked refresh token is presented, the system flags a token reuse incident, immediately revokes all tokens within that `family_id`, logs a high-severity security audit event, and requires full password/MFA re-authentication.
- **Explicit Revocation / Logout**: `/api/v1/auth/logout` explicitly revokes the active refresh token family.

#### 0.3 TOTP Multi-Factor Authentication (MFA)
- **Algorithm**: Standard RFC 6238 TOTP (SHA-1, 30-second timestep, 6 digits).
- **Storage**:
  - `totp_secret_encrypted`: Encrypted bytes stored in `users` table via application encryption key.
  - `is_mfa_enabled`: Boolean default `False`.
  - `mfa_enforced`: Boolean derived from user role (`role in [OWNER, ADMIN]`).
- **Enrollment Flow**:
  1. User calls `POST /api/v1/auth/mfa/setup` &rarr; Returns otpauth URI, QR code base64, and 10 single-use 8-character recovery backup codes (hashed in database with bcrypt/Argon2).
  2. User calls `POST /api/v1/auth/mfa/enable` with valid TOTP code &rarr; Verifies code, sets `is_mfa_enabled = True`.
- **Login Flow with MFA**:
  1. `POST /api/v1/auth/login` verifies password &rarr; If MFA enabled or required by role, returns `202 Accepted` with a short-lived (5-minute) single-purpose `mfa_ticket`.
  2. `POST /api/v1/auth/mfa/verify` accepts `mfa_ticket` and 6-digit TOTP code (or unused recovery backup code) &rarr; Returns full session tokens.
- **Enforcement Boundary**: Users with `OWNER` or `ADMIN` roles without MFA configured are restricted to `/api/v1/auth/mfa/setup` and `/api/v1/auth/mfa/enable` endpoints until enrollment is complete.

#### 0.4 Account Recovery & Password Reset
- **Flow**: `POST /api/v1/auth/forgot-password` generates a cryptographically random, single-use token (hashed in database), expiring in 60 minutes.
- **Timing Protection**: Endpoint response time is normalized to prevent user enumeration. Returns generic confirmation regardless of email existence.
- **Execution**: `POST /api/v1/auth/reset-password` verifies token, updates `password_hash`, and invalidates all existing refresh token families for the user.

#### 0.5 Tenant Isolation & PostgreSQL Row Level Security (RLS)
- **Primary Defense**: Explicit SQLAlchemy repository filters (`WHERE organization_id = :org_id`) injected via verified FastAPI `get_current_tenant` dependency.
- **Defense-in-Depth RLS (PostgreSQL)**:
  - Database connection pool checkout executes `SET LOCAL app.current_tenant_id = '<uuid>';`.
  - Migration enables `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`.
  - Policy: `CREATE POLICY tenant_isolation_policy ON <table_name> USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);`.
  - Direct database operations in test environments using SQLite bypass PostgreSQL RLS commands gracefully while retaining strict repository tenant filter validation.

#### 0.6 HTTP & Request Hardening
- **Security Headers Middleware**: Injects `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'self'`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **CORS Hardening**: Replaces permissive wildcard CORS with strict origin whitelisting configured via `ACCO_CORS_ALLOWED_ORIGINS`.
- **Rate Limiting**: Rate limits applied per IP and per tenant on sensitive endpoints:
  - `/api/v1/auth/login`: 5 attempts per minute per IP.
  - `/api/v1/auth/mfa/verify`: 5 attempts per minute per IP.
  - `/api/v1/inbound-email/webhook`: 60 requests per minute per IP.
  - General API: 300 requests per minute per authenticated tenant.
- **Request Payload Size Limits**: Maximum 5 MB for general JSON payloads; 25 MB for batch invoice/customer CSV imports.

#### 0.7 Sensitive Field Encryption & Key Rotation
- **Algorithm**: Authenticated AES-256-GCM (or cryptography `Fernet` envelope).
- **Scope**: Email provider API keys, webhook signing secrets, SMTP passwords, TOTP secrets.
- **Key Rotation Architecture**:
  - `ACCO_ENCRYPTION_KEY`: Primary active key used for all new encryptions.
  - `ACCO_ENCRYPTION_FALLBACK_KEYS`: Comma-separated list of historical keys for transparent read decryption.
  - Encrypted ciphertext format: `v1:{key_id}:{iv}:{ciphertext}:{auth_tag}`.

#### 0.8 PII-Safe Logging & Redaction
- **Filter Implementation**: Custom `logging.Filter` applied to root and application loggers.
- **Redaction Rules**:
  - Emails: Masked to `j***@domain.com`.
  - Phone Numbers: Masked to `***-***-1234`.
  - Passwords, Tokens, API Keys: Completely replaced with `[REDACTED]`.
  - Customer Names & Bank Details: Redacted from log payload records.

#### 0.9 Append-Only Audit Logging
- **Model**: `audit_events`
  - `id`: UUID (Primary Key)
  - `organization_id`: UUID (Foreign Key)
  - `actor_id`: UUID (Nullable for system/webhook actions)
  - `actor_type`: Enum (`USER`, `SYSTEM`, `AI`, `WEBHOOK`)
  - `action`: String (e.g., `INVOICE_CREATED`, `PAYMENT_RECORDED`, `DISPUTE_OPENED`, `POLICY_UPDATED`, `USER_INVITED`)
  - `entity_type`: String (e.g., `Invoice`, `Payment`, `Customer`, `CollectionPolicy`)
  - `entity_id`: UUID
  - `timestamp`: TIMESTAMPTZ (UTC)
  - `ip_address`: String (Client IP)
  - `user_agent`: String
  - `payload_diff`: JSONB (Structured state changes, with sensitive values masked)
- **Immutability**: No update or delete operations permitted on `audit_events`. Read-only API exposed to `OWNER` and `ADMIN` roles.

#### 0.10 CI Security Tooling & Static Analysis
- Integration of automated static security analysis into `.github/workflows/ci.yml`:
  - `bandit` for AST security vulnerability scanning in Python code.
  - `pip-audit` / `safety` for dependency vulnerability monitoring.
  - `ruff` configured with security rules (`S`, `B`, `A001`).

---

### Phase 1: Core Product Completion & Operational Readiness

#### 1.1 Tenant Onboarding & Setup Checklist
- **Tenant Profile**: Organization legal name, primary billing contact email, corporate tax ID, business operating timezone (IANA), base operational currency (ISO 4217).
- **Onboarding Progress State Machine**: Track progress across `PROFILE_CONFIGURED`, `POLICY_ESTABLISHED`, `CUSTOMERS_IMPORTED`, `COMMUNICATIONS_VERIFIED`.
- **API & UI**: Checklist status endpoint `/api/v1/organizations/onboarding-status`.

#### 1.2 Multi-Currency Invoice & Customer Ingestion Engine
- **CSV Ingestion Pipeline**:
  - Multi-part file upload with strict streaming validation.
  - Header validation supporting standard ERP field mappings (NetSuite, QuickBooks, Xero).
  - Explicit decimal validation on invoice amount, balance, tax, and line items.
  - Currency normalization with verification against organization-enabled currency list.
  - Atomic batch processing: Database transaction per batch with structured row-level error reporting (e.g., row 14: invalid date format; row 22: missing invoice number).
  - Idempotent import: Invoices deduplicated on `(organization_id, invoice_number)`. Existing invoices updated only under explicit merge policy.

#### 1.3 Collection Policy Engine & Custom Escalation Ladders
- **Escalation Rules Model**:
  - `grace_period_days`: Days past due before initial reminder dispatch.
  - `contact_frequency_cap_days`: Minimum days between outreach touches to the same customer.
  - `minimum_balance_threshold`: Decimal amount below which automated reminders are suppressed.
  - `ladders`: Multi-step reminder escalation rules based on aging buckets (`DUE_IN_3_DAYS`, `OVERDUE_7_DAYS`, `OVERDUE_14_DAYS`, `OVERDUE_30_DAYS`, `FINAL_DEMAND`).
- **Deterministic Evaluation**: Central service evaluating eligible invoices against policy without LLM intervention.

#### 1.4 Dedicated Collection Case Workspace
- **Case State Machine**: `OPEN`, `IN_REVIEW`, `PROMISE_PENDING`, `DISPUTED`, `ESCALATED`, `RESOLVED`, `WRITTEN_OFF`.
- **Unified Timeline**: Chronological aggregation of:
  - Invoices and status updates
  - Sent reminders (email / WhatsApp)
  - Inbound communications and customer replies
  - Inbound AI analysis suggestions and review outcomes
  - Recorded payment promises and fulfillment status
  - Dispute filings and resolution records
  - Internal operator notes

---

### Phase 2: Compliant Multi-Channel Communications

#### 2.1 Email Compliance, Delivery & Unsubscribe Safeguards
- **Regulatory Compliance**: CAN-SPAM / GDPR compliant email generation:
  - Cryptographically signed one-click unsubscribe links (`/api/v1/communications/unsubscribe?token=...`).
  - Physical mailing address in email footer.
  - Clear sender identity and organization disclosure.
- **Delivery Webhook Engine**:
  - Secure webhook reception from email providers (Resend, SendGrid, Amazon SES) with HMAC signature verification.
  - Status tracking: `QUEUED`, `SENT`, `DELIVERED`, `OPENED`, `CLICKED`, `BOUNCED`, `SPAM_COMPLAINT`.
  - Bounce & Suppression Handling: Permanent bounces (`HARD_BOUNCE`) immediately flag customer email as invalid and suppress future automated dispatches.

#### 2.2 WhatsApp Business Messaging Channel
- **Consent & Opt-in Tracking**: Explicit opt-in timestamp and mechanism recorded on `Customer`.
- **Pre-Approved Templates**: All outbound WhatsApp communications restricted to verified Meta/Twilio message templates with variable substitution.
- **Opt-Out Automation**: Inbound messages matching regulatory keywords (`STOP`, `UNSUBSCRIBE`, `CANCEL`) immediately revoke customer messaging consent, log an audit event, and notify the assigned collector.

#### 2.3 Pre-Send Guardrails & Frequency Suppression
Prior to sending any communication (email, WhatsApp, letter), the dispatch engine must deterministically verify:
1. Customer has not opted out of the channel.
2. Invoice has not been marked `PAID` or `VOID`.
3. Invoice is not in an active `DISPUTED` state.
4. Customer does not have an active, unexpired `PROMISED` payment state that is currently honored.
5. Organization quiet hours: No communications dispatched outside customer local business hours (09:00 - 18:00).
6. Frequency cap: Time elapsed since last customer contact exceeds `contact_frequency_cap_days`.

#### 2.4 Human Review Boundaries for Sensitive Communications
- AI drafting operates in advisory mode.
- Formal demand notices, credit bureau escalation warnings, and messages with severity `HIGH` require explicit approval from an operator with `OWNER`, `ADMIN`, or `FINANCE_MANAGER` role before dispatch.

---

### Phase 3: Payments, Disputes, Promises & Financial Reconciliations

#### 3.1 Payment Processing & Gateway Webhook Ingestion
- **Payment Link Generation**: Support generating secure, hosted payment links (Stripe / checkout) linked to specific invoices.
- **Webhook Reconciliation**:
  - Secure webhook receiver with cryptographic signature verification.
  - Idempotent processing using transaction IDs as unique idempotency keys.
  - Concurrency control: Row-level lock (`SELECT FOR UPDATE`) on target `Invoice` records to prevent race conditions during concurrent allocation.
  - Automatic balance decrement: `remaining_balance = remaining_balance - allocated_amount`.
  - Status transition: When `remaining_balance == 0`, mark `Invoice.status = PAID`.

#### 3.2 Formal Dispute Management Lifecycle
- **Dispute Model**:
  - `id`: UUID
  - `organization_id`: UUID
  - `invoice_id`: UUID
  - `disputed_amount`: Decimal
  - `reason_code`: Enum (`WRONG_AMOUNT`, `GOODS_NOT_RECEIVED`, `DEFECTIVE_PRODUCT`, `ALREADY_PAID`, `TERMS_DISAGREEMENT`, `OTHER`)
  - `status`: Enum (`OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CREDIT_ISSUED`, `RESOLVED_CHARGE_CONFIRMED`, `REJECTED`)
  - `notes`: Text
- **Automated Collection Hold**: Opening a dispute immediately freezes automated reminder dispatches for the disputed invoice until formal resolution.
- **Resolution Actions**: Explicit credit memo issuance, invoice balance adjustment, or dispute rejection with collection resumption.

#### 3.3 Payment Promises & Fulfillment Sweeps
- **Promise Tracking**: Amount promised, target fulfillment date, payment channel, confidence score.
- **Automated Sweeps**: Background Celery task (`sweep_expired_promises_task`) periodically evaluates active promises:
  - If target date has passed + grace period and no matching payment was allocated &rarr; Transition promise to `BROKEN`, re-enable collection queue priority, and generate an operator alert.
  - If matching payment is received &rarr; Transition promise to `FULFILLED`.

#### 3.4 Concurrency & Ledger Integrity
- **Pessimistic Locking**: All payment recording, allocations, and reversals must acquire row locks on invoices within a database transaction.
- **No Negative Balances**: Validation constraint ensures `remaining_balance >= 0` and total allocated amounts equal exact payment receipt amount.

---

### Phase 4: Analytics, Integrations, Localization & Data Privacy

#### 4.1 Live AR Aging & Performance Analytics
- **Authoritative Aging Ledger**: Calculate aging dynamically from immutable ledger data across standard buckets: `Current (0-30 days)`, `31-60 days`, `61-90 days`, `91-120 days`, `120+ days`.
- **Key AR Metrics**:
  - **DSO (Days Sales Outstanding)**: Standard Countback and Simple Average calculation methods.
  - **CEI (Collection Effectiveness Index)**: Quantifying collections performance against available receivables over specified periods.
  - **Dispute Aging & Promise Break Rates**.
- **Multi-Currency Aggregation**: Group balances by native currency; provide organization base currency conversion using daily ECB/historical exchange rate snapshots.

#### 4.2 ERP & Accounting Integrations
- Bidirectional integration contracts for QuickBooks Online, Xero, and NetSuite:
  - Customer sync (external customer ID mapping).
  - Invoice sync (invoice status, line items, payments).
  - Outbound webhooks on ACCO payment receipts.

#### 4.3 Multi-Currency Presentation & Localization
- Presentation-layer formatting honoring organization base currency and customer locale.
- Business timezone awareness for collection calendars, quiet hours, and aging day boundaries.

#### 4.4 Data Privacy, Retention & Compliance
- **GDPR / CCPA Data Subject Access Requests (DSAR)**:
  - `/api/v1/privacy/export`: Generates machine-readable JSON/CSV export of all customer records, communications, and audit history.
  - `/api/v1/privacy/erasure`: Anonymizes customer PII (names, emails, phone numbers, addresses) while preserving immutable financial transaction records required for tax and accounting compliance.
- **Data Retention Policies**: Automated archival of communications and audit events older than organization statutory retention period (e.g., 7 years for tax records).

---

## 5. Security-Critical Design Decisions & Rationale

| Decision ID | Area | Choice / Approach | Rationale |
| :--- | :--- | :--- | :--- |
| **SEC-01** | **Secret Storage** | Fail-closed Pydantic Settings reading environment variables; no hardcoded defaults in production. | Prevents accidental deployment of default development credentials to staging/production. |
| **SEC-02** | **Session Tokens** | 15-minute access JWTs + rotating single-use refresh tokens stored as SHA-256 hashes. | Mitigates token theft risks; enables instant revocation and family-wide invalidation upon replay detection. |
| **SEC-03** | **MFA Enforcement** | RFC 6238 TOTP enforced for `OWNER` and `ADMIN` roles. | Administrative accounts are high-value targets with authority over organization policies and customer PII. |
| **SEC-04** | **Admin Role** | Introduce `ADMIN` role via Alembic migration; maintain compatibility for existing `FINANCE_MANAGER` permissions. | Avoids breaking current installations while enabling granular separation between system administration and financial operations. |
| **SEC-05** | **Tenant Isolation** | Programmatic repository filtering + PostgreSQL Row Level Security (RLS) defense-in-depth. | Double-layer defense ensures that even if an application query omits a filter, the database engine enforces tenant boundaries. |
| **SEC-06** | **Sensitive Data** | Authenticated AES-256-GCM / Fernet encryption with key version prefix and fallback rotation keys. | Protects third-party integration keys and webhook secrets at rest; allows zero-downtime key rotation. |
| **SEC-07** | **Audit Immutability** | Dedicated `audit_events` table with database-level insert-only policy. | Provides tamper-evident forensic tracking of financial modifications and user access for compliance (SOC 2, ISO 27001). |
| **SEC-08** | **AI Governance** | Strict human-in-the-loop review for formal demand notices and financial adjustments. | Guarantees legal compliance and eliminates hallucinated liability in collections communications. |

---

## 6. Acceptance Criteria & Quality Gates

Each implementation phase must satisfy the following acceptance gates before declaring completion:

1. **Test Coverage & Regression Zero**:
   - All existing 88 backend tests and 135 frontend tests must continue to pass without modification to their safety assertions.
   - Every new endpoint and service must have dedicated unit and integration tests covering happy paths, boundary conditions, unauthorized tenant access attempts, and error branches.
2. **Static Security Checks**:
   - `bandit -r app/` runs clean of high or medium severity security vulnerabilities.
   - `ruff check .` passes without lint or security violations.
   - `pip-audit` confirms zero unpatched vulnerabilities in direct dependencies.
3. **Frontend Validation**:
   - `npm test` passes 100% of test suites.
   - `npm run typecheck` passes with zero TypeScript compiler errors.
   - `npm run lint` passes with zero ESLint warnings or errors.
   - `npm run build` generates a production build successfully.
4. **Empirical Verification Evidence**:
   - Every completed task must record captured terminal output or test execution logs in `STATE.md` before landing the atomic commit.
