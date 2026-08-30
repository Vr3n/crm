# Module Implementation — Finance: Payments, Refunds, Credits (Module 05)

**Ties to:** `docs/backend-plan/05-finance.md`, `docs/05-payments-and-finance.md`,
`docs/backend-plan/04-billing.md` (invoice settlement).
**Depends on:** billing (invoices/allocations target), customers-memberships
(customer refs), backbone audit (write when available).
**Feeds into:** read-models (daily collections, outstanding dues, revenue), ops
(export), reference-transactions (payment command).

## 1. Scope & dependencies

**Today:** no backend. Renderer mocks: `features/finance/` (payments, refunds, credits
registers + store) and `features/collections/` (daily collection report). The read-model
types already document the discipline: a **Payment** is money that arrived, a **Refund**
is money that left, a **Credit** is value kept in the business, and the only link between
money and obligations is the explicit **PaymentAllocation** (finance/types.ts). Amounts
are whole rupees in the mock; the transactional layer stores integer paise.

**New in this step:** transactional `payments`, `payment_allocations`, `refunds`,
`credits`, `credit_allocations`; the allocation math that derives invoice status
(OPEN/PARTIALLY_PAID/PAID); refund layering; credit lifecycle; and the IPC/preload/renderer
wiring replacing both mock stores.

Renderer vocabulary to preserve:

```text
PaymentMethod        = CASH | UPI | CARD | BANK_TRANSFER | CHEQUE | OTHER
AllocationStatus     = FULLY_ALLOCATED | PARTIALLY_ALLOCATED | UNALLOCATED
CreditStatus         = AVAILABLE | PARTIALLY_APPLIED | APPLIED
```

## 2. DB tables (`src/main/db/schema/finance.ts`)

```text
payments
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  customer_id integer FK customers NOT NULL
  payment_no text NOT NULL UNIQUE             -- PAY-YYYY-NNNNNN (own sequence, like invoices)
  payment_date text NOT NULL
  amount_minor integer NOT NULL
  method text NOT NULL                        -- PaymentMethod
  reference text NULL                         -- UPI ref / cheque no / card last4
  notes text NULL
  status text NOT NULL DEFAULT 'RECORDED'     -- RECORDED|FULLY_ALLOCATED|PARTIALLY_ALLOCATED
                                              -- (derived; see AllocationStatus) — index cached
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  CHECK (amount_minor > 0)
  INDEX (organization_id, payment_date), INDEX (organization_id, customer_id)

payment_allocations
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  payment_id integer FK payments NOT NULL
  invoice_id integer FK invoices NOT NULL
  amount_minor integer NOT NULL
  allocated_at text NOT NULL DEFAULT datetime('now')
  created_by integer FK users NOT NULL
  CHECK (amount_minor > 0)
  UNIQUE (payment_id, invoice_id)
  INDEX (organization_id, invoice_id)         -- drives invoice paid/outstanding derivation

refunds
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  customer_id integer FK customers NOT NULL
  refund_no text NOT NULL UNIQUE              -- RFS-YYYY-NNNNNN
  payment_id integer FK payments NOT NULL     -- refund is layered on a source payment
  refund_date text NOT NULL
  amount_minor integer NOT NULL
  method text NOT NULL
  reason text NOT NULL
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  CHECK (amount_minor > 0)
  INDEX (organization_id, payment_id), INDEX (organization_id, refund_date)

credits
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  customer_id integer FK customers NOT NULL
  credit_no text NOT NULL UNIQUE              -- CRT-YYYY-NNNNNN
  issued_at text NOT NULL
  amount_minor integer NOT NULL
  reason text NOT NULL
  source text NULL                            -- e.g. 'OVERPAYMENT' | 'REFUND_CONVERSION' | 'POLICY'
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  CHECK (amount_minor > 0)
  INDEX (organization_id, customer_id), INDEX (organization_id, issued_at)

credit_allocations
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  credit_id integer FK credits NOT NULL
  invoice_id integer FK invoices NOT NULL
  amount_minor integer NOT NULL
  applied_at text NOT NULL DEFAULT datetime('now')
  created_by integer FK users NOT NULL
  CHECK (amount_minor > 0)
  UNIQUE (credit_id, invoice_id)
  INDEX (organization_id, invoice_id)
```

Numbering mirrors billing: per-entity sequences (`payment_sequence`, `refund_sequence`,
`credit_sequence`) upserted in-transaction on creation, formatted `PAY-`/`RFS-`/`CRT-`.
Derived quantities are never stored: `AllocationStatus` and invoice
`paidAmount/outstanding` are computed at read time from these tables.

## 3. Migrations

- Migration 1: the five tables + three sequences. Versions **16+** (15 reserved for
  billing). Register in `migrations.ts`.
- No seed rows (business records).

## 4. Backend use cases & queries

Domain (`src/main/domain/finance.ts`) allocation rules:

- `recordPayment`: creates the payment (RECORDED, unallocated). Money never edited after
  creation — corrections are refunds (money out) or credits (value retained).
- `allocatePayment(paymentId, [{ invoiceId, amount }])`: validates sum ≤ payment
  remaining; each allocation must not exceed the invoice's outstanding (derived);
  writes `payment_allocations`; recomputes payment `AllocationStatus` and the target
  invoice's derived status.
- **Overpayment** (allocation less than payment, or customer pays more than due):
  remainder stays UNALLOCATED and is surfaced in the UI — the operator converts it to a
  **Credit** or allocates to another invoice; it is never silently swallowed.
- `issueRefund(paymentId, amount, reason)`: amount ≤ that payment's refundable
  (payment amount − refunds − allocations that are themselves refunded). Layered, dated,
  reasoned; never edits the payment.
- `issueCredit(customerId, amount, reason, source?)`: standalone value (e.g. converted
  overpayment / policy goodwill).
- `applyCredit(creditId, invoiceId, amount)`: amount ≤ credit remaining and invoice
  outstanding; writes `credit_allocations`, which count toward the invoice's derived
  `paidAmount` alongside payment allocations.

Commands (permission-gated, one `withTransaction`):

| Use case | Permission | Rules |
|---|---|---|
| `recordPayment(input)` | `finance.record` | amount > 0; customer exists; writes `payment_no` in-tx |
| `allocatePayment(paymentId, allocations)` | `finance.record` | sum ≤ remaining; per-invoice ≤ outstanding |
| `convertOverpaymentToCredit(paymentId, amount)` | `finance.record` | unallocated remainder → `issueCredit(source='OVERPAYMENT')` |
| `issueRefund(paymentId, amount, reason)` | `finance.refund` | ≤ refundable on that payment |
| `issueCredit(input)` | `finance.credit` | standalone credit |
| `applyCredit(creditId, invoiceId, amount)` | `finance.record` | ≤ credit remaining; ≤ invoice outstanding |

Reads:

| Query | Permission | Returns |
|---|---|---|
| `listPaymentsPage(filter, page)` | `finance.view` | Paged payments with `AllocationStatus` + remaining |
| `getPayment(paymentId)` | `finance.view` | payment + allocations + linked refunds |
| `listRefundsPage(filter, page)` | `finance.view` | Paged refunds |
| `listCreditsPage(filter, page)` | `finance.view` | Paged credits with derived `CreditStatus` + remaining |
| `getCredit(creditId)` | `finance.view` | credit + applications |
| `getOutstandingBalance(customerId)` | `finance.view` | sum of invoice outstanding (for customer 360) |
| `listCustomerPayments(customerId)` | `finance.view` | member-360 feed |

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `FINANCE_*` namespace):

```text
finance:recordPayment      RecordPaymentInput → PaymentRow        (finance.record)
finance:allocatePayment    { paymentId, allocations } → PaymentRow (finance.record)
finance:convertOverpayment { paymentId, amount } → CreditRow      (finance.record)
finance:issueRefund        { paymentId, amount, reason } → RefundRow (finance.refund)
finance:issueCredit        IssueCreditInput → CreditRow           (finance.credit)
finance:applyCredit        { creditId, invoiceId, amount } → CreditRow (finance.record)
finance:listPayments       PaymentPageQuery → Paged<PaymentRow>   (finance.view)
finance:getPayment         { paymentId } → PaymentDetail          (finance.view)
finance:listRefunds        RefundPageQuery → Paged<RefundRow>     (finance.view)
finance:listCredits        CreditPageQuery → Paged<CreditRow>     (finance.view)
finance:getCredit          { creditId } → CreditDetail            (finance.view)
finance:outstanding        { customerId } → OutstandingResult     (finance.view)
```

Contracts in `src/shared/contracts/finance.ts`: money as `amount_minor` ints; input
schemas validate positivity and that allocation sums are consistent (the application
re-checks against remaining/outstanding inside the tx). Errors: reuse
`VALIDATION_ERROR`, `NOT_FOUND`; new codes `INSUFFICIENT_ALLOCATABLE`,
`INSUFFICIENT_CREDIT`, `REFUND_EXCEEDS_PAYMENT`, `OVERPAYMENT_REMAINDER` (informational,
returned when an allocation leaves unallocated money).

## 6. Preload API

Extend `window.api.finance` in `src/preload/index.ts` + `index.d.ts` with one method per
channel above, unwrapping `data` or rejecting with the typed error. (The renderer
currently reads a mock via `features/finance/api.ts` and `features/collections/api.ts` —
both point at `window.api.finance.*` after this step.)

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/finance/
├── api/
│   ├── payments.api.ts       # recordPayment/allocatePayment/convertOverpayment/list/get
│   ├── refunds.api.ts        # issueRefund/list
│   ├── credits.api.ts        # issueCredit/applyCredit/list/get
│   ├── outstanding.api.ts    # outstanding(customerId)
│   └── index.ts              # barrel
├── mappers.ts                # *_minor→₹, ISO→date, AllocationStatus/CreditStatus passthrough
└── queries.ts                # registers + mutations (below)
```

- `features/finance/api/`: replace mock calls with `window.api.finance.*`; methods return
  the `shared/contracts/finance` wire types exactly. `*_minor`→rupees conversion lives in
  `features/finance/mappers.ts`; keep the register read-model shapes.
- `features/finance/queries.ts`: `usePayments(pageQuery)`, `usePayment(id)`,
  `useRefunds(pageQuery)`, `useCredits(pageQuery)`, `useCredit(id)`,
  `useOutstanding(customerId)`; mutations `useRecordPayment`, `useAllocatePayment`,
  `useConvertOverpayment`, `useIssueRefund`, `useIssueCredit`, `useApplyCredit` —
  invalidating `['finance']`, `['invoices']` (statuses derive from allocations),
  `['collections']`, and the affected customer.
- `features/collections/api.ts`: replace `mock-data.ts` with `finance:listPayments`
  grouped by day/method (or a dedicated read channel in Module 09 — decision below);
  `queries.ts` `useDayCollections(date)` invalidated on any payment mutation.

## 8. UI wiring

- Finance registers (payments / refunds / credits) keep their tables + drawers; data from
  IPC.
- **Add:** Record-payment dialog (amount, method, reference, then an allocation step that
  offers the customer's open invoices with remaining outstanding; leftover shows the
  overpayment remainder with a "Convert to credit" action); Refund dialog (pick a source
  payment, amount ≤ refundable); Issue-credit dialog; Apply-credit picker on invoice
  detail.
- Collections page keeps its daily report; aggregation now comes from real payments.
- Payment detail drawer shows allocations + refunds layered on top (never merged).

## 9. Seed & permissions

- Permissions to add: `finance.view`, `finance.record`, `finance.refund`,
  `finance.credit`. Seed grants: Manager = all; Receptionist = `finance.view` +
  `finance.record`; Sales = `finance.view` (+`finance.record` when the sale payment is
  taken). Super roles inherit.
- No seed rows (business records). Sequences start at 0 per org/year.

## 10. Tests

- **Allocation math (application):** partial allocation derives PARTIALLY_PAID; full
  allocation derives PAID; over-allocation rejected; cross-customer allocation rejected.
- **Overpayment path:** remainder surfaces; convertOverpayment produces a credit with
  source OVERPAYMENT and the exact amount.
- **Refund layering:** refund ≤ refundable enforced; refunds never mutate the payment row.
- **Credits:** apply ≤ credit remaining and ≤ invoice outstanding; CreditStatus derives
  correctly.
- **Numbering:** PAY-/RFS-/CRT- sequences per org/year, atomic under concurrency.
- **Repository + IPC:** org-scoped queries; handler tests (validation, permission, envelope).
- **Renderer:** registers list IPC rows; record/refund/credit dialogs invoke channels and
  invalidate invoices + collections.

## 11. Decisions & open items

1. **Derived invoice status:** allocations (payments + credits) drive OPEN/PARTIALLY_PAID/
   PAID at read time; the invoice layer never writes these — already encoded in
   `billing.md` §5 and the renderer types.
2. **Overpayment policy:** never auto-absorb; always surface remainder and let the operator
   convert to credit or allocate elsewhere. Confirmed by docs/05; keep the
   `OVERPAYMENT_REMAINDER` code informational (200-style) so the UI can react.
3. **Payment edits:** disallowed by design. Any correction = refund (money out) or credit
   (value kept). This is the invariant that keeps the ledger auditable.
4. **Daily collections location:** prefer a dedicated read channel in Module 09
   (`report:dailyCollections`) over grouping `finance:listPayments` client-side — the
   decision is made in `read-models.md`; the collections UI only depends on whichever is
   agreed.
5. **Rounding:** all arithmetic in paise; per-line and per-allocation rounding must not
   drift — validate with an allocation test that sums to the exact payment/credit amount.