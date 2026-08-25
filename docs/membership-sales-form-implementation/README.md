# Membership Sale Form — Implementation Details

Modular implementation log for the full-page **Membership Sale** flow (`/memberships/sale`, alias `/memberships/sell`). Each numbered file maps 1:1 to a plan phase in `plans/membership-sale-form/` and is written after that phase ships, so the narrative is *what was actually built* rather than what was planned.

## Map

| Phase / File | Plan source | Status | What it covers |
|---|---|---|---|
| `01-ia-and-layout.md` | `plans/membership-sale-form/01-ia-and-layout.md` | **Shipped** | IA decision, route & shell, two-column Tally-style split, card pairing, submit placement, anchor-nav deferral, routing & entry points |
| `02-lead-and-plan-selection.md` | `02-lead-and-plan-selection.md` | Planned | AutocorrectCombobox reuse, duplicate-phone guard, plan override/badge |
| `03-offer-and-pricing-engine.md` | `03-offer-and-pricing-engine.md` | Planned | Discount types, linked type/value, currency mask, reactive pricing, zero-guard |
| `04-dates-and-timezone.md` | `04-dates-and-timezone.md` | Planned | Days mapping, UTC↔IST, calendar math, live date validation |
| `05-payment-and-overpay.md` | `05-payment-and-overpay.md` | Planned | Partials, overpay dialog (credit vs change), method, Tax/RegFee |
| `06-invoice-and-pdf.md` | `06-invoice-and-pdf.md` | Planned | Invoice number format, snapshot, PDF generation, Downloads + notifications |
| `07-form-orchestration-and-validation.md` | `07-form-orchestration-and-validation.md` | Planned | TanStack Form/Query wiring, validation, a11y, idempotency, perf |
| `08-component-tree-and-execution-order.md` | `08-component-tree-and-execution-order.md` | Planned | File tree, IPC contracts, tests, phased build order |

## How to read

- Start with `plans/membership-sale-form/00-overview-and-glossary.md` for the frozen glossary and validation contract (`Final Price`, `Amount Due`/`Change Due`, duration in days, money in paise, `QUARTERLY` etc.).
- Then read the numbered plan → then its matching `docs/membership-sales-form-implementation/*.md` to see what diverged and why.
- Code references are absolute from the repo root: `src/renderer/...`, `src/main/...`, `src/shared/...`.

## Conventions reused

- Tally-inspired single-page totals block (`tallysolutions.com/custom-invoice-templates`).
- `docs/form-implementation-guideline.md` — TanStack Form v1 + `FormField`/`Field`/`FieldGroup`/`LoadingButton`, standalone `queryOptions` keys, `if(v!=='')` Radix guard, `labelEnd` slot.
- `docs/implementation-details/leads-pipeline.md` — AutocorrectCombobox + lazy dialogs + `staleTime` caching.
- `docs/08-persistence-and-electron-architecture.md` §52 — React owns rendering, not pricing/validation truth.
