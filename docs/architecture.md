# ACCO — Architecture

> Derived from *ACCO Product & Strategy Handbook v1.0* §5–§11, §14, §18–19. Items marked **[Reported]** are described in prior project reports and were not independently verified; **[Planned]** items are roadmap only. Re-verify against the current repository (`git status`, tests) before release decisions.

## 1. Architectural style

A **modular monolith** with a **deterministic policy / financial control plane** between AI components and authoritative systems. AI roles may be services, prompts or bounded workflows — not necessarily separate processes or autonomous agents. The important boundary is explicit responsibility, typed inputs/outputs, deterministic controls and auditable execution.

```
Owner / Finance Manager  (goals, approval settings, exceptions)
            │
   ACCO Orchestration Layer  (routes tasks, assembles context, tracks outcomes)
            │
 ┌──────────┼───────────────┬────────────────┐
 Collections  Reply Intel.   Dispute Asst.    Cash Application      ← advisory AI roles
 └──────────┴───────┬───────┴────────────────┘
                    ▼
  Deterministic Policy / Financial Control Plane
  (balance eligibility · consent · roles · approval · idempotency · audit)
                    ▼
  Authoritative systems: PostgreSQL · payment provider/bank evidence ·
  email/WhatsApp webhooks · accounting systems
```

**Core rule:** AI proposes; the backend policy gate decides; only an authorized service or human-approval handler executes. AI never writes the ledger directly.

## 2. Layered stack

| Layer | Responsibility | Technology / boundary |
|---|---|---|
| Web app | Finance dashboard, queues, case details, approvals, settings, customer portal (later) | Next.js App Router, TypeScript, Tailwind; BFF routes/auth helpers |
| API | AuthN, request validation, RBAC, tenant context, contracts | FastAPI (sync endpoints), Pydantic schemas |
| Domain/services | Collection policy, reply workflow, reconciliation, aging, disputes, forecast calculations | Python services; deterministic, unit-testable business rules |
| Persistence | Customers, invoices, payments, allocations, workflow & audit events | SQLAlchemy 2.x, PostgreSQL, Alembic migrations |
| Jobs / scheduler | Reminder scheduling, retry/recovery, promise sweeps, outbound delivery | Celery workers + Beat, **real shared Redis broker** outside dev |
| Provider adapters | Email, WhatsApp, payment gateways, accounting APIs | Adapter interfaces; signed webhooks; idempotency; provider event tracking |
| AI layer | Reply classification, message drafts, document extraction, summaries | Provider-neutral interface, structured outputs, evaluation, deterministic policy gate |
| Hosting / DB | Hosted backend + managed relational storage | Local PostgreSQL for dev; Supabase PostgreSQL proposed for hosted env |

**Reported foundation [Reported]:** FastAPI + SQLAlchemy + Alembic backend with multi-tenant Organization/User model and JWT login; customer/invoice models and import; payments, allocations/reversals, receivables/aging; collection queue/summary, message approval workflow, promises/disputes, collection-pause rules; email adapter with delivery tracking and inbound reply analysis (AI advisory, human retained); Next.js frontend with dashboards; DB pool config. Reported tests: 101 backend + 135 frontend passing (**backend tests used in-memory SQLite — PostgreSQL behavior unverified**).

## 3. Data-flow boundaries

- Browser talks only to the ACCO backend/BFF — **never** holds DB credentials or provider secrets.
- Backend derives user and **organization context from validated identity**; never trusts a client-supplied org ID.
- Workers use separate process-safe DB pools and a shared broker; task messages carry stable IDs, not PII payloads.
- Webhook endpoints verify signatures **against raw request bytes** and dedupe events before any state mutation.
- Provider APIs are not the financial source of truth unless they are the authoritative payment source. Accounting syncs need conflict handling, freshness indicators and idempotent writes.

## 4. Policy engine — order of operations

Executed immediately before any outbound send (and re-checked at dispatch):

| # | Check | If it fails |
|---|---|---|
| 1 | User/tenant authorization and source-record scope | Reject; reveal nothing of other tenants |
| 2 | Invoice exists, eligible, outstanding balance > 0 | Suppress or route to data exception |
| 3 | No dispute, legal hold, active pause or suppression | Stop unsent outreach; open exception if needed |
| 4 | Contact has permitted channel, consent evidence, valid destination | Don't send on that channel; request valid config |
| 5 | Quiet hours, frequency cap, stage cadence permit contact | Defer or record policy suppression |
| 6 | Template/provider/session-window requirements satisfied | Use valid approved template or don't send |
| 7 | Approval mode permits execution; draft meets guardrails | Queue for human review or block unsafe content |
| 8 | Last-minute state recheck + idempotency check | Don't send on stale eligibility |
| 9 | Persist dispatch intent → call provider → track result | Handle uncertainty without duplicate sends |

A draft-language guardrail detects prohibited wording, but deterministic rules and approval gates remain primary.

## 5. Message lifecycle

`draft → pending_approval → approved → queued → sending → accepted → delivered | bounced | failed | unknown | suppressed`

- Dispatch uses an **idempotency key**; provider IDs are stored; status webhooks are deduped and idempotent.
- Timeouts/ambiguous outcomes go to bounded retry → dead-letter → manual recovery. Never blind-resend.
- Store: exact approved text, template version, recipient, channel, invoice facts used, model + prompt version, approver.

## 6. Inbound pipeline (email / WhatsApp / payment)

1. Verify signature over raw bytes → reject if invalid/stale (log safe metadata only).
2. Replay-window check + unique `(provider, event_id)` constraint (DB-enforced dedupe, not in-memory).
3. If the event omits the body, fetch actual body via provider receiving API (never pass subject-only/placeholder to AI).
4. **Persist raw inbound content before invoking AI** so provider/model failure doesn't lose evidence; retries are safe.
5. AI analysis → schema-validated proposal (intent, date, amount, reference, confidence, evidence spans).
6. Policy gate + human routing → create promise/dispute/payment-claim records per rules.

## 7. Domain model

| Entity | Purpose | Key integrity needs |
|---|---|---|
| Organization | Tenant boundary, org settings, org-wide pause/policy | Every tenant-owned record references it |
| User / Role | Identity, membership, authz | RBAC; strong auth; org ID never trusted from client |
| Customer / Contact | Buyer company + authorized contacts | Tenant scope; normalized identifiers; preferences, consent, suppression |
| Invoice | Facts, due date, currency, payment state | Unique source refs; valid amount/dates; org-scoped relations |
| Payment | Receipt / authoritative payment record | Provider/bank ref, status, amount/currency, source event, idempotency key |
| PaymentAllocation | Payment ↔ invoice allocation | No over-allocation under concurrency; exact Decimal |
| PaymentReversal | Reversals, chargebacks, corrections | Never erase history; recompute net amounts consistently |
| CollectionPolicy | Stage cadence, approval, contact constraints | Validated config; deterministic evaluation; safe defaults |
| CollectionMessage / Delivery | Draft, approval, dispatch, status history | Idempotency, provider IDs, exact approval snapshot |
| InboundWebhookEvent | Provider event ingestion & dedupe | Signature, replay validation, unique provider/event key |
| PaymentPromise | Customer commitment + outcome | States: proposed, confirmed, past due, fulfilled, missed, cancelled |
| Dispute / Case | Invoice issue + resolution workflow | Correct invoice/customer scope, owner, SLA, reason, resolution |
| AuditEvent / Activity | Who did what, when, why | Append-only; actor, org, entity, before/after diff, request context |

### Financial invariants

- Money = Python `Decimal` + PostgreSQL `NUMERIC`. **Never float.**
- Every invoice/payment amount has a currency; never sum currencies without explicit conversion (rate, timestamp, source).
- Outstanding balance = invoice amount − valid allocations ± reversals/credits per the documented ledger model (exact status/timing rules defined in code + tests).
- One external payment/webhook/import event is processed **at most once** — DB unique constraints plus idempotent handlers, not just caches.
- Concurrent allocation paths lock payment + invoice rows (or another tested concurrency strategy) and re-check balances **inside** the transaction.
- Reversals update available/outstanding amounts without rewriting history.
- Customer claims, AI classifications, promises and payment links are **not** receipts.
- All timestamps timezone-aware, stored UTC; org/customer timezones applied for quiet hours and date-only promises.

### Metric definitions
DPD = max(0, as_of − due_date) for eligible unpaid invoices (date/timezone treatment explicit) · Aging buckets (e.g. current, 1–7, 8–30, 31–60, 61–90, 90+) must not overlap or leave gaps · DSO = avg AR ÷ net credit sales × days (agree definition per customer) · Promise-kept rate · Forecast error (by horizon/currency/cohort) · Recovery attribution (confirmed cash tied to an overdue invoice with explicit attribution rules; post-reminder payment ≠ causality).

## 8. Database and hosting

PostgreSQL is the system of record. Supabase is a managed PostgreSQL option, not a different DB; keep SQLAlchemy models, Alembic migrations and PG constraints.

| Environment | Database |
|---|---|
| Local dev | Native PostgreSQL |
| Integration tests | **Isolated** local PostgreSQL DB (Alembic upgrade from empty schema) |
| Hosted | Supabase PostgreSQL after compatibility validation |

| Connection mode | Best fit | ACCO considerations |
|---|---|---|
| Direct | Persistent backend where IPv6/connection budget permit | IPv6-only unless IPv4 add-on; one connection per app connection |
| Session pooler | Persistent clients when IPv4-only | Copy exact host/user/port from Supabase Connect; validate session semantics |
| Transaction pooler | Serverless/edge or many short-lived clients | No prepared statements / session state limits — test driver behavior first |

Budget connections across **every API worker and Celery process**. SQLite tests don't prove native enums, row locks, `SKIP LOCKED` claims, JSONB, NUMERIC precision or transaction behavior — a dedicated PG test DB is required before any production-readiness claim.

## 9. Provider integrations

| Integration | Purpose | Reliability requirements |
|---|---|---|
| Email (e.g. Resend) | Outbound reminders; inbound reply capture; delivery tracking | Verify webhook signatures + replay window; fetch inbound body if event has metadata only; idempotency/retry semantics; verified sender domain, bounces/complaints, unsubscribe path |
| WhatsApp Cloud API (official only) | Approved reminders + conversational replies | Business account/number setup; template mgmt; 24-hr service window; opt-outs; status webhooks; human handoff [R16][R20] |
| Razorpay / Stripe / UPI **[Planned]** | Payment links + verified payment notifications | Signed webhooks, provider idempotency, status lifecycle, refunds/reversals, reconciliation |
| Tally / Zoho Books / QuickBooks **[Planned]** | Source invoice/customer/payment facts; write back approved outcomes | Connector contract, external IDs, sync cursors, duplicate handling, conflict resolution, audit log; start with one connector driven by pilots |
| Bank statement files **[Planned]** | Payment evidence & remittance data | Secure import, file validation, source ID, duplicate line detection, match confidence + human review |

Provider-specific code lives behind adapter interfaces and must not leak into domain policy.

## 10. AI layer

- **Provider-neutral interface** so the domain doesn't hard-depend on a single model vendor.
- **Input:** validated, tenant-scoped facts with source IDs, freshness timestamps, only permitted fields.
- **Output:** schema-validated structured data with confidence, evidence references, uncertainty, suggested next action.
- **Audit:** model/provider, prompt version, input schema version, facts supplied, output hash/safe snapshot, approver, policy result, final outcome.
- **Evaluation:** synthetic + approved anonymized regression sets incl. adversarial/ambiguous replies; measure intent accuracy, date extraction, **false "paid" claims**, false dispute detection, unsafe language, correct abstention. Roll out prompt changes via offline eval + controlled pilot cohorts; keep rollback.
- Sensitive financial/customer data excluded from training/reuse by default absent clear contract + legal basis.
- Per-task abstention rules; no single universal confidence threshold.

## 11. Security architecture

**Identity & access:** fail fast outside dev if JWT secret, DB URL, webhook secrets or real Celery broker are missing/invalid · short-lived access tokens + rotating, hashed, single-use refresh tokens with family replay detection · login/registration rate limits + lockout · verified email, single-use expiring reset tokens (anti-enumeration) · TOTP MFA for privileged roles with hashed single-use recovery codes · ownership check on every read/write · consider PostgreSQL RLS (test pool/session reset and worker behavior).

**HTTP:** explicit CORS allowlist (no wildcard with credentials) · security headers, request/correlation IDs, size limits, safe errors · endpoint-risk-based rate limits with shared storage when distributed.

**Logging:** never log Authorization headers, tokens, provider keys, full DB URLs, sensitive payment info or full PII payloads · structured logs with safe IDs and classified error codes · separate audit events from operational diagnostics.

**Encryption & keys:** versioned encryption abstraction (AES-GCM or well-maintained Fernet) for sensitive contact data, bank details, provider credentials; keys outside DB; rotation + re-encryption; avoid deterministic encryption unless searchable-field needs are analyzed. Passwords use salted hashes, not encryption.

**Audit:** append-only; org, actor, action, entity type/id, timestamp, request ID/IP, before/after (or safe diff); restricted UPDATE/DELETE privileges + tests; redaction, retention limits, archival/export.

**Privacy (India DPDP Rules 2025):** notices, purposes, data-principal requests, retention/deletion/anonymization, processor agreements, safeguards, breach response — confirm timelines with counsel. B2B data still contains personal data (names, phones, emails, message content, IP/request metadata): minimize, least-privilege, review vendors.

## 12. Operational readiness

| Control | Minimum |
|---|---|
| Backups | Automated, plan-appropriate, documented retention, **restore tested** [R19] |
| Observability | Structured logs, traces, service metrics; alerts on failed jobs, webhook rejection bursts, queue age, delivery failures (Sentry, OpenTelemetry, Prometheus-compatible, PII-safe) |
| Worker reliability | Real shared Redis outside dev; separate worker/Beat; bounded retry, idempotency, recovery |
| Deployments | Versioned migrations, readiness checks, rollback/forward-fix plan |
| Incident response | Runbooks: secrets compromise, tenant exposure, queue backlog, provider abuse, payment mismatch, lost/duplicated events |
| Privacy requests | Export, deletion/anonymization, retention + legal hold across stores and providers |

## 13. Testing architecture (acceptance layers)

| Layer | Proof |
|---|---|
| Unit | Money math, policy decisions, parsing, idempotency helpers, validation |
| API integration | HTTP status, authz, tenant scope, audit events, error handling |
| PostgreSQL integration | Alembic from empty schema; constraints; NUMERIC precision; enums; locks; transactions; concurrency |
| Provider contract | Signed webhook fixtures, timeouts, retries, duplicates, status transitions |
| End-to-end pilot | Synthetic/consented data: import → communicate → reply → resolve → verified payment |
| Operational readiness | Restore test, queue recovery, secret rotation, monitoring, runbooks |

No external email/WhatsApp, production DB writes or payment activity during tests — synthetic data and mocked providers only.

## 14. Launch checklist (architectural questions that must be answerable "yes")

- Can every new endpoint prove authz, tenant scope, audit event and negative cross-tenant tests?
- Can the system recover if the API/worker crashes after the provider accepts a message?
- Can two concurrent allocations race without exceeding the payment balance?
- Can a customer claim a payment without affecting confirmed ledger state?
- Can a queued reminder be suppressed if payment/dispute status changes just before send?
- Can the business restore DB data and resume workers after an outage?
- Can support investigate an event without opening unrestricted message content?
- Can the team show why each forecast number is confirmed, promised, likely or at-risk?
