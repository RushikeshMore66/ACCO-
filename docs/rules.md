# ACCO — Engineering & Agent Rules

> Rules for every contributor and every AI coding agent working on ACCO. Derived from *ACCO Product & Strategy Handbook v1.0* (§4, §5, §7, §10, §11, §14, §19). Keywords **MUST / MUST NOT / SHOULD** are used deliberately.

## 0. Prime directives
1. **Verified outcomes and trust come first.** Correct invoice facts, safe communication, resolved blockers, reconciled receipts, visible uncertainty.
2. **AI makes the workflow more intelligent; it never makes it less accountable.**
3. **Evidence, not prompts, marks work done.** No task or phase is complete on the basis of a report or a prompt — only empirical evidence (tests, output, migration run).
4. Keep one reliable loop; don't imitate every competitor feature.

## 1. Workflow rules

1. Follow **SPEC → PLAN → EXECUTE → VERIFY → COMMIT**, one coherent task per commit.
2. **MUST NOT** start the next task until the current one is green.
3. **MUST NOT** weaken, skip or delete tests to make checks pass.
4. After each applicable task run: backend `pytest` + `ruff`; frontend tests + typecheck + lint + build.
5. Before work: run `git status`. If unrelated uncommitted changes exist, **MUST NOT** reset, stash, discard or merge them to simplify a commit. Stage only your hunks (`git add -p`); if overlap makes an atomic commit unsafe, stop and report.
6. Every Alembic migration **MUST** have a reviewed downgrade strategy and be validated on **PostgreSQL** (not SQLite) from an empty schema.
7. A phase is done only when its tests, reviews, migrations and operational checks pass.
8. Describe planned/unverified capabilities as **planned** in code comments, docs, UI and sales material.
9. Prefer small, reviewable PRs; reference the task ID from `tasks.md`.

## 2. Tenant isolation and authorization

1. Org context **MUST** be derived server-side from validated identity — **never** from a client-supplied org ID.
2. **Every** repository/service query and mutation on tenant data **MUST** be org-scoped (customers, invoices, payments, allocations, messages, promises, disputes, audit).
3. Every new endpoint **MUST** ship with: authN, RBAC check, tenant scope, audit event for state changes, and a **negative cross-tenant test**.
4. Do not reveal another tenant's records in errors (use uniform 404/403 semantics).
5. **SHOULD** add PostgreSQL RLS as defense in depth; test session/pool context reset and worker behavior.
6. Roles: the ADMIN role enters only via a reviewed Alembic migration + permission tests.

## 3. Financial correctness

1. Money = Python `Decimal` and PostgreSQL `NUMERIC`. **MUST NOT** use `float` for money anywhere (including JSON parsing → parse as Decimal).
2. Every amount has a currency. **MUST NOT** sum across currencies without explicit conversion (rate, timestamp, source).
3. Outstanding balance is **derived** from invoice amount, valid allocations and reversals/credits — not from imported spreadsheet balances as permanent truth.
4. Reversals/chargebacks/corrections are **new records**; history is never deleted or rewritten.
5. Allocation paths **MUST** lock payment + invoice rows (or use another tested concurrency strategy) and re-check balances **inside the transaction**; prevent over-allocation.
6. One external payment/webhook/import event **MUST** take effect at most once: DB unique constraints + idempotent handlers (in-memory caches are not enough).
7. All timestamps timezone-aware, stored UTC; apply org/customer timezone for quiet hours and date-only promises.
8. Customer claims, AI classifications, promises, payment links and delivery events **MUST NOT** change confirmed ledger state.
9. Aging buckets **MUST NOT** overlap or leave gaps; metric definitions (DPD, DSO, promise-kept, forecast error) live in code + tests and match the documented definitions.

## 4. AI rules

1. AI output is **advisory**. AI **MUST NOT**: mark invoices paid, confirm promises, mutate the ledger, decide send eligibility, invent balances/terms/fees, make offers/concessions, decide liability, or close sensitive disputes.
2. AI input = validated, tenant-scoped facts with source IDs, freshness timestamps and only permitted fields. **Never** pass raw cross-tenant data or unnecessary PII.
3. AI output **MUST** be schema-validated structured data with confidence, evidence references/spans, uncertainty and suggested next action. Reject/route to human on schema failure.
4. Execution path: AI proposal → **deterministic policy gate** → authorized service or human-approval handler. Nothing else may execute effects.
5. **Abstain and route to a human** when: intent ambiguous, invoice mapping unclear, dispute/legal/angry/sensitive content, evidence conflicts, AI unavailable/low confidence. Preserve the original inbound content.
6. No single universal confidence threshold; set per task, with deterministic requirements for high-impact actions.
7. Record for every AI-assisted decision: model + provider, prompt version, input schema version, timestamp, facts supplied, output hash/safe snapshot, approver, policy result, final outcome.
8. Use a **provider-neutral** AI interface; no vendor-specific logic in the domain layer.
9. Don't use customer financial/PII data for training or reuse unless contract + legal basis allow.
10. Prompt/model changes **MUST** pass offline regression (incl. adversarial/ambiguous replies) and roll out to controlled cohorts with rollback. Track: intent accuracy, date extraction, **false "paid" claims**, false dispute detection, unsafe language, correct abstention.
11. Owner copilot: tenant-scoped data only; answers labelled calculation / observed fact / forecast; no unrestricted SQL/tool calls; no creating transactions; no invented accounting advice.

## 5. Communication and compliance

1. **Pre-send policy order is mandatory** (see `architecture.md` §4): authz → invoice eligible & balance > 0 → no dispute/hold/pause/suppression → consent & valid destination → quiet hours/frequency/cadence → template/session window → approval mode → last-minute recheck + idempotency → persist intent then call provider.
2. Re-check unpaid status, dispute/promise state, permission, frequency and approval **immediately before dispatch**.
3. Honor opt-out/STOP **before the next send**; record scope, timestamp and evidence of consent and suppression.
4. Use **only the official WhatsApp Business Platform / Cloud API**; no unofficial/browser automation. Business-initiated messages use approved templates; free-form only within the 24-hour service window.
5. Email: verified sender domain, bounce/complaint handling, unsubscribe/contact-preference path, clear identity + invoice context.
6. Content: polite, accurate, validated facts only. **No** threats, harassment, shaming, misleading legal consequences, invented penalties/fees, unapproved concessions, or excessive frequency. A language guardrail assists, but rules and approval gates are primary.
7. Later-stage messages require human approval when policy/risk demands. Default approval mode: review-before-send.
8. Keep a global pause, an org pause and a per-customer/contact pause — each audited. Disputes pause only the **affected invoice scope** unless policy says otherwise.
9. Delivery/acceptance is **not** proof of reading, understanding or payment.
10. Provide prompt human handoff for complex, angry, sensitive or ambiguous conversations.
11. MSME Samadhaan/legal escalation: surface options and keep records; **no legal conclusions or auto-filing** without explicit authorization and qualified review.

## 6. Webhooks, jobs and providers

1. Verify webhook signatures over **raw request bytes** before parsing JSON or mutating state; enforce replay window; dedupe on unique `(provider, event_id)` in the database.
2. Persist inbound content **before** calling AI; failures must not lose evidence; retries must be safe.
3. If an inbound event lacks the body, fetch it via the provider API — never feed placeholder/subject-only content to AI.
4. Outbound calls: timeouts, bounded retries, idempotency keys, dead-letter + manual recovery for ambiguous outcomes. Never blind-resend after a timeout.
5. Task payloads carry stable IDs, not PII.
6. Workers use process-safe DB pools; connection budgets account for every API worker and Celery process.
7. Provider-specific logic **MUST** stay in adapters; no leakage into domain policy.
8. Outside development, a real shared Redis broker is required; separate worker and Beat processes.
9. Accounting syncs: external IDs, cursors, conflict policy, freshness indicators, idempotent writes; **never overwrite trusted payment data from a lower-confidence source** — open an exception.

## 7. Security rules

1. **Fail closed** outside dev if JWT secret, DB URL, webhook signing secrets or real broker config are missing/invalid.
2. Short-lived access tokens; single-use **hashed** refresh tokens with rotation, revocation and family replay handling.
3. Rate-limit login/registration; temporary lockout; verified email; single-use expiring reset tokens with anti-enumeration responses.
4. TOTP MFA for privileged roles; hashed single-use recovery codes; audited recovery.
5. Explicit CORS allowlist (no wildcard with credentials); security headers; request/correlation IDs; request-size limits; safe error bodies; endpoint-appropriate rate limits (shared storage when distributed).
6. **Never log**: Authorization headers, access/refresh tokens, provider keys, full DB URLs, sensitive payment info, full PII message payloads.
7. Sensitive contact data, bank details, provider credentials: versioned authenticated encryption (AES-GCM or well-maintained Fernet); keys outside DB; rotation + re-encryption plan. Passwords: salted hashes (not encryption).
8. Browser **never** holds DB credentials or provider secrets.
9. No secrets in code or committed `.env`; secret scanning in CI.
10. Dependency audit, Bandit and frontend quality jobs in CI; keep a threat-model document.

## 8. Audit and observability

1. Every state-altering action writes an **append-only** audit event: org, actor, action, entity type/id, timestamp, request ID/IP, before/after (or safe diff), evidence references.
2. Restrict UPDATE/DELETE on audit tables at DB-privilege level and test it.
3. Redact sensitive values in diffs; define retention limits and export/archival.
4. Separate audit events from operational logs; use structured logs with safe IDs and classified error codes.
5. Support staff can investigate events without unrestricted message content access.

## 9. Data, import and demo rules

1. Import: preview + field mapping + required-field validation + currency checks + duplicate detection; show **row-level errors**; never create partial/corrupt invoices.
2. Re-uploading the same file **MUST** be idempotent (stable external ID / invoice-number rules / conflict policy per org).
3. **Demo fixtures MUST NOT mix with live data** or be displayed as live financial truth; demo UI is clearly badged.
4. Quarantine rows with data mismatches; require correction before outreach.
5. Privacy: data minimization, least privilege, retention and deletion/anonymization treated as product requirements (DPDP Rules 2025 — verify with counsel).

## 10. Testing rules

1. Use **synthetic or approved anonymized data** and **mocked providers** in tests. **No** real email/WhatsApp sends, production DB writes or payment activity during tests.
2. SQLite is fine for fast unit tests but **does not prove** PostgreSQL behavior; integration tests **MUST** run on an isolated PostgreSQL DB with Alembic upgrade from empty schema.
3. Required test layers: unit (money/policy/parsing/idempotency) · API integration (authz, tenant scope, audit) · PostgreSQL integration (constraints, NUMERIC, enums, locks, concurrency) · provider contract (signatures, timeouts, retries, duplicates, status transitions) · E2E pilot flow · operational readiness (restore, queue recovery, secret rotation).
4. Include **negative** tests: cross-tenant access, invalid signature, replayed webhook, duplicate event, concurrent allocation race, paid-just-before-send, opt-out-just-before-send.
5. A syntactically valid Redis URL is not evidence the broker/worker/Beat work; test the real thing in integration.

## 11. Product-claim rules (code comments, UI copy, sales, docs)

1. No numeric promises ("recover 30% more", "reduce DSO 20%") until pilots substantiate them with baseline, method and results.
2. Never say a customer paid because a message says so.
3. Don't claim ACCO is autonomous in finance/accounting/tax operations.
4. Don't claim competitors lack WhatsApp/AI/etc. without verification; competitor case studies aren't ACCO evidence.
5. Label forecasts as confirmed / promised / likely / at-risk with visible uncertainty.
6. Attribution: payment after a reminder ≠ causal proof of ACCO impact.
7. Planned capabilities are not advertised as available.

## 12. Pre-merge checklist

- [ ] `git status` clean of unrelated changes; atomic commit staged correctly
- [ ] Tests added/updated; none weakened; backend pytest + ruff + frontend test/typecheck/lint/build green
- [ ] New endpoint: authz + tenant scope + audit + negative cross-tenant test
- [ ] Money uses Decimal/NUMERIC; currency present; no float
- [ ] Migration has downgrade, validated on PostgreSQL from empty schema
- [ ] Idempotency/uniqueness enforced at the DB level for external events
- [ ] No secrets/PII in logs, code, or tests
- [ ] AI path: schema-validated, advisory-only, abstention + audit fields recorded
- [ ] Outbound path obeys the 9-step policy order and pre-send recheck
- [ ] Docs/UI don't overclaim planned or unverified features
