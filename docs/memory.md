# ACCO — Project Memory

> Persistent context for anyone (human or AI coding agent) picking up ACCO. Read this first. Source: *ACCO Product & Strategy Handbook v1.0* (15 Oct 2026). Repo: `RushikeshMore66/ACCO-`. Owner: Rushikesh (AI developer, Kolhapur, India).
>
> **Truth labels:** [Reported] = from prior project reports, not independently verified · [Planned] = roadmap · [Hypothesis] = unvalidated · [Decision] = settled choice.

## 1. What ACCO is (one paragraph)
An AI accounts-receivable operations team for Indian B2B SMEs. Closed loop: **Import → Validate → Prioritize → Communicate → Resolve → Reconcile**, under deterministic policy and safety controls. Three value pillars: **Collect · Resolve · Forecast**. Not a reminder engine — it finds *why* an invoice is blocked and routes the right next action.

## 2. Settled decisions [Decision]

| # | Decision | Why |
|---|---|---|
| D1 | Modular monolith; AI roles are services/prompts/workflows, not necessarily separate agents | Simplicity; boundaries matter more than process count |
| D2 | **AI is advisory only.** Backend policy gate decides; only authorized service/human executes | Prevent hallucinated money moves/messages |
| D3 | Stack: Next.js (App Router, TS, Tailwind) + FastAPI + Pydantic + SQLAlchemy 2.x + Alembic + PostgreSQL + Celery/Beat + Redis | Already designed/reportedly built |
| D4 | PostgreSQL local for dev; isolated PG DB for integration tests; **Supabase PostgreSQL** for hosted (after compatibility validation) | SQLite can't prove PG behavior |
| D5 | Money = Python `Decimal` + PG `NUMERIC`; never float | Financial correctness |
| D6 | Official WhatsApp Business Platform only; no unofficial/browser automation | Policy compliance |
| D7 | CSV/Excel import first; accounting connectors later (one at a time, pilot-driven) | SME fast-start; low onboarding cost |
| D8 | Start in **review-before-send** mode; no autonomous collection messaging at pilot start | Trust & safety |
| D9 | No recovery-commission pricing initially | Attribution hard; trust risk |
| D10 | Phases ordered Security → Core → Communication → Intelligence → Trust/Ops | Safety and financial correctness before autonomy |
| D11 | Workflow discipline: SPEC → PLAN → EXECUTE → VERIFY → COMMIT, one atomic task at a time | Repo convention |

## 3. Current status (as reported — **re-verify before relying**)

**Reported as present/substantially implemented**
- FastAPI backend, SQLAlchemy, Alembic; multi-tenant Organization/User; JWT login + current-user endpoints
- Customer/invoice models + invoice import; payments, allocations/reversals; receivables/aging calcs
- Collection policy queue & summary; message approval/activity workflow; promises & disputes; collection-pause rules
- Email delivery adapter + delivery-status tracking; inbound email/reply analysis (AI advisory; human review retained)
- Next.js frontend: dashboards/workflows; reported 135 frontend tests passing, clean typecheck/lint/build
- DB pool configuration; startup fail-closed settings + CI variable fix; reported 101 backend tests passing

**Reported as NOT done / unverified**
- Backend tests used **in-memory SQLite** → PG migrations, enum behavior, row locks, concurrency **unverified**
- Config tests accepting a syntactically valid Redis URL ≠ proof a live broker + worker + Beat work together
- WhatsApp Business integration, refresh-token lifecycle, account verification/recovery, TOTP MFA, field encryption, RLS, broad tenant audit, full CI security scanning → **roadmap**
- Cash prediction, multi-agent workflows, payment gateways, customer portal, accounting connectors, privacy/ops suite → **planned**; do not describe as available

**Commit-state caveat:** Milestone 2C/2C.1 and Task 0.1 reports found **pre-existing uncommitted changes** and halted commits because overlapping files made an atomic commit unsafe. → Run `git status` before any work; do not assume changes are committed. **Never reset/stash/discard/merge unrelated local changes just to simplify a commit.**

## 4. Where to resume
Phase 0 (Foundations & Security) is the active gate — see `tasks.md`. Immediate priorities, in order:
1. Reconcile git state (what's uncommitted, why).
2. Task 0.1 config fail-closed (real Redis broker, correct CI env var names).
3. Stand up isolated PostgreSQL test DB + Alembic-from-empty upgrade test.
4. Tenant isolation audit (0.6) before adding features.

## 5. Domain glossary

| Term | Meaning |
|---|---|
| AR | Amounts customers owe for goods/services supplied on credit |
| DPD | Days past due = max(0, as_of − due_date) for eligible unpaid invoice |
| Aging bucket | Open balances grouped by DPD (non-overlapping, no gaps) |
| DSO | Avg AR ÷ net credit sales × days (definition agreed per customer) |
| PTP / Promise | Customer commitment to pay on a date — **not** a receipt |
| Cash application | Matching received money/remittance to the correct invoice |
| Dunning / cadence | Planned sequence of customer contacts around due date |
| Dispute | Customer issue re invoice correctness, delivery, terms or evidence |
| Idempotency | Same request/event processed multiple times → one effect |
| Tenant / Org | Customer business workspace; data fully isolated |
| RBAC / RLS | Role-based access control / PostgreSQL row-level security |
| Signed webhook | Provider event verified cryptographically before trust |
| Deterministic policy gate | Backend rules that must pass regardless of AI output |
| Human-in-the-loop | Designated people approve/review/resolve sensitive actions |
| MSME Samadhaan / MSEFC | Indian delayed-payment portal / facilitation council (MSMED Act) — surface options, no legal conclusions |
| DPDP Rules 2025 | India data-protection rules (phased commencement; confirm with counsel) |
| UTR | Bank transaction reference number used to verify payments |

## 6. Non-negotiable invariants (quick recall)
1. Never mark paid from a message; only authoritative payment records change the ledger.
2. Never trust client-supplied org ID.
3. Never float for money; never mix currencies silently.
4. Never process one external event twice (DB constraint + idempotent handler).
5. Never send without pre-send recheck; never bypass consent/suppression/pause.
6. Never overwrite history — reversals/corrections are new records.
7. Never let AI write to the ledger or decide eligibility.
8. Never log secrets/tokens/full PII.
9. Never claim planned features as available; never promise numeric ROI before pilots.

## 7. Strategy snapshot

**ICP [Hypothesis]:** Indian B2B distributors/wholesalers/small manufacturers on credit with repeat buyers, Tally/BUSY/Excel, small finance team.

**Differentiation [Hypothesis]:** Payment Blocker Intelligence · Reliable Financial Truth · Conversation-to-Resolution · Fast-start onboarding · Trustworthy cash intelligence · Accountant distribution. *Not* a moat: using an LLM, WhatsApp/language support alone, standard aging dashboards, single connector, long feature lists.

**Competitors (desk review, unverified):** DemandPay (closest overlap), BahiFlow (₹2,999/yr + commission), RemindPaisa (₹199–699/mo), PraecisAI (voice, ₹5,000/mo), Monsoon Intelligence, Kontrax; global: HighRadius, Billtrust, Genpact, Chaser, Zoho Books, TallyPrime. Takeaway: reminders/WhatsApp/UPI/promise-tracking = table stakes; price floor is low; win on measurable blocker resolution + trust.

**Pricing hypotheses:** Pilot (30–60d) · Starter ₹2,999–4,999/mo · Growth ₹7,500–15,000/mo · Partner = quote. Fixed fee + separate message allowance.

**Validation plan:** 20 interviews → 5 design-partner pilot (review-before-send, baseline metrics, weekly interviews, proof report) → build/remove/simplify based on evidence. Channels: accountants/Tally partners, founder-led sales, sector communities, referrals.

## 7a. Key risks to keep watching
Wrong invoice data · cross-tenant leak · AI hallucinating payment/terms · duplicate webhooks · payment race/over-allocation · non-compliant messaging · provider outage · forecast overconfidence · privacy/legal mismatch · secret leakage · high onboarding cost · competitor response · weak willingness to pay · scope creep.

## 8. Open questions
1. Distributors/manufacturers vs service agencies — which segment converts?
2. DSO and recovery-attribution definitions per pilot customer.
3. First accounting connector.
4. DPDP applicability/timeline (counsel).
5. WhatsApp template categories and cost mix.
6. Supabase connection mode (direct / session / transaction pooler).
7. Final approval-mode defaults per customer segment.

## 9. Related references (from handbook)
R01 Atradius India B2B payment practices 2026 · R02 MSME Annual Report 2025-26 · R03–R15 competitor/vendor pages · R11 MeitY DPDP Rules 2025 · R16 WhatsApp Business Messaging Policy (updated 23 Sep 2026) · R17–R19 Supabase connect/pooling/backups · R20 WhatsApp Cloud API docs. Vendor claims are first-party marketing; re-check before using in sales or production decisions.

## 10. How to update this file
Append decisions with date and reason; move items from "Reported" to "Verified" only with evidence (test output, commit hash, runbook). Keep status honest — this file is the antidote to prompt-reported progress.

| Date | Change |
|---|---|
| 2026-10-15 | Initial memory seeded from Product & Strategy Handbook v1.0 |
