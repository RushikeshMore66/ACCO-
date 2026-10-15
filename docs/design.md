# ACCO — Product & UX Design

> The handbook specifies dashboard layout, screens, states and message tone explicitly; visual tokens below are **derived from the handbook's own branding** (navy + teal, report-style diagrams) and marked *(proposed)*. Adjust to your design system.

## 1. Design principles

1. **Trust over flash.** This is a financial system; every number must be explainable and traceable.
2. **Evidence over claims.** UI always distinguishes *claimed* vs *promised* vs *verified*.
3. **Safe by default.** Review-before-send is the default; risky actions need friction; pause is always one click away.
4. **Resolution, not volume.** Surface *why* an invoice is stuck and the *next action*, not just a list of overdue items.
5. **Show uncertainty.** Forecasts show categories and confidence, never a single confident number.
6. **Calm and respectful tone** toward buyers — customer-facing copy is polite, accurate, never threatening.
7. **Fast-start.** First value (a useful dashboard) within the first import session.

## 2. Visual language *(proposed, from handbook branding)*

| Token | Value | Use |
|---|---|---|
| `navy-900` | `#14283F` | Headers, primary text on light, key surfaces |
| `navy-700` | `#1F3A5F` | Secondary surfaces |
| `teal-600` | `#1F9A8E` | Primary accent, positive/verified, CTA |
| `teal-50` | `#E6F5F3` | Highlight callouts, resolved states |
| `amber-500` | `#E0A82E` | Policy/safety controls, warnings, "needs review" |
| `amber-50` | `#FFF6E0` | Caution callouts |
| `red-600` | `#C0392B` | Disputes, failures, at-risk |
| `slate-50 / 200 / 600` | `#F4F6F9 / #D9DEE6 / #5B6778` | Backgrounds, borders, muted text |

- Typography: clean humanist sans (Lato/Inter-class). Tabular numerals for all money. Large serif/semibold figures for KPI numbers.
- Money formatting: `₹` with Indian digit grouping (₹25,00,000); always show currency code if multi-currency; negative = reversal/credit.
- Support light + dark; do not rely on color alone (icon + label for status).
- Responsive down to tablet; clerk workflows are desktop-first, owner brief must read well on mobile.

### Semantic status colors

| Meaning | Color | Never conflate with |
|---|---|---|
| **Verified / confirmed** (authoritative payment) | teal | promised |
| **Promised** (customer commitment) | blue/navy outline | verified |
| **Likely** (model-based) | slate dashed | confirmed |
| **At-risk** | red/amber | — |
| **Policy-controlled / needs review** | amber | — |

## 3. Information architecture

```
Dashboard (owner brief)
Work Queue (action list)
Customers ─ Customer profile
Invoices ─ Invoice detail / Collection case timeline
Communications (inbox, approvals, delivery)
Disputes
Promises
Payments & Reconciliation
Reports / Forecast
Settings ─ Collection policy · Approval mode · Team & roles · Integrations · Templates · Compliance/consent · Pause controls · Audit log
Onboarding (first-run checklist, import wizard)
Customer portal (later)
```

Persistent global elements: **organization-wide Pause-all control** with state badge, org/timezone indicator, search, notification of items awaiting approval, **demo/live data badge**.

## 4. Key screens

### 4.1 Owner dashboard
Layout (per handbook §17):
- **Top row KPIs:** Total AR · Overdue AR · Confirmed receipts (this period) · Forecast inflows (selected horizon).
- **Next:** Aging distribution by bucket · High-value overdue customers · Disputes blocking cash.
- **Action list:** Next follow-ups · broken promises · documents to send · approvals waiting · unmatched receipts.
- **Forecast panel:** confirmed vs promised vs likely vs at-risk, stacked, with assumptions + drill-down to source invoices.
- **Safety panel:** paused accounts · opt-outs · delivery failures · messages awaiting approval · data sync warnings.
- Every figure is clickable → shows definition, time basis, currency scope, and underlying records.

### 4.2 Work queue / daily action brief
- Rows: customer, invoice(s), amount, DPD, **blocker type** (chip), priority tier + *why*, recommended next action, owner, dependencies.
- Hard-excluded items (paid, disputed, suppressed, paused) shown separately or hidden — never ranked.
- Filters: customer, owner, aging, amount range, dispute status, promise status, channel, delivery status, risk band. Saved views.
- Bulk actions limited to safe ones (assign, snooze, draft); sending requires approval flow.

### 4.3 Customer profile
Contacts + consent evidence (source, scope, timestamp) · approved channels · timezone/language · payment history & promise reliability · contact policy overrides · per-customer pause · open invoices/disputes.

### 4.4 Invoice detail / Collection case
- Header: invoice number, source ID, amount, currency, issue/due, **authoritative balance**, status chips.
- Tabs: Timeline · Allocations & reversals · Documents · Disputes · Policy decision log.
- **Timeline** interleaves messages (with provider state), replies, AI analyses (confidence + evidence span highlighted), promises, disputes, approvals, human notes, verified payments. Each entry labelled by source type.
- Actions: Draft message · Request document · Mark for human follow-up · Open/resolve dispute · Review payment claim · Pause outreach.
- Every state-changing action asks for confirmation where irreversible and writes an audit event.

### 4.5 Message composer & approval
- Shows exact text, template, channel, recipient, facts used (linked to source), **policy check results** (pass/fail per rule, with reason).
- AI-generated badge with model/prompt version. Safe-language guard warnings inline.
- Approve / Edit / Reject / Defer. After approval, last-minute recheck result is shown ("sent" / "suppressed: invoice paid").
- Lifecycle tracker: draft → pending → approved → queued → sending → accepted → delivered/failed. Footnote: *Delivered ≠ read ≠ paid.*

### 4.6 Reply inbox
Inbound reply, AI-proposed structure (intent, date, amount, reference) with confidence + evidence, **suggested safe action**, and one-click confirm/edit/route-to-human. Low-confidence/legal/angry items flagged and not auto-actioned.

### 4.7 Promise & dispute views
- **Promises:** proposed vs confirmed date, amount, source message, status (proposed → confirmed → fulfilled / missed / cancelled). Banner: *A promise is not a payment.*
- **Disputes:** category, severity, owner, SLA timer, evidence requested/received, history, scoped invoice(s) only, closure outcome.

### 4.8 Payments & reconciliation
- Unallocated cash list; match suggestions with **confidence + reason codes**; ambiguous → review queue.
- Allocation editor supports split/partial/over-payment; guards against over-allocation; reversals appear as new rows (history never deleted).
- Clear separation: *customer claim* · *bank/provider record* · *ledger*.

### 4.9 Collection policy settings
Stage builder (day ranges), cadence, channel preference, approval mode (draft-only / review-before-send / auto for low-risk), quiet hours + holidays, frequency caps, suppression rules, escalation, safe language, global stop. **Live validation** blocks configurations that would bypass mandatory rules, with an explanation. Preview: "Which invoices would be contacted tomorrow under this policy?"

### 4.10 Onboarding & import
1. First-run checklist (org, timezone, users/roles, import, terms, sender verification, consent, policy, approval mode).
2. Import wizard: upload → field mapping → **preview with row-level errors** → fix/skip → confirm → idempotent import summary + downloadable error report.
3. Data-quality report (missing contacts, bad emails/phones, missing due dates, stale balances, duplicates, missing docs).
4. Explicit **Demo vs Live** toggle; demo data visibly watermarked and never mixed.

### 4.11 Owner copilot
Chat panel. Each answer labelled **Calculation / Observed fact / Forecast**, lists assumptions, links to supporting records, and refuses cross-tenant or action-taking requests ("I can draft this for approval").

## 5. Component patterns

| Component | Behavior |
|---|---|
| `MoneyAmount` | Decimal-safe formatting, currency, tooltip with exact value |
| `StatusChip` | Icon + label; verified / promised / likely / at-risk / disputed / paused |
| `EvidenceLink` | Opens source record (invoice, event, message) in side drawer |
| `ConfidenceBadge` | Level + evidence span; low = amber with "needs human" |
| `PolicyCheckList` | Ordered pass/fail of the 9 pre-send checks with reasons |
| `AuditTrail` | Append-only entry list: actor, time, before/after, source |
| `PauseControl` | Org-level and customer-level; confirmation + audit |
| `LifecycleTracker` | Message state progression with provider IDs on expand |
| `AgingBar` | Non-overlapping buckets; click to filter queue |
| `ForecastStack` | Confirmed / promised / likely / at-risk with uncertainty |
| `ImportPreviewTable` | Row-level errors, inline fix, error CSV download |
| `DemoBadge` | Always-visible when demo data in use |

## 6. States and edge cases (design for all)

- **Empty:** new org with no invoices → guided import CTA, not blank charts.
- **Loading/partial:** skeletons; never show stale totals as current — display "as of" timestamp.
- **Data sync warning:** banner with affected counts and link to exceptions.
- **Provider failure/unknown outcome:** message shown as "unknown — recovery in progress", resend disabled until resolved.
- **Paused org:** persistent banner; send actions disabled with explanation.
- **Permission denied:** role-aware message; no leakage of other-tenant information.
- **AI unavailable:** original reply preserved, "needs manual review" state; no blank/failed UI.
- **Hidden unfinished features:** entry points for planned capabilities are hidden — don't display as available.

## 7. Roles and permissions in the UI

| Role | Can |
|---|---|
| Owner/Admin | All settings, pause controls, approvals, audit, billing |
| Finance manager | Policies, approvals, exceptions, disputes, reports |
| AR clerk | Queue, drafts, record promises, handle replies (approval per mode) |
| Accountant/partner | Import, reconcile, reports for scoped orgs |
| Read-only/viewer | Dashboards only |

UI hides/disables actions per role; **the backend is still the enforcement point**. ADMIN role introduced only via a reviewed migration (see `tasks.md` 0.2).

## 8. Customer-facing communication design

### Tone: polite but firm
- Represent the business accurately; respectful wording; state only validated invoice facts.
- **Never:** threats, misleading legal consequences, invented penalties/fees, shaming, excessive frequency, unapproved concessions.
- Always include: sender identity, invoice number/amount/due date, how to reply or request documents, how to opt out / contact preferences.
- Later-stage messages require human approval where policy/risk demands.

### Sample patterns *(illustrative — templates must be approved per channel)*

**Pre-due reminder (email/WhatsApp template)**
> Hello {contact}, a friendly reminder from {business}: invoice {inv_no} for {amount} is due on {due_date}. If you need a copy of the invoice or PO details, just reply here. Thank you!

**Overdue follow-up**
> Hello {contact}, our records show invoice {inv_no} ({amount}) was due on {due_date}. If it is already paid, please share the payment reference so we can match it. If something is blocking payment — a missing document or a query — let us know and we'll help resolve it.

**Promise confirmation**
> Thanks, {contact}. We've noted that payment of {amount} for {inv_no} is planned for {date}. We'll check in then if we haven't received it.

**Opt-out acknowledgement**
> Understood — we won't send further reminders on this channel. If you have an invoice query, you can still contact {business_contact}.

### Language rollout
English first → Hindi/Hinglish/Marathi only after English safety metrics are stable and each language is validated with reviewed templates.

## 9. Accessibility and quality bar
- WCAG 2.1 AA contrast; keyboard navigable queues and dialogs; screen-reader labels for status chips and money.
- All tables sortable/filterable with persistent filters; CSV export respects tenant scope and role.
- Time displayed in org timezone with explicit zone on hover; date-only promises shown in customer timezone.
- No dark patterns; destructive/irreversible operations require explicit confirmation.

## 10. Design validation plan
- Test the owner brief and work queue with 5 design-partner users (review-before-send mode).
- Measure: time to first useful dashboard, import error rate, approvals per hour, false-positive reply classifications seen by users, time-to-resolve blockers.
- Iterate weekly based on interviews; remove or simplify features not driving verified outcomes.
