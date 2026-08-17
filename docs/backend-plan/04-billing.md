# 04 — Billing & Invoicing

**Ties to:** Module 04.
**Depends on:** 00, 02, 03.
**Feeds into:** 05 (invoices wait for payments), 07 (sale/renewal flows).

Billing determines what the customer *owes*; Membership determines what they're
*entitled to*. They are separate (Module 04 §12). A finalized invoice is immutable; a
`DRAFT` gives the front desk a live total before the numbers freeze.

## Tables (`src/main/db/schema/billing.ts`)

### `invoices`

```text
id integer PK, organization_id FK,
number text NOT NULL UNIQUE,               -- business number, generated (Module 04 §36)
customer_id FK customers NOT NULL,
status text NOT NULL DEFAULT 'DRAFT',      -- DRAFT / OPEN / PARTIALLY_PAID / PAID / VOID / UNCOLLECTIBLE
-- customer snapshot for the document (Module 02 §21, §4 §technical decision):
billing_name text, billing_phone text, billing_email text, billing_address text,
-- totals (minor units, computed at finalize and never recomputed live):
subtotal_minor integer NOT NULL DEFAULT 0,
tax_minor integer NOT NULL DEFAULT 0,
total_minor integer NOT NULL DEFAULT 0,
finalized_at text NULL, finalized_by FK users NULL,
voided_at text NULL, voided_by FK users NULL, void_reason text NULL,
created_at, created_by FK users NOT NULL
```

### `invoice_lines`

```text
id integer PK, organization_id FK,
invoice_id FK NOT NULL,
-- historical snapshot (Module 04 §14, §33; never recompute from plan/offer):
description text NOT NULL,
quantity integer NOT NULL DEFAULT 1,
unit_price_minor integer NOT NULL,
discount_minor integer NOT NULL DEFAULT 0,
tax_rate_bps integer NOT NULL,
tax_amount_minor integer NOT NULL,
line_total_minor integer NOT NULL,
-- reporting references (optional, never authoritative):
plan_id FK NULL, offer_id FK NULL,
sort_order integer NOT NULL DEFAULT 0
```

### `invoice_sequence`

```text
id, organization_id FK, year text NOT NULL, prefix text NOT NULL, last_value integer NOT NULL DEFAULT 0,
UNIQUE (organization_id, year, prefix)
```

Number generation is an explicit, auditable counter incremented inside the same
transaction as invoice finalization (Module 04 §36, §4 §technical decision). Never use
the row PK as the printed number.

## State machine (Module 11 §72, Module 04 §13)

```text
DRAFT ──finalize──► OPEN ──payment──► PARTIALLY_PAID ──payment──► PAID
                     │                                            ▲
                     ├──void──► VOID                              │
                     └──mark uncollectible──► UNCOLLECTIBLE      │
                       (payment state derived from allocations,   │
                        see 05-finance.md — PAID is reached via   │
                        allocation math, not a direct command)    │
```

- `DRAFT → OPEN`: the only edit window. Finalize requires ≥ 1 line and a customer;
  assigns the invoice number; freezes financial values.
- `OPEN → VOID`: explicit operation with a reason. Never `UPDATE status` from the UI.
- `OPEN/PARTIALLY_PAID → PAID`: derived by payment allocation (Module 07), not by a
  direct status write.

## Commands

```text
CreateInvoice     invoice.create       -- DRAFT, customer required
AddInvoiceLine    invoice.create       -- appends line (DRAFT only); recomputes draft totals
RemoveInvoiceLine invoice.create       -- removes line (DRAFT only)
FinalizeInvoice   invoice.finalize     -- ≥1 line; number assigned in-transaction; frozen
VoidInvoice       invoice.void         -- OPEN only; reason required; financial values kept
MarkUncollectible invoice.void         -- OPEN only; reason required
```

Invoice lines are added through the sale/renewal flows (Module 07) as well as through
manual drafting. The catalog snapshot is produced by `MembershipPricingService` (03) and
copied into the line at creation.

## Tax (Module 04 §35)

- `tax_code` and `tax_rate_bps` are snapshot per line at creation/finalization. The GST
  example (18% → ₹3,456 on the ₹19,200 line) is stored, never recomputed when config
  later changes to 20%.
- No tax logic in React components or ad-hoc SQL; tax config is a Catalog/settings
  concern read by the pricing service.

## Invoice numbering

- Format configurable: `INV-2026-000147` (year-prefixed) or `INV-000001` (plain).
- Rule lives in the application/domain layer, reading the org's numbering setting.
- Generation: inside the finalize transaction, `UPDATE invoice_sequence SET last_value =
  last_value + 1`, then format. Uniqueness enforced by `UNIQUE (organization_id, year,
  prefix)` + the `number UNIQUE` index; a collision aborts the transaction
  (`INVOICE_NUMBER_COLLISION`).

## Tests

- DRAFT allows line edits; finalized invoice rejects any line/total change
  (`INVOICE_ALREADY_FINALIZED`).
- Finalize with zero lines rejected (`INVOICE_EMPTY`).
- Tax rounding: line tax computed once at creation, half-up, integer paise; totals are
  the sum of line values (no float drift — Scenario 3/8 regression test).
- Numbering: sequential, gap-free per (org, year, prefix); counter increments
  atomically with finalize; collision aborts and rolls back.
- Void: keeps financial values, records voided_at/voided_by/reason; OPEN only.
- Snapshot principle: change plan price or offer after finalize → invoice unchanged
  (Scenarios 3 & 8, integration-level).