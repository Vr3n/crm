# 05 — Finance: Payments, Allocations, Refunds, Credits & Outstanding Balances

**Ties to:** Module 05.
**Depends on:** 00, 04.
**Feeds into:** 09 (finance dashboards), 07 (payment transaction).

Operational finance, not double-entry accounting (Module 05 §20). Three separate
concepts: **Payment** (money arrived), **Invoice** (money owed), **PaymentAllocation**
(which part of which payment covers which invoice). Refunds and Credits are distinct,
both immutable additions layered on top of the original payment.

## Tables (`src/main/db/schema/finance.ts`)

### `payments`

```text
id integer PK, organization_id FK,
customer_id FK NOT NULL,
payment_date text NOT NULL,
amount_minor integer NOT NULL CHECK (amount_minor > 0),
payment_method text NOT NULL,              -- CASH / UPI / CARD / BANK_TRANSFER / CHEQUE / OTHER (configurable)
reference text NULL, notes text NULL,
created_at, created_by FK users NOT NULL
```

Never edited or deleted (Module 05 §15, §20). A payment is a staff-recorded fact, not a
machine-verified gateway event.

### `payment_allocations`

```text
id integer PK, organization_id FK,
payment_id FK NOT NULL,
invoice_id FK NOT NULL,
amount_minor integer NOT NULL,
created_at, created_by FK users NOT NULL,
CHECK (amount_minor > 0)
```

- Payment 1 ── * PaymentAllocation * ── 1 Invoice.
- Invariant: allocated total per payment ≤ payment amount
  (`PAYMENT_OVER_ALLOCATED`); allocation per invoice ≤ invoice outstanding.
- Allocations are immutable; correcting one is a reversal + new allocation (see §Refunds
  & corrections).

### `refunds`

```text
id integer PK, organization_id FK,
payment_id FK NOT NULL,
amount_minor integer NOT NULL,
reason text NOT NULL,
created_at, created_by FK users NOT NULL
```

- A refund never edits the payment (Module 05 §17, Scenario 5).
- Invariant: refunded total per payment ≤ paid total (`REFUND_EXCEEDS_PAYMENT`).
- A refund "reverses" allocation coverage: it decreases the *net allocated* toward the
  invoice, which may flip invoice state back toward OPEN (Module 05 §worked example).

### `credits`

```text
id integer PK, organization_id FK,
customer_id FK NOT NULL,
amount_minor integer NOT NULL,
remaining_minor integer NOT NULL,
reason text NOT NULL,
expires_at text NULL,
created_at, created_by FK users NOT NULL
```

### `credit_allocations`

```text
id integer PK, organization_id FK,
credit_id FK NOT NULL,
invoice_id FK NOT NULL,
amount_minor integer NOT NULL,
created_at, created_by FK users NOT NULL
```

- A credit stays inside the business as value against a future obligation (Module 05 §18).
- Invariant: applied total per credit ≤ credit amount (`CREDIT_EXCEEDS_BALANCE`);
  `remaining_minor` is maintained by the application layer in the same transaction.

## Payment state of an invoice (derived, Module 07 §47)

```text
allocated = SUM(payment_allocations) − SUM(refunded toward this invoice)
0                    → OPEN
0 < allocated < total → PARTIALLY_PAID
allocated ≥ total     → PAID
```

The `invoices.status` is updated by the application layer when allocations change, but
it is always derived from allocation math — never hand-set. `GetOutstandingInvoices`
computes outstanding live.

## Overpayment handling (explicit decision, Module 07 §47)

When a payment exceeds an invoice's outstanding, the excess is **not** allocated beyond
the outstanding amount. The application layer surfaces the unallocated remainder to the
staff member and lets them either (a) allocate it to another open invoice, or (b) convert
it to a Credit. This rule is a single policy function, unit-tested, so the behavior is
identical from every screen.

## Commands

```text
RecordPayment   payment.record    -- creates payment; must be allocated (possibly to advance/unallocated)
AllocatePayment payment.allocate  -- links payment → invoice, re-derives invoice state
IssueRefund     refund.create     -- validates ≤ net paid; re-derives invoice state
IssueCredit     credit.create     -- validates reason; initializes remaining_minor
ApplyCredit     credit.apply      -- credit → invoice; decrements remaining_minor; re-derives state
```

A combined `RecordAndAllocatePayment` convenience command wraps the Module 07 payment
transaction for the common "customer pays now" case.

## Queries

```text
GetOutstandingInvoices     payment.view   -- live derived outstanding
GetDailyCollections        report.view    -- SUM(payments) by method/date (Module 09)
GetCustomerFinancialSummary payment.view  -- totals + outstanding (customer 360)
GetPaymentHistory / GetRefundHistory / GetCreditBalance
GetInvoicePaymentState     invoice.view   -- totals, allocated, refunded, outstanding
```

Outstanding balance is a **derived** value (Module 05 §19) — no `customer.balance`
counter incremented/decremented by UI code. If a cached read model is added later, it
must be rebuildable from source records.

## Tests

- One payment, two invoices, partial allocation → both invoices' states correct
  (Scenario 4).
- Refund reduces net allocation and can flip PARTIALLY_PAID → OPEN; original payment
  unchanged (Scenario 5).
- Refund > net paid rejected (`REFUND_EXCEEDS_PAYMENT`); allocation > payment rejected
  (`PAYMENT_OVER_ALLOCATED`).
- Credit applied to invoice decrements `remaining_minor`; cannot exceed it
  (`CREDIT_EXCEEDS_BALANCE`).
- Overpayment: excess surfaced, not silently allocated; convertible to credit.
- Derived outstanding matches SUM of finalized obligations − allocations − credits.
- All financial records immutable: no UPDATE path to payment amount, allocation amount,
  or invoice totals.