# ACCO — Tasks & Roadmap

> Derived from *ACCO Product & Strategy Handbook v1.0* §14–§15, §19. Five phases of small, verified releases. **A phase is complete only after its required tests, reviews, migrations and operational checks pass.** Status column reflects *reported* progress — re-verify before ticking.
>
> Legend: `[ ]` not started · `[~]` reported partial / unverified · `[x]` verified done (needs evidence) · **AG** = acceptance gate.
> Workflow per task: **SPEC → PLAN → EXECUTE → VERIFY → COMMIT**, one atomic commit, next task only when green.

---

## Phase −1 — Housekeeping (do first)

- [ ] **T-1.1 Reconcile git state.** Run `git status`; list uncommitted changes from Milestone 2C/2C.1 and Task 0.1; decide commit/split plan. *Do not reset/stash/discard unrelated changes.* **AG:** working tree explained; atomic commits possible.
- [ ] **T-1.2 Re-verify reported status.** Run the backend (reported 101) and frontend (reported 135) suites, typecheck, lint, build; record real numbers in `memory.md`. **AG:** actual results documented.
- [ ] **T-1.3 Stand up isolated PostgreSQL test DB.** Separate DB/schema for integration tests; `alembic upgrade head` from empty. **AG:** CI job green on PostgreSQL.

---

## Phase 0 — Foundations and security hardening

| ID | Task | Status | Acceptance gate |
|---|---|---|---|
| 0.1 | **Config fail-closed:** required non-dev JWT secret, DB URL, webhook secret; real Redis broker; correct CI env var names | [~] | App refuses to start in non-dev with missing/invalid values; CI uses correct names; integration test against a real Redis broker |
| 0.2 | **Roles & authorization:** review role enum; add ADMIN via reviewed Alembic migration; consistent permissions in model, migration, APIs, UI | [ ] | Permission matrix tests pass for every role; migration upgrade + downgrade tested on PG |
| 0.3 | **Refresh tokens:** short-lived access, single-use hashed refresh, rotation, revocation, token-family replay handling | [ ] | Replay of a used refresh token revokes the family; hashes only in DB; tests |
| 0.4 | **Account verification/recovery:** verified email; single-use expiring reset tokens; anti-enumeration | [ ] | Same response for known/unknown email; token reuse/expiry rejected |
| 0.5 | **TOTP MFA** for privileged roles; secure secret storage; hashed single-use recovery codes; controlled recovery | [ ] | MFA enforced for privileged roles; recovery code single-use; audited recovery |
| 0.6 | **Tenant isolation audit:** every repo/service query + mutation (customers, invoices, payments, messages, audit); cross-tenant tests; evaluate PostgreSQL RLS | [ ] | Cross-tenant test suite green on PG; audit checklist completed; RLS decision recorded |
| 0.7 | **HTTP controls:** CORS allowlist, security headers, request limits, request IDs, rate/lockout controls | [ ] | Header/CORS/limit tests; lockout after N failures |
| 0.8 | **Field encryption:** key-versioned encryption for sensitive contact data, bank details, provider credentials | [ ] | Round-trip + key rotation/re-encryption test; keys not in DB |
| 0.9 | **PII-safe structured logging;** no tokens/keys/DB URLs/full payloads | [ ] | Log-scrubbing tests; sample logs reviewed |
| 0.10 | **Audit system:** append-only events with actor, org, IP/request context, before/after diff | [ ] | UPDATE/DELETE blocked at DB privilege level (tested); all state changes emit events |
| 0.11 | **CI security:** dependency audit, Bandit, secret scanning, frontend quality job, threat-model doc | [ ] | CI pipeline blocks on findings; `SECURITY_THREAT_MODEL.md` committed |

**Phase 0 exit gate:** security checklist signed off; tenant isolation tests on PostgreSQL green; fail-closed config proven; no known secret exposure.

---

## Phase 1 — Complete the core workflow

| ID | Task | Status | Acceptance gate |
|---|---|---|---|
| 1.1 | **Collection policy config UI/API** (stages, cadence, channel, approval mode, quiet hours, frequency caps, suppression, escalation, global stop, safe language) | [~] | Backend rejects configs that bypass mandatory safety rules; UI live-validates; tests |
| 1.2 | **CSV/XLSX invoice import:** mapping, preview, validation, duplicate handling, line-level error report | [~] | Re-upload of the same file creates 0 duplicates; error CSV downloadable; currency/precision checks |
| 1.3 | **Collection case detail & timeline** (messages, provider states, replies, AI analyses, promises, disputes, approvals, notes, payments); hide unfinished entry points | [~] | Timeline renders all event types with source labels; no dead links to unbuilt features |
| 1.4 | **First-run checklist**, demo/live separation, user roles, basic daily action brief | [ ] | Demo data can't appear in live totals; checklist drives onboarding; brief lists top tasks with reasons |
| 1.5 | **Dashboard definitions:** every number has definition, as-of time, currency scope, drill-through; aging buckets non-overlapping | [~] | Aging boundary tests; drill-through reconciles to totals |
| 1.6 | **Onboarding data-quality report** | [ ] | Report flags missing contacts, bad email/phone, missing due dates, stale balances, duplicates |
| 1.7 | **PostgreSQL concurrency tests** for allocations/reversals (row locks, no over-allocation) | [ ] | Two concurrent allocations cannot exceed payment balance |

**Phase 1 AG (from handbook):** an authorized user imports a synthetic ledger, reviews exceptions, creates a safe draft, tracks the response, and sees payment state **without false financial transitions**.

---

## Phase 2 — Communication compliance

| ID | Task | Status | Acceptance gate |
|---|---|---|---|
| 2.1 | **Consent, suppression, unsubscribe/STOP**, quiet hours, frequency caps per customer/contact timezone | [ ] | STOP honored before next send; quiet-hour deferral test across timezones |
| 2.2 | **Official WhatsApp Business Cloud API adapter:** approved templates, service-window rules, signature verification, inbound replies, delivery statuses, human handoff | [ ] | Signed-webhook fixtures; template/window enforcement; status transitions idempotent |
| 2.3 | **Org-wide and per-customer pause-all;** per-org approval modes (auto only for low-risk, review-before-send, draft-only) | [~] | Pause cancels unsent eligible reminders; audited |
| 2.4 | **AI outbound audit:** record model/prompt version, input facts, policy result, approver for every AI-generated message | [ ] | Audit row present for 100% of AI drafts in test |
| 2.5 | **Pre-send recheck** (unpaid state, dispute/active promise, permission, frequency, approval) just before dispatch | [~] | Paid-just-before-send and dispute-just-before-send tests suppress the send |
| 2.6 | **Email hardening:** verified sender domain, bounce/complaint handling, inbound body retrieval via provider API, persist-before-AI | [~] | Provider failure doesn't lose inbound content; safe retry test |
| 2.7 | **Webhook dedupe & replay protection** (unique provider/event key) | [~] | Duplicate/replayed webhook = one effect |
| 2.8 | **Unknown-outcome recovery:** timeouts, bounded retry, dead-letter, manual recovery UI | [ ] | Ambiguous timeout never produces duplicate send |

**Phase 2 AG:** duplicate webhooks/messages cannot double-act; payment/dispute races suppress sends; failed/unknown provider outcomes recover safely.

---

## Phase 3 — Features and intelligence

| ID | Task | Status | Acceptance gate |
|---|---|---|---|
| 3.1 | **Payment links/adapters** (Razorpay, Stripe, UPI flows) with signed webhooks + idempotent reconciliation | [ ] | Webhook signature/replay tests; no double-booking |
| 3.2 | **Dispute tickets:** owner, SLA, reason categories, required evidence, status transitions, resolution audit | [~] | Dispute pauses only scoped invoices; SLA timers; audit trail |
| 3.3 | **Promise-to-pay tracking** with missed-date follow-up after eligibility re-check | [~] | Missed promise triggers policy re-evaluation, not blind escalation |
| 3.4 | **Escalation ladder** by customer segment + behavior-based prioritization | [ ] | Hard exclusions override priority; explainable score |
| 3.5 | **Customer portal** (magic links/scoped tokens): documents, disputes, commitments, payments | [ ] | Token scope/expiry tests; no cross-tenant/customer access |
| 3.6 | **Cash application assistant:** match suggestions with confidence + reason codes; review queue | [ ] | Ambiguous matches never auto-commit; reversal/idempotency respected |
| 3.7 | **Behavior-based payment scoring, expected pay date, cash-flow forecast, DSO reporting** on validated data | [ ] | Forecast shows confirmed/promised/likely/at-risk; calibration + error reporting; only after sufficient clean history |
| 3.8 | **Accounting connectors** (Tally, Zoho Books, QuickBooks) via stable interface, scheduled sync, conflict handling — *one at a time, pilot-driven* | [ ] | Connector contract tests; duplicate/conflict handling; audit log |
| 3.9 | **Language settings + reviewed templates** in English, Hindi, Marathi before expanding further | [ ] | Per-language template review + safety eval |
| 3.10 | **Reply-intelligence evaluation set** (synthetic + anonymized, adversarial) and regression harness | [ ] | Report: intent accuracy, date extraction, false-paid rate, false-dispute rate, unsafe language, abstention |
| 3.11 | **Owner copilot** (tenant-scoped, labelled calc/fact/forecast, source links, no actions) | [ ] | Cross-tenant prompt-injection tests; answers cite records |

---

## Phase 4 — Privacy and operations

| ID | Task | Status | Acceptance gate |
|---|---|---|---|
| 4.1 | **Data export, deletion/anonymization, retention** workflows incl. provider data copies and legal hold | [ ] | End-to-end privacy request test across stores |
| 4.2 | **Privacy docs:** processing-purpose register, DPA template, privacy notices, breach-response runbook (counsel-reviewed) | [ ] | Documents reviewed by qualified counsel |
| 4.3 | **Monitoring:** Sentry/error monitoring, OpenTelemetry traces, Prometheus-compatible metrics, PII-safe payloads | [ ] | Alerts: failed jobs, webhook-rejection bursts, queue age, delivery failures |
| 4.4 | **Backups & restore drills;** queue recovery; provider-outage response | [ ] | Documented restore test passed; RTO/RPO recorded |
| 4.5 | **Production acceptance test pack:** security, tenant isolation, financial invariants, observability, operations | [ ] | Full pack green in staging |
| 4.6 | **Incident runbooks:** secrets compromise, tenant exposure, queue backlog, provider abuse, payment mismatch, lost/duplicated events | [ ] | Tabletop exercise completed |
| 4.7 | **Hosted DB rollout:** choose Supabase connection mode (direct/session/transaction pooler); validate driver behavior; connection budget across API + Celery | [ ] | Staging soak test; migration validated on Supabase PG |

---

## Track B — Customer validation & go-to-market (parallel to engineering)

- [ ] **B1. 20-interview discovery plan:** receivables profile, workflow, reasons for delay, current tools, channels/consent, cost/value, buying process. *Ask:* "Show me how you handled the last five invoices that became overdue."
- [ ] **B2. Recruit 5 design partners** (primary segment + one comparison segment); obtain sanitized historical data first.
- [ ] **B3. Pilot in review-before-send mode;** no autonomous collection messaging initially.
- [ ] **B4. Baseline metrics:** overdue balances, DPD, follow-up time, promises kept, dispute resolution, payment matching.
- [ ] **B5. Log everything:** proposed actions, human approvals, blocked sends, outcomes; weekly user interviews on false positives and effort.
- [ ] **B6. Customer-specific proof report;** decide what to build/remove/simplify based on evidence.
- [ ] **B7. Acquisition experiments:** accountants/Tally partners (5–10 interviews + guided onboarding), founder-led sales with synthetic/consented demo, sector communities, referrals.
- [ ] **B8. Pricing experiments:** pilot (30–60 days), Starter ₹2,999–4,999, Growth ₹7,500–15,000; fixed fee + message allowance; **no recovery commission initially**.
- [ ] **B9. Unit economics:** WhatsApp/email costs, AI tokens per invoice/conversation, support/onboarding time, human-review share, gross margin, churn after backlog reduction.
- [ ] **B10. Competitor demos:** verify DemandPay, BahiFlow, RemindPaisa, PraecisAI, Kontrax claims directly.
- [ ] **B11. Counsel review:** DPDP timeline/obligations, WhatsApp policy, consent evidence, MSME Samadhaan handling.

---

## Track C — Cross-cutting / definitions to settle early

- [ ] C1. Fix exact definitions: DPD (date/timezone treatment), DSO formula, promise-kept rate (partials/rescheduled), forecast error, recovery attribution.
- [ ] C2. Ledger model doc: statuses (issued, due, overdue, partially paid, paid, reversed, disputed), timing rules for outstanding balance.
- [ ] C3. Decide invoice external-ID / invoice-number uniqueness and conflict policy per org.
- [ ] C4. Draft approved message templates (pre-due, overdue, promise confirmation, document request, opt-out ack) and safe-language rules.
- [ ] C5. Define AI per-task abstention rules and approval thresholds.

---

## Launch readiness checklist (must all be "yes")

- [ ] Every new endpoint proves authz, tenant scope, audit event and negative cross-tenant tests
- [ ] System recovers if API/worker crashes after provider accepts a message
- [ ] Two concurrent allocations cannot exceed the payment balance
- [ ] Customer payment claim leaves confirmed ledger state untouched
- [ ] Queued reminder is suppressed if payment/dispute status changes just before send
- [ ] DB restore + worker resume proven after simulated outage
- [ ] Support can investigate events without opening unrestricted message content
- [ ] Every forecast number traces to confirmed / promised / likely / at-risk source
- [ ] Real PostgreSQL integration + concurrency tests pass (not only SQLite)
- [ ] Real Redis broker + worker + Beat verified together
- [ ] Marketing/UI claims match implemented-and-verified features only

## Suggested sequencing

```
Phase −1 → Phase 0 → Phase 1 ──► Pilot start (B3, review-before-send)
                          └─► Phase 2 (WhatsApp/consent) ─► Phase 3 (pick items from pilot demand) ─► Phase 4
Track B runs continuously from now; its evidence decides which Phase 3 items get built.
```
