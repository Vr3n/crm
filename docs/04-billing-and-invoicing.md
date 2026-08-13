# Module 04 — Billing & Invoicing

**Bounded context:** `Billing`
**Depends on:** Module 02 (a Membership sale/renewal triggers invoice creation) and Module 03 (invoice lines snapshot catalog pricing).
**Feeds into:** Module 05 (an Invoice waits for Payments to be allocated against it).

## Why "Membership" and "Billing" are separate modules even though they always seem to happen together

Ask: *can a membership be active while its invoice is unpaid?* Yes — a gym owner may activate a trusted member's plan and let them pay in two installments. Ask the reverse: *can an invoice exist for something that isn't a membership?* Yes — registration fees, a merchandise sale, a personal-training package. If Membership and Billing were one module, every membership-only feature (freeze, renewal) would drag invoice code along, and every non-membership sale (day-pass, protein shake) would have nowhere clean to attach an invoice. Keeping them separate means Billing is reusable for *anything the gym sells*, not just memberships.

## Worked example: one plan, one invoice, tax and rounding made concrete

```text
Plan: Annual Premium, final price after offer = ₹19,200 (from Module 03's example)
Registration fee: ₹500 (one-time, first purchase only)
Tax: 18% GST (India example — adjust per locale)

Invoice INV-2026-000147
  Line 1: "Annual Premium Membership (Jan 15 2026 – Jan 14 2027)"
      quantity = 1, unit_price = ₹19,200, discount = ₹0 (already netted into unit_price)
      tax_rate = 18%, tax_amount = ₹3,456
      line_total = ₹22,656
  Line 2: "Registration Fee"
      quantity = 1, unit_price = ₹500, tax_rate = 18%, tax_amount = ₹90
      line_total = ₹590

  Invoice subtotal = ₹19,700
  Invoice tax       = ₹3,546
  Invoice total     = ₹23,246
  Status: OPEN (finalized, awaiting payment)
```

Six months later the GST rate changes to 20%. **INV-2026-000147 must still read 18% / ₹3,546 forever.** This is why `tax_rate` and `tax_amount` are stored per line at finalization time, never computed live from "whatever today's tax config says" when the invoice is redisplayed.

## Technical decision, explained intuitively

**Why does an invoice need a `DRAFT` state before `OPEN`, instead of creating it already finalized?**
A draft lets the front-desk staff build up the invoice (add the membership line, add the registration fee, maybe add a locker fee) and see a live total before committing. Once they hit "finalize," the invoice becomes `OPEN` and its financial content is frozen — no more silent edits. This mirrors how real invoicing/accounting software works, and it gives you a clean place to validate ("does this invoice have at least one line? is the customer set?") before the numbers become immutable.

**Why is money never stored as a floating-point number?**
`0.1 + 0.2` famously doesn't equal `0.3` in floating point. Do that a few hundred times across invoice lines and tax rounding, and your reported revenue will not match the sum of your invoices — a serious, embarrassing bug for a finance feature. Store money as **integer paise/cents** (e.g. ₹19,200.00 stored as `1920000` paise) or use a fixed-point decimal library, and only format to rupees/decimal at the UI layer. This single decision prevents an entire category of "why doesn't this add up" bugs later.

**Why does the invoice number need its own generation rule instead of just using the database's auto-increment primary key?**
Two reasons. First, gyms often want a human-meaningful, sequential, gap-free invoice number for statutory/tax purposes (`INV-2026-000147`), which is a business requirement, not a database implementation detail — the primary key is free to be a UUID for internal use. Second, if you ever import/merge data or the primary key sequence resets, you don't want your invoice numbering (which may have legal significance) to shift. Generate invoice numbers via an explicit, auditable counter (e.g. a `invoice_sequence` table incremented inside the same transaction as invoice creation), independent from the internal row id.

---

# 12. Billing Domain

Billing should be separated from Membership.

Membership determines what the customer is entitled to.

Billing determines what the customer owes.

These are related but not the same thing.

Example:

```text
Membership:
    Annual Premium
    Active until 2027-08-01

Billing:
    Invoice #INV-1023
    ₹20,000
    Paid
```

A membership can exist while its invoice is unpaid.

---

# 13. Invoice

An Invoice represents an amount owed for goods/services.

Recommended lifecycle:

```text
DRAFT
OPEN
PARTIALLY_PAID
PAID
VOID
UNCOLLECTIBLE
```

The exact accounting vocabulary can be adapted to the business.

A common billing model separates a finalized/open invoice from its payment state; finalized invoices should not casually be edited, and cancellation is represented separately from successful payment.

For this application:

```text
DRAFT
    ↓ finalize
OPEN
    ├── payment ──► PARTIALLY_PAID
    │                    │
    │                    └── payment ──► PAID
    │
    ├── void ──► VOID
    │
    └── mark uncollectible ──► UNCOLLECTIBLE
```

Once finalized, financial meaning should be immutable.

Corrections should happen through explicit operations.

---

# 14. Invoice Line

An Invoice Line is a historical snapshot.

Example:

```text
Invoice:
    INV-1004

Line:
    Annual Premium Membership
    Quantity = 1
    Unit Price = ₹20,000
    Discount = ₹2,000
    Tax = ₹3,240
    Total = ₹21,240
```

The line should preserve the information required to explain the amount.

Do not rely only on:

```text
invoice_line.plan_id
```

because the plan may later be renamed or repriced.

Recommended snapshot fields:

```text
description
quantity
unit_price
discount_amount
tax_rate
tax_amount
line_total
```

References to catalog entities may still be retained for reporting.

---



---

## Pricing Snapshot Principle, Money Representation, Tax & Invoice Numbering

*(Original spec sections 33-36 - the rules that make the worked example above hold true in the database.)*

# 33. Pricing Snapshot Principle

Whenever a commercial transaction occurs, snapshot the relevant commercial values.

For example:

```text
membership.price_at_purchase
membership.plan_name_snapshot
membership.duration_snapshot

invoice_line.description
invoice_line.unit_price
invoice_line.discount_amount
invoice_line.tax_rate
```

The current catalog is not the historical ledger.

This is one of the most important invariants in the system.

---

# 34. Money Representation

Never store money as JavaScript floating-point values.

Do not use:

```text
19.99
```

as a financial calculation primitive.

Use integer minor units.

For INR:

```text
₹199.50
```

can be represented as:

```text
19950 paise
```

Recommended conceptual type:

```text
Money
    amount_minor
    currency
```

Example:

```text
Money {
    amount_minor: 19950,
    currency: "INR"
}
```

Arithmetic should happen using integer values.

---

# 35. Tax

Tax should be configurable rather than hard-coded into plans.

An invoice line can snapshot:

```text
tax_code
tax_rate
tax_amount
```

The exact tax policy is a business/configuration concern.

For India-specific deployments, the system should eventually support appropriate GST invoice information, but tax rules should not be scattered through React components or individual SQL statements.

---

# 36. Invoice Numbering

Invoice identifiers should be generated by the domain/application layer.

Example:

```text
INV-000001
INV-000002
INV-000003
```

The invoice number must be unique.

If the business requires year-based numbering:

```text
INV/2026-27/000001
```

the numbering policy should be configurable.

Do not use SQLite's internal row ID as the printed invoice number.

---

