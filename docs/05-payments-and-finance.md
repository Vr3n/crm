# Module 05 — Payments, Refunds, Credits & Outstanding Balances

**Bounded context:** `Finance` (operational finance, not full accounting)
**Depends on:** Module 04 (a Payment is recorded against one or more Invoices).
**Feeds into:** dashboards/reporting (Module 09) and nothing structurally beyond that — this is close to a leaf module.

## Why Payment and Invoice are not a one-to-one pair

The naive model — `invoice.paid_amount`, `invoice.paid = true` — breaks the first time a customer pays in advance, pays for two invoices with one bank transfer, or pays partially. Model three things instead: **Payment** (money that arrived), **Invoice** (money that's owed), and **PaymentAllocation** (the explicit link saying which part of which payment covers which invoice). This is the same pattern accounting software uses, and it costs one small join table.

## Worked example: one payment, two invoices, then a partial refund

```text
Priya owes:
  Invoice A (annual membership)  ₹23,246
  Invoice B (personal training)  ₹6,000

She pays ₹25,000 in one bank transfer.

Payment P-9001: amount = ₹25,000, method = BANK_TRANSFER

Allocations:
  P-9001 → Invoice A: ₹23,246   (Invoice A becomes PAID)
  P-9001 → Invoice B: ₹1,754    (Invoice B becomes PARTIALLY_PAID, ₹4,246 still due)

Two weeks later, Priya cancels the PT package before any sessions were used.
Gym policy: full refund of what was paid toward it.

Refund R-201: against Payment P-9001, amount = ₹1,754, reason = "PT package cancelled"

State after refund:
  Payment P-9001 remains on record: ₹25,000 (unchanged — it really was received)
  Refund R-201 on record: ₹1,754
  Net cash retained from P-9001 = ₹23,246
  Invoice B: now shows ₹1,754 unallocated again → reverts toward its original due amount
```

Notice the original ₹25,000 payment is **never edited**. A bank statement audit six months later must be able to see "₹25,000 came in on this date" exactly as it happened, with the refund as a separate, dated, reasoned event layered on top.

## Technical decision, explained intuitively

**Why distinguish Credit from Refund instead of treating "money back" as one concept?**
A refund leaves the business (goes back to the customer's bank/card/cash). A credit stays *inside* the business as a promise against a future invoice (e.g., "we owe you ₹2,000 of unused membership time, apply it to your next renewal"). These have different accounting and cash-flow implications — conflating them means your "cash collected today" report becomes wrong the first time someone uses a credit instead of receiving cash. Two small tables (`refunds`, `credits`) keep the two flows honest.

**Why should `customer.outstanding_balance` be a *derived/cached* value rather than something the UI increments and decrements directly?**
If application code does `balance += invoiceTotal` and `balance -= paymentAmount` scattered across different screens, any bug, crash, or skipped step leaves the cached number permanently wrong with no way to know it's wrong. Instead, compute outstanding balance as a query — `SUM(finalized invoice totals) - SUM(allocated payments) - SUM(applied credits) + SUM(applicable charges)` — run on demand or refreshed into a cache table by a job that can always be re-run from scratch. The rule of thumb: **anything you can recompute from source records should be a cache, never a hand-maintained counter.**

**Why doesn't this module attempt full double-entry accounting (ledgers, debits/credits, chart of accounts)?**
Because that's a different, much larger domain that most single-location gyms don't need day one, and building it prematurely would slow down every other module. The important discipline (see original spec §20) is to design Payments/Refunds/Credits so that a *future* accounting module could be bolted on without re-architecting — which is exactly what "never delete, never overwrite, always add an explanatory record" already gives you for free.

---

# 15. Payment

A Payment represents money recorded as received against one or more financial obligations.

Example:

```text
Customer pays ₹10,000
Invoice = ₹20,000
```

Result:

```text
Invoice total       ₹20,000
Payment allocated   ₹10,000
Outstanding         ₹10,000
```

Do not store only:

```text
invoice.paid = true
```

The payment itself needs to be a domain record.

Recommended fields:

```text
id
customer_id
payment_date
amount
payment_method
reference
notes
created_by
created_at
```

Initial payment methods may include:

```text
CASH
UPI
CARD
BANK_TRANSFER
CHEQUE
OTHER
```

These should be configurable.

Because the first application has no payment gateway integration, a staff member is recording a payment rather than receiving a machine-verified payment event.

That distinction matters.

---

# 16. Payment Allocation

A payment and invoice should not necessarily have a one-to-one relationship.

Example:

```text
Payment:
    ₹30,000

Invoice A:
    ₹20,000

Invoice B:
    ₹10,000
```

The system can allocate:

```text
Payment
    ├── ₹20,000 → Invoice A
    └── ₹10,000 → Invoice B
```

Therefore model:

```text
Payment
PaymentAllocation
Invoice
```

rather than putting only:

```text
payment.invoice_id
```

This gives the domain room to support advance payments and multiple outstanding invoices.

---

# 17. Refund

A refund should be an explicit financial operation.

Do not delete the original payment.

Example:

```text
Payment:
    ₹20,000

Refund:
    ₹5,000
```

Historical records remain:

```text
Payment = ₹20,000
Refund  = ₹5,000
Net returned = ₹5,000
```

This is much safer than changing the original payment amount.

---

# 18. Credit

Credit is different from refund.

A refund returns money.

A credit represents value that can be applied against a future obligation.

Example:

```text
Unused membership value:
    ₹2,000

Customer receives:
    ₹2,000 account credit
```

Future invoice:

```text
Invoice             ₹5,000
Credit applied      ₹2,000
Amount due          ₹3,000
```

The domain should therefore distinguish:

```text
Refund
Credit
Discount
Payment
```

They are not interchangeable.

---

# 19. Outstanding Balance

The system should derive outstanding amounts from financial records.

Conceptually:

```text
Outstanding
    =
    finalized invoice obligations
    - allocated payments
    - applicable credits
    + applicable charges
```

Do not let UI code manually maintain:

```text
customer.balance += 1000
customer.balance -= 500
```

Financial balances should be derived from authoritative records.

Cached balances may be introduced later for reporting performance, but they must have a deterministic source of truth.

---

# 20. Finance vs Accounting

The first version does not need to become a full double-entry accounting system.

However, it should already preserve transaction history strongly enough that financial reports can be reconstructed.

Initial finance responsibilities:

```text
Invoices
Payments
Refunds
Credits
Outstanding dues
Revenue reporting
Payment-method totals
Daily collections
```

Future accounting functionality can add:

```text
Accounts
Journal Entries
Debit
Credit
General Ledger
Accounts Receivable
Tax Ledgers
Bank Reconciliation
```

Do not prematurely build a full accounting system.

But do not build a system that destroys financial history either.

---

