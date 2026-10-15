# ACCO — Product Requirements Document (PRD)

> Source: *ACCO Product & Strategy Handbook v1.0* (research snapshot 15 Oct 2026).
> Status labels used throughout: **[Reported]** = described in prior project reports, not independently verified · **[Planned]** = roadmap, not available · **[Hypothesis]** = needs customer validation.

---

## 1. Summary

**ACCO is an AI-assisted accounts receivable (AR) operations team for Indian B2B SMEs.** It connects invoice facts, the *reason* a payment is delayed, the next safe action, customer communication, verified payment outcomes and owner-level cash visibility in one accountable workflow.

**Thesis:** ACCO is not a reminder engine. It answers: *What is stopping this invoice from being paid? What evidence supports that? Who can resolve it? What is the next safe action? Did the action change the outcome?*

**Customer promise (proposed):** "ACCO helps your team follow up consistently, resolve why B2B invoices are stuck, track what customers commit to, and see which incoming cash is verified versus uncertain."

Three pillars: **Collect** (polite, consistent follow-up) · **Resolve** (understand why payment is blocked) · **Forecast** (separate expected from verified cash).

## 2. Problem

- Roughly half of B2B sales in India are on credit; ~9 in 10 surveyed firms report overdue invoices; outstanding payments exceed one-third of receivables (Atradius 2026 survey, firms surveyed — not a census). [R01]
- MSMEs can use the MSME Samadhaan portal / MSEFC for delayed-payment cases. ACCO may keep records and surface escalation options but must **not** give legal conclusions or file claims without explicit authorization and qualified review. [R02]
- Late payment is not only a communication problem:

| Cause | ACCO response |
|---|---|
| Forgotten / deprioritized invoice | Timed, polite reminder with invoice context and verified balance |
| Missing paperwork (PO, delivery proof, tax detail) | Identify the missing item, attach approved document, follow up |
| Buyer approval pending | Track buyer-side blocker and next check-in date |
| Disputed amount/delivery | Open dispute case, pause inappropriate cadence, assign owner |
| Promise to pay | Record as unverified commitment; follow up when appropriate |
| Payment sent but not matched | Collect reference evidence, suggest match for review |
| Customer liquidity problem | Flag for human-approved options; never invent terms/concessions |
| Internal data mismatch | Quarantine row / sync conflict; require correction before outreach |

## 3. Target market and users

### 3.1 Initial ICP **[Hypothesis]**
Indian B2B distributors, wholesalers and small manufacturers that sell on credit, have repeat buyers, use Tally/BUSY/accounting exports or spreadsheets, and run receivables with a small finance team (owner + accountant + small collections function). Compare against B2B service agencies during discovery.

Buying triggers: large overdue amount, lost follow-ups, hiring pressure, poor cash visibility. Readiness: can supply clean invoice data and authorize approved customer contacts.

### 3.2 Personas

| Persona | Main job | Success looks like |
|---|---|---|
| Owner / CFO | Know what cash may arrive and where attention is needed | Daily brief, clear forecast categories, fewer surprises |
| Finance manager | Control policies, approvals, exceptions, team load | Reliable queue, audit history, consistent actions, clear escalations |
| AR clerk / collector | Follow up, handle replies, record promises, prepare documents | Less manual copying, coherent conversation history, no forgotten promises |
| Accountant / implementation partner | Connect ledger, reconcile exports, support several clients | Fast onboarding, clear import errors, repeatable reports, scoped access |
| Buyer / AP contact | Know what is owed and resolve questions | Correct info, easy document access, respectful communication, clear dispute path |

### 3.3 Jobs to be done
1. When an invoice becomes overdue, tell me what to do next without rebuilding its history.
2. When a buyer says "we will pay Friday", record the date and remind the team if missed.
3. When a buyer disputes a bill, stop wrong automation and help resolve the exact issue.
4. When a buyer says "paid", help verify the transaction and match it to the invoice.
5. When I ask how much cash may arrive next week, show the evidence and uncertainty.
6. When my accountant exports a ledger, make onboarding useful without an ERP project.

## 4. Product principles

| Principle | Meaning | Anti-pattern |
|---|---|---|
| Receivables first | Dependable invoice-to-cash loop | Building unrelated finance modules first |
| Rules before autonomy | Deterministic backend controls eligibility, consent, authorization, financial writes | LLM deciding whether it's safe to send or book money |
| Evidence over claims | Separate customer statements, delivery status and payment records | Marking paid because a message says "paid" |
| Resolution over volume | Address blockers, not message frequency | Spamming reminders when a document is missing |
| Human control | Approval modes, exception queues, org/customer pause | Silent autonomous action on high-risk cases |
| Transparent uncertainty | Label expected / promised / likely / at-risk / verified | Predictions presented as guaranteed inflows |
| SME fast-start | Start with validated CSV/Excel import | Requiring an ERP integration to try the product |
| Relationship-safe collections | Polite, accurate, policy-compliant, clear opt-out | Threatening, misleading, shaming or excessive messages |

## 5. End-to-end workflow (the "receivables loop")

**Import → Validate → Prioritize → Communicate → Resolve → Reconcile**, all wrapped by deterministic policy and safety controls (tenant access, consent, pause rules, approvals, audit trail).

1. **Import** customer, invoice, due date, currency, amount, terms, contacts from CSV/Excel or accounting system.
2. **Validate**: normalize formats, detect duplicates, check required fields and currency/amount precision, show row-level errors in a preview.
3. **Calculate** outstanding balance from authoritative invoice, allocation and reversal records (never trust a spreadsheet balance as permanent truth).
4. **Classify** due/overdue stage via deterministic rules.
5. **Prioritize** by amount, age, risk indicators, blocker type — explainable logic; no opaque AI score may override mandatory exclusions.
6. **Prepare** an approved template or AI draft from verified facts, contact preferences, language, conversation history.
7. **Pre-send check** immediately before provider call: balance, dispute, promise pause, consent/suppression, quiet hours, frequency cap, approval mode, org/customer pause.
8. **Send** via provider adapter with idempotency key; record provider IDs and delivery state.
9. **Ingest** inbound webhooks: verify signature over raw bytes, replay checks, dedupe, persist content safely.
10. **Analyze** replies: classify intent; propose promised date, payment reference, dispute category with confidence + evidence.
11. **Resolve**: route ambiguous/sensitive cases to a human; create promises/disputes only per approval and domain rules.
12. **Reconcile**: ingest authoritative payment records, propose matches, support partials/reversals, update ledger in a transaction.
13. **Learn & report**: verified outcomes, forecast error, promise reliability, blocker resolution time.

### Failure behavior (required)

| Failure | Required behavior |
|---|---|
| Import row invalid | Row-level error; never create partial/corrupt invoice |
| Provider timeout after send | Use idempotency/correlation; don't blindly resend |
| Webhook invalid/stale | Reject before mutating state; log safe metadata only |
| AI unavailable / low confidence | Preserve original reply; route to manual review; don't invent facts |
| Payment status conflict | Don't overwrite trusted data with lower-confidence source; open exception |
| Opt-out or dispute opens | Apply suppression/pause promptly; cancel unsent eligible reminders |
| Database unavailable | Controlled failure; accept no write that can't be persisted consistently |

## 6. Functional requirements

### FR-1 Data intake and onboarding
- First-run checklist: org profile, timezone, users/roles, invoice import, payment terms, sender verification, contact consent, policy config, approval mode.
- CSV/Excel import with field mapping, required-field validation, duplicate detection, currency checks, downloadable line-level error report, summary.
- Idempotent import: re-uploading the same rows must not duplicate invoices; define external IDs, invoice-number rules and conflict policy per org.
- Onboarding quality report (missing contacts, invalid email/phone, missing due dates, stale balances, duplicate identifiers, invoices lacking documents).
- Live/demo separation: demo fixtures never mixed with real data or shown as live truth.

### FR-2 Receivables dashboard and work queue
- Show total receivables, overdue, aging buckets, due-soon, disputes, promises due, failed deliveries, reconciliation exceptions.
- Every number has an explainable definition, time basis, currency scope and drill-through to underlying invoices/events.
- Filters: customer, owner, aging, amount range, dispute status, promise status, channel, delivery status, risk band.
- Tasks ranked by transparent priority score or deterministic tiers; hard exclusions (paid, disputed, suppressed, paused) override priority.
- Daily action brief: top tasks, why, expected next action, owner, unresolved dependencies.

### FR-3 Customer, invoice and collection case
- Customer profile: contacts, approved channels, consent evidence, timezone, language, payment history, contact policy.
- Invoice detail: source ID, number, amount, currency, issue/due dates, authoritative balance, allocations, reversals, disputes.
- Case timeline: messages, provider states, replies, AI analyses, promises, disputes, approvals, human notes, verified payment events.
- Case actions: draft message, request document, mark human follow-up, open/resolve dispute, review payment claim, pause outreach.
- Every state-altering action records actor, timestamp, org, source, before/after state, evidence references.

### FR-4 Collection policy configuration
Authorized finance role configures; backend validates it cannot bypass mandatory safety rules.

| Setting | Example |
|---|---|
| Stage rules | Pre-due, early overdue, follow-up, escalation review (configurable day ranges) |
| Cadence | Days relative to due date and to active promise date |
| Channel preference | Email first / WhatsApp first / per-customer sequence where permitted |
| Approval mode | Draft-only · review-before-send · auto-send for eligible low-risk |
| Quiet hours | Customer timezone, allowed windows, holidays |
| Frequency caps | Max touches per rolling period; minimum interval |
| Suppression | Opt-out, invalid contact, active dispute, paid balance, legal hold, explicit pause |
| Escalation | To owner/finance manager after broken promises or aged invoices |
| Global stop | Org-wide pause + per-customer pause |
| Safe language | No threats, misleading claims, unauthorized fees, fabricated legal consequences, unapproved concessions |

### FR-5 Communication centre
- One conversation history per customer/contact, tenant-scoped, linked to invoices.
- Provider adapters for email and **official** WhatsApp Business Platform; provider-specific code must not leak into domain policy.
- Message lifecycle: draft → pending approval → approved → queued → sending → accepted → delivered → bounced/failed → unknown/suppressed.
- Keep exact approved message, template version, recipient, channel, invoice facts used, model + prompt version (if AI), approver identity.
- Provider acceptance/delivery is **never** proof the customer read, understood or will act.

### FR-6 Reply intelligence

| Intent | Extraction | Safe next action |
|---|---|---|
| Payment claimed | claim text, date, amount, UTR/reference | Ask for evidence or look for matching receipt; ledger unchanged |
| Promise to pay | date, amount, currency, conditions, confidence | Create *proposed* promise; confirm per workflow policy |
| Dispute | category, description, invoice refs, missing evidence | Open/route case; pause affected invoice outreach as required |
| Document request | document type, invoice ref | Retrieve only tenant-authorized document; draft response |
| Negotiation / partial payment | amount, installments, due dates | Prepare options for authorized finance review; no autonomous offer |
| Unclear / angry / legal / sensitive | uncertainty + safety indicators | Disengage politely; route to human |

### FR-7 Promise-to-pay and disputes
- Promise record: proposed date, agreed date, amount, source message, approver, status, fulfillment. **A promise is not a payment.** Broken promises trigger follow-up after policy re-evaluation, not blind escalation.
- Dispute: category, severity, owner, SLA, evidence requested, communication history, resolution status, closure outcome. Suppress collection only per policy and only for the disputed invoice scope.

### FR-8 Payment and reconciliation
- Record source, provider/bank reference, amount, currency, received/settled time, status, raw source-event reference.
- One payment → many invoices and many payments → one invoice (subject to schema/business rules).
- Handle partials, overpayments, unallocated cash, chargebacks, reversals **without deleting history**.
- Exact `Decimal` arithmetic; transactional writes; idempotency so re-imported bank lines/webhooks can't double-book.
- Confidence-based match suggestions with reason codes; human review for ambiguous matches.
- Payment truth stays separate from customer statements, forecasts and delivery events.

### FR-9 Owner intelligence / cash-flow assistant
Answers from tenant-scoped current data, stating whether the answer is a **calculation, observed fact or forecast**. Example questions: top 10 invoices needing attention today; cash confirmed this week; payments promised by Friday and customer reliability; invoices blocked by missing PO/disputes; impact of two large promises slipping 14 days. Must link to supporting records and expose assumptions; must not use cross-tenant/stale data, invent accounting advice, create transactions, or imply certainty beyond evidence.

### FR-10 Later capabilities **[Planned]**
Payment links (UPI/Razorpay/Stripe) · customer portal/magic links · accounting connectors (Tally, Zoho Books, QuickBooks) · multilingual (English, Hindi, Hinglish, Marathi) · voice notes/calls · payment behavior scoring · working-capital assistant. Each has a stated "consider when" gate in the roadmap.

## 7. AI agent roles and boundaries

ACCO may use specialized AI roles while remaining a **modular monolith**; a role can be a service, prompt or bounded workflow.

| Role | Allowed | Not allowed |
|---|---|---|
| Collections agent | Draft polite messages from verified facts; suggest next eligible action; summarize history | Bypass consent, send outside policy, invent balances/terms |
| Reply intelligence | Classify intent; extract proposed dates/amounts/refs with confidence + evidence | Mark paid, confirm promise, mutate ledger from unverified text |
| Dispute assistant | Classify reason, identify missing evidence, suggest assignment, draft response | Decide liability or close sensitive disputes without authorized review |
| Cash application assistant | Recommend candidate matches, explain confidence, surface unallocated cash | Commit ambiguous allocations; ignore reversals/idempotency |
| Cash-flow analyst | Scenarios with explicit assumptions on verified values | Present expected payments as guaranteed |
| Owner copilot | Query authorized summaries; explain next actions with sources | Cross tenants, reveal PII beyond permission, run unrestricted SQL/tools |

**Execution contract:** validated tenant-scoped input with source IDs and freshness → schema-validated output with confidence/evidence/uncertainty → backend policy evaluation → only an authorized service or human-approval handler executes → audit (model/provider, prompt version, facts, output hash, approver, policy result) → evaluation on synthetic/anonymized cases.

**Abstention:** no universal confidence threshold. Require human review when intent is ambiguous, invoice mapping unclear, a dispute/legal issue is mentioned, or evidence conflicts.

## 8. Non-functional requirements

**Security & privacy:** fail-closed config outside dev; short-lived access tokens with rotating hashed single-use refresh tokens; login/registration rate limits and lockout; verified email and expiring single-use reset tokens; TOTP MFA for privileged roles; org context derived server-side only; tenant isolation tests (and PostgreSQL RLS as defense in depth); explicit CORS allowlist; security headers, request IDs, size limits; never log tokens/keys/DB URLs/full PII; versioned field encryption (AES-GCM or well-maintained Fernet) with key rotation; append-only audit log.

**Compliance planning:** design for India's DPDP Rules 2025 (notices, purposes, data-principal requests, retention/deletion, processor agreements, breach response) — confirm commencement dates and obligations with qualified counsel; WhatsApp Business policy (approved templates, 24-hr service window, opt-out) [R16]; email sender-domain authentication and unsubscribe path.

**Operational readiness:** automated backups with *tested* restores · structured logs/traces/metrics with alerts (failed jobs, webhook rejection bursts, queue age, delivery failures) · real shared Redis broker outside dev with separate worker/Beat · versioned migrations with rollback/forward-fix plan · incident runbooks · privacy export/deletion across stores and providers.

## 9. Success metrics

| Metric | Definition | Decision supported |
|---|---|---|
| Outstanding AR | Sum of authoritative open balances by currency/as-of | How much is owed |
| Overdue AR | Outstanding on invoices past due per DPD logic | Collection pressure |
| Confirmed receipts | Authoritative payments recorded/settled | Cash actually received |
| Promised inflows | Unfulfilled promise amount by date | Commitments (not cash) |
| At-risk inflows | Expected amounts hit by broken promises, aging, disputes, low reliability | Which receipts may slip |
| Promise-kept rate | Eligible promises fulfilled ÷ eligible promises due | Commitment reliability |
| DPD | max(0, as-of − due date) for unpaid eligible invoice | Aging & escalation |
| DSO | Avg AR ÷ net credit sales × days in period (agree definition with customer) | Collection-cycle trend |
| Dispute resolution time | Creation → closure, by category | Persistent blockers |
| Manual follow-up time | Staff time per invoice/customer | Whether ACCO saves effort |
| False-send prevention | Sends suppressed (paid/dispute/opt-out/pause/quiet hours/invalid approval) | Safety controls |
| Forecast error | Forecast vs actual, by horizon/currency/cohort | Is prediction improving |
| Pilot net value | Verified recovery/working-capital gain + time saved − baseline cost | Willingness to pay |

**Do not** publish numeric marketing promises ("recover 30% more", "reduce DSO 20%") until pilot methodology, baseline and results support them. Payment after a reminder is not proof of ACCO causality.

## 10. Positioning and competition

*Positioning:* "ACCO is an AI receivables operations team for Indian B2B SMEs. It helps identify why invoices are stuck, coordinate polite customer conversations and resolution work, track payment commitments, reconcile verified receipts and show what cash is confirmed versus uncertain."

Competitors scanned (public pages, unverified): DemandPay, BahiFlow, RemindPaisa, PraecisAI, Monsoon Intelligence, Kontrax (India); HighRadius, Billtrust, Genpact, Chaser, Zoho Books, TallyPrime (global/accounting). **Lessons:** reminders, WhatsApp, UPI links, promise tracking and dashboards are table stakes; agentic collections/dispute routing/cash application are advertised by larger vendors; low-cost Indian options set a price floor.

**Differentiation pillars [Hypothesis — each needs evidence]:** Payment Blocker Intelligence · Reliable Financial Truth · Conversation-to-Resolution · Fast-start SME onboarding · Trustworthy cash intelligence · Accountant distribution.

**Not a moat:** using an LLM; supporting WhatsApp/local languages without better outcomes; a standard aging dashboard; a single accounting integration without conflict handling; a long list of unvalidated features.

## 11. Go-to-market and pricing hypotheses

- **Validation:** 20 discovery interviews ("show me how you handled the last five invoices that became overdue"); **five design-partner pilot** in review-before-send mode with baseline metrics, weekly interviews and a customer-specific proof report.
- **Channels to test:** accountants/Tally partners, founder-led sales to distributors/manufacturers, sector communities, customer referrals.
- **Pricing (hypothesis only):** Pilot free/paid 30–60 days · Starter ₹2,999–4,999/mo · Growth ₹7,500–15,000/mo · Partner/multi-entity quoted after research. Show a fixed fee with defined limits plus separate message-volume allowance; **avoid recovery commission initially** (attribution is hard).

## 12. Release scope (phased)

| Phase | Focus |
|---|---|
| 0 | Foundations & security hardening |
| 1 | Complete the core workflow |
| 2 | Communication compliance |
| 3 | Features & intelligence |
| 4 | Privacy & operations |

Details in `tasks.md`. A phase is complete only after its tests, reviews, migrations and operational checks pass.

## 13. Non-goals / what ACCO must not claim
- Not autonomous cash-flow, accounting, tax or finance operations.
- No guaranteed DSO reduction / recovery / ROI before pilots.
- Never state a customer paid merely because a message says so.
- Don't claim every competitor is enterprise-only or lacks WhatsApp/AI.
- Don't advertise planned capabilities as production-ready.
- No legal conclusions or automatic MSME claim filing.
- No unofficial WhatsApp/browser automation.

## 14. Risks (top)

Incorrect invoice data · cross-tenant exposure · AI hallucinating payment/terms · duplicate webhooks · payment race/over-allocation · non-compliant messaging · provider outage/ambiguous timeout · forecast overconfidence · privacy/legal mismatch · secret leakage · high onboarding cost · competitor response · weak willingness to pay · scope creep. Mitigations are mapped in `architecture.md` and `rules.md`.

## 15. Open questions
1. Primary segment: distributors/manufacturers vs service agencies — which converts?
2. Precise DSO and "recovery attribution" definitions per pilot customer.
3. First accounting connector (Tally vs Zoho vs QuickBooks) — driven by pilot demand.
4. Applicable DPDP commencement timeline and processor obligations (counsel).
5. WhatsApp template categories and per-conversation cost at expected mix.
6. Hosted DB connection mode (direct vs Supabase session/transaction pooler) after compatibility testing.
