# ACCO customer launch readiness review

**Review date:** 11 October 2026  
**Perspective:** First-time accounts receivable operator  
**Scope:** Frontend routes and workflows, visible affordances, report export, and the documented live/demo distinction. This is a code review, not an end-to-end run against a configured customer tenant.

## Customer journey

An AR operator can enter the dashboard, review outstanding and overdue totals, open invoice and customer directories, work the communications inbox, record payment promises, inspect payments and disputes, and view receivables aging. The core information architecture is recognizable for an AR team, and the demo-mode banner makes sample financial data explicit.

The path from first login to useful work is less clear. There is no in-product setup checklist to guide a new tenant through importing customers/invoices, configuring policies, inviting teammates, and verifying collections. Several visible or implied destinations do not yet lead to working workflows.

## Findings

| Priority | Finding | Customer impact | Recommended action |
|---|---|---|---|
| P0 | Collection Policies, invoice import, and individual collection case routes show scaffold placeholders. | Operators can reach these pages and reasonably expect to configure policy, load their ledger, or work a case, but cannot complete the task. | Hide unavailable entry points before launch or complete and validate each workflow. Add explicit unavailable messaging only where access is intentional. |
| P1 | Collection Intelligence was linked in navigation but had no corresponding route. | Navigation ended at a 404. | Removed the dead sidebar link until the destination exists. |
| P1 | Collection Performance reports are labeled Demo Only and state the live backend does not support them. | Live customers may interpret the analytics section as unfinished, and demo metrics must not be mistaken for real results. | Keep unavailable reports clearly marked; implement from audited live data before presenting them as customer analytics. |
| P1 | Aging report export previously contained only the selected currency and omitted bucket invoice counts; export silently did nothing when data was unavailable. | Multi-currency organizations got an incomplete file, and a disabled/ineffective action had no explanation. | Export all currencies, counts, share of outstanding by bucket, report timestamp, and show load errors with retry. |
| P2 | Dashboard collection work queue only includes overdue invoices from a limited 100-record receivables request; promises and AI analyses are queried only in demo mode. | Live users may miss follow-up work that appears in demo, while large ledgers can have incomplete overdue lists. | Add paginated live work-queue APIs and align demo/live capabilities; show queue coverage and loading/error states. |
| P2 | The landing page describes the product in technical terms and offers a direct dashboard link alongside sign-in. | First-time customers do not get a clear value proposition or a guided, authenticated setup path. | Replace with a customer-facing entry page and route unauthenticated users through sign-in and onboarding. |

## Changes made in this review

- Removed the navigation entry for the missing Collection Intelligence route.
- Improved aging CSV export to include every returned currency, invoice counts, each bucket's share of that currency's outstanding balance, and a generation timestamp. The filename is date-stamped and CSV cells are escaped.
- Added a report load-error message with a retry action and invoice counts in the aging breakdown.

## Before opening customer access

1. Decide which incomplete modules are hidden, enabled for a controlled pilot, or finished. In particular, policies, invoice ingestion, and collection case detail are operationally central.
2. Verify onboarding, tenant separation, role permissions, audit events, email delivery, and policy gates with separate customer accounts and realistic data.
3. Confirm report totals against the ledger for each supported currency and define whether closed/paid buckets belong in customer exports.
4. Exercise the product with a live backend and email provider; demo mode and UI unit tests cannot validate production delivery or financial correctness.
5. Add support/contact and incident paths so a customer can recover when imports, integrations, or collection actions fail.
