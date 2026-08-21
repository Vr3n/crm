# Module Implementation — Billing & Invoicing (Module 04)

**Ties to:** `docs/backend-plan/04-billing.md`, `docs/04-billing-and-invoicing.md`,
`docs/implementation-details/backend-foundation.md` (money-as-integer paise convention).
**Depends on:** customers-memberships (invoice customer + membership source),
catalog (tax/registration snapshots), finance (payments/allocations settle the invoice).
**Feeds into:** finance (receivable side), reference-transactions (sale creates invoice),
read-models (register, overdue, revenue).

## 1. Scope & dependencies

**Today:** no backend. Renderer `features/invoices/` is a mock store (`store.ts`,
`mock-data.ts`) with a full register UI — status filter, customer column, invoice detail
drawer. The read-model types already encode the future design: invoice lines are frozen
pricing snapshots, and `subtotal/taxTotal/total/paidAmount/outstanding` are **derived,
never stored** (types.ts comments).

**New in this step:** transactional `invoices` + `invoice_lines` + `invoice_sequence`,
the draft → finalize → void/uncollectible lifecycle, in-transaction numbering, and the
IPC/preload/renderer wiring that replaces the mock store.

Renderer status vocabulary to preserve:

```text
InvoiceStatus = DRAFT | OPEN | PARTIALLY_PAID | PAID | VOID | UNCOLLECTIBLE
```

`OPEN / PARTIALLY_PAID / PAID` are **derived from allocations** (Module 05), never
hand-set; the invoice layer stores only DRAFT / VOID / UNCOLLECTIBLE explicitly.

## 2. DB tables (`src/main/db/schema/billing.ts`)

```text
invoices
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  customer_id integer FK customers NOT NULL
  invoice_no text NOT NULL UNIQUE            -- INV-YYYY-NNNNNN, from invoice_sequence
  membership_id integer FK memberships NULL  -- source entitlement, when billed for one
  issued_at text NOT NULL DEFAULT datetime('now')
  due_at text NULL
  status text NOT NULL DEFAULT 'DRAFT'       -- DRAFT|VOID|UNCOLLECTIBLE explicit;
                                             -- OPEN/PARTIALLY_PAID/PAID derived
  billing_name text NOT NULL                 -- customer billing snapshot (name)
  billing_address text NULL                  -- snapshot; address changes don't rewrite history
  currency text NOT NULL DEFAULT 'INR'
  subtotal_minor integer NOT NULL DEFAULT 0  -- derived but cached at finalize
  tax_minor integer NOT NULL DEFAULT 0       -- sum of per-line tax (snapshot)
  total_minor integer NOT NULL DEFAULT 0     -- subtotal + tax
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  finalized_at text NULL
  voided_at text NULL, void_reason text NULL
  INDEX (organization_id, status), INDEX (organization_id, customer_id),
  INDEX (organization_id, invoice_no)

invoice_lines
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  invoice_id integer FK invoices NOT NULL
  description text NOT NULL
  quantity integer NOT NULL DEFAULT 1        -- e.g. months of membership
  unit_price_minor integer NOT NULL          -- snapshot; plan price at billing time
  discount_minor integer NOT NULL DEFAULT 0  -- per-line discount (offer redemption)
  tax_rate_bps integer NOT NULL DEFAULT 0    -- snapshot of plan tax at billing time
  tax_minor integer NOT NULL DEFAULT 0       -- computed per line, stored for audit
  line_total_minor integer NOT NULL          -- (unit*qty − discount) + tax
  offer_redemption_id integer FK NULL        -- discount provenance
  sort_order integer NOT NULL DEFAULT 0
  INDEX (organization_id, invoice_id)

invoice_sequence
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL UNIQUE
  year integer NOT NULL
  last_value integer NOT NULL DEFAULT 0
  UNIQUE (organization_id, year)
```

Numbering: on finalize, inside the same transaction, upsert `invoice_sequence` for the
current year (`INSERT ... ON CONFLICT(organization_id,year) DO UPDATE SET
last_value=last_value+1 RETURNING last_value`) and format `INV-{year}-{last_value:06}`.
Voided invoices keep their number (gaps are intentional, audits rely on it).

## 3. Migrations

- Migration 1: the three tables above. Versions **14+** (13 reserved for
  customers-memberships). Register in `migrations.ts`.
- No seed rows (business records).

## 4. Backend use cases & queries

Domain (`src/main/domain/billing.ts`): state machine `DRAFT → OPEN(derived) →
PARTIALLY_PAID(derived) → PAID(derived)`, plus explicit `DRAFT → VOID` (only when never
finalized AND no allocations) and `OPEN → UNCOLLECTIBLE` (write-off, admin). Finalize
freezes line prices/tax and computes the cached totals; after finalize the invoice is
immutable except via void/uncollectible.

Commands (permission-gated, one `withTransaction`):

| Use case | Permission | Rules |
|---|---|---|
| `createInvoice(customerId, { billing snapshot, membershipId? })` | `invoice.create` | `status=DRAFT`, no number yet; lines added before finalize |
| `addInvoiceLine(invoiceId, line)` | `invoice.update` | DRAFT only; snapshots unit price/tax from plan (or manual); validates `line_total` math |
| `removeInvoiceLine(invoiceId, lineId)` | `invoice.update` | DRAFT only |
| `finalizeInvoice(invoiceId)` | `invoice.finalize` | DRAFT→(OPEN); assigns `invoice_no` in-tx; recomputes + caches totals; writes audit; returns numbered invoice |
| `voidInvoice(invoiceId, reason)` | `invoice.void` | DRAFT only (no allocations) → VOID; keeps number; audit reason |
| `markUncollectible(invoiceId, reason)` | `invoice.writeoff` | OPEN/PARTIALLY_PAID with `paid == 0` → UNCOLLECTIBLE; write-off logged |
| `updateBillingSnapshot(invoiceId, snapshot)` | `invoice.update` | DRAFT only; customer address/name edits never touch `customers` |

Reads:

| Query | Permission | Returns |
|---|---|---|
| `listInvoicesPage(filter, page)` | `invoice.view` | Paged invoice rows with derived `paidAmount`/`outstanding` (aggregated from allocations) |
| `getInvoice(invoiceId)` | `invoice.view` | invoice + lines + allocations + payment state |
| `getInvoiceByNumber(invoiceNo)` | `invoice.view` | exact lookup for the register URL / reference |
| `listCustomerInvoices(customerId)` | `invoice.view` | member-360 feed |
| `nextInvoiceNumberPreview()` | `invoice.view` | `${year}-${lastValue+1}` (for the form, not reserved) |

`paidAmount`/`outstanding` are computed in the read query from `payment_allocations`
(Module 05) at read time — never a stored column on `invoices`.

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `INVOICE_*` namespace):

```text
invoice:create            CreateInvoiceInput → InvoiceRow      (invoice.create)
invoice:addLine           { invoiceId, line } → InvoiceRow     (invoice.update)
invoice:removeLine        { invoiceId, lineId } → InvoiceRow   (invoice.update)
invoice:finalize          { invoiceId } → InvoiceRow           (invoice.finalize)
invoice:void              { invoiceId, reason } → InvoiceRow   (invoice.void)
invoice:markUncollectible { invoiceId, reason } → InvoiceRow   (invoice.writeoff)
invoice:updateSnapshot    { invoiceId, snapshot } → InvoiceRow (invoice.update)
invoice:list              InvoicePageQuery → Paged<InvoiceRow> (invoice.view)
invoice:get               { invoiceId } → InvoiceDetail        (invoice.view)
invoice:byNumber          { invoiceNo } → InvoiceDetail        (invoice.view)
invoice:listForCustomer   { customerId } → InvoiceRow[]        (invoice.view)
invoice:nextNumber        {} → InvoiceNumberPreview            (invoice.view)
```

Contracts in `src/shared/contracts/billing.ts`: all money as `*_minor` ints;
`invoiceLineInputSchema` validates `lineTotal = (unit*qty − discount) + tax`;
`finalizeInvoiceInputSchema` requires DRAFT. Errors: reuse `INVALID_STATE_TRANSITION`,
`NOT_FOUND`, `VALIDATION_ERROR`; new `INVOICE_ALREADY_NUMBERED` if double-finalize is
attempted.

## 6. Preload API

Extend `window.api.invoice` in `src/preload/index.ts` + `index.d.ts` with one method per
channel above, returning unwrapped `data` or rejecting with the typed error.

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/invoices/
├── api/
│   ├── invoices.api.ts       # list/get/byNumber/listForCustomer/finalize/void/
│   │                         # markUncollectible/nextNumber (window.api.invoice.*)
│   ├── lines.api.ts          # addLine/removeLine/updateSnapshot
│   └── index.ts              # barrel
├── mappers.ts                # *_minor→₹, ISO→date, derived status passthrough
└── queries.ts                # register reads + mutations (below)
```

- `features/invoices/api/`: replace `store.ts`/`mock-data.ts` with `window.api.invoice.*`;
  methods return the `shared/contracts/billing` wire types exactly. `*_minor` → rupees
  conversion lives in `features/invoices/mappers.ts`; keep the `Invoice` read-model
  shape unchanged so the register components do not change.
- `features/invoices/queries.ts`: `useInvoices(pageQuery)` (`invoice:list`),
  `useInvoice(id)` (`invoice:get`, staleTime short so finalize→open reflects immediately),
  `useNextInvoiceNumber`; mutations `useCreateInvoice`, `useAddLine`, `useRemoveLine`,
  `useFinalizeInvoice`, `useVoidInvoice`, `useMarkUncollectible` — each invalidating
  `['invoices']`, `['invoices','customer',id]`, and `['finance']`.
- Keep `status` derivation on the read side: `OPEN/PARTIALLY_PAID/PAID` arrive from the
  backend aggregation (which considers allocations); the UI just renders it.

## 8. UI wiring

- Invoice register keeps its table/filters/detail drawer; data source becomes IPC.
- **Add (currently placeholder toasts):** real New-invoice form (customer picker → billing
  snapshot → line editor with plan price/tax autofill from `plan:list`), **Finalize**
  button (numbers the invoice, shows the number, enters OPEN), **Void** with reason
  (DRAFT only), **Mark uncollectible** (admin, OPEN/PARTIALLY_PAID).
- Detail drawer shows derived payment state (from `invoice:get`) and a "Record payment"
  entry point that jumps to the finance payment flow (Module 05).
- The "duplicate invoice" convenience can reuse `createInvoice` + lines in DRAFT.

## 9. Seed & permissions

- Permissions to add: `invoice.view/create/update/finalize/void/writeoff`. Seed grants:
  Manager = all; Receptionist = `invoice.view/create/update/finalize`; Sales =
  `invoice.view`. Super roles inherit.
- No seed rows (business records). Numbering starts at `last_value=0` per org/year.

## 10. Tests

- **Numbering (application):** finalize assigns `INV-2026-000001` then `…000002` under
  concurrent finalize calls; org/year isolation; gaps on void are intentional and tested.
- **State machine:** finalize on non-DRAFT → `INVOICE_ALREADY_NUMBERED`; void on finalized
  invoice → `INVALID_STATE_TRANSITION`; markUncollectible on PAID → error.
- **Snapshot math:** line totals/tax computed from paise inputs; totals cached at finalize
  and stable afterwards.
- **Derived payment state:** after allocations (Module 05), read query reports
  OPEN/PARTIALLY_PAID/PAID correctly; `paidAmount`/`outstanding` clamp at 0.
- **Repository + IPC:** org-scoped queries; handler tests (validation, permission, envelope).
- **Renderer:** register lists IPC rows; finalize/void invoke channels and invalidate.

## 11. Decisions & open items

1. **Status storage split**: `invoices.status` stores only DRAFT/VOID/UNCOLLECTIBLE; the
   money-state trio is derived from allocations at read. Confirmed by the renderer types'
   own comments — do not add a stored `payment_status` column.
2. **Number assignment at finalize, not create**: gaps on void are intentional; preview
   (`nextInvoiceNumber`) is display-only and never reserves.
3. **Snapshot discipline**: `billing_name`/`billing_address` and every line's
   price/tax/discount are frozen at draft/finalize time; later plan/customer changes never
   rewrite history.
4. **Payment methods**: `PaymentMethod` types already exist in `lib/payment-methods`;
   wiring to Module 05 only.
5. **Sequence collision safety**: single-user desktop app — the `ON CONFLICT ... UPDATE
   ... RETURNING` upsert is atomic; revisit if a multi-process backend ever appears.