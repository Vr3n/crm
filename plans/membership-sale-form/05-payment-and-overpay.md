# 05 — Payment & Overpay Handling

## 5.1 — Scope note

Per `Q18` "The one in Module 05 that says expect partial payments" and `Q23` "happy path should be followed, don't violate Module 05", this form fully models `Invoice → Payment → PaymentAllocation` even though the user called this plan "UI/UX only". The UI contract mirrors the backend expectation: paid may be less than final, equal, or greater.

---

## 5.2 — Payment Method (required)

### Why

`Q25`: "the `payment_method` field is also mandatory, so add it in the UI as dropdown". Required by `docs/05-payments-and-finance.md:98-110` and `src/main/db/schema/finance.ts` (not yet read but implied `payments.method`). Method is a real field on the `Payment` aggregate — not a summary nicety.

### Control

- **Select** `paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'` (`form.Field` + Radix `Select.Root` with `if(v!=='')` guard).
- Options seeded from `settings.paymentsMethods` if that table exists; fallback to the enum list from `docs/05:98` (6 methods). `UPI` second in list (India-appropriate default order: CASH, UPI, CARD…).
- Placeholder "Choose payment method" — submit gated until chosen. Live error `"Choose a payment method"` on `touched||submitted`.

---

## 5.3 — Paid Amount (required, may be partial)

### Control

Same currency input as §03 (`type="text" inputmode="decimal"`, blur formatting, 2-decimal cap, `,` grouping, `aria-label="Amount paid in Indian rupees"`).

### Constraints

- `paidRequired`: empty → `"Paid amount required"`.
- `paid >= 0`.
- **No `paid >= final` mandate**. `paid < final` is normal and yields `Amount Due = final - paid` (amber). `paid == final` yields `Paid in full ✓` (green). `paid > final` triggers overpay dialog (§5.4) and yields `Change/Credit`.
- Precision 2 decimals, same masking rules as §03.
- `Paid Amount` helper `labelEnd` shows `of ₹4,000 final` so the clerk always sees the denominator.

### Amount Due / Change derivation

Pure derived, displayed both in the section footer and the sticky Order Summary:

```
finalPaise = basePaise - discountPaise           // §03
paidPaise  = parseRupees(paidRupees)
if (paidPaise < finalPaise)  amountDue = finalPaise - paidPaise, changeDue = 0
if (paidPaise == finalPaise) amountDue = 0, change = 0, badge "Paid in full"
if (paidPaise > finalPaise)  amountDue = 0, changeDue = paidPaise - finalPaise
```

Rendered per `docs/05:27-36` — the original Payment is never edited; `amountDue` is the query `SUM(invoice total) - SUM(allocation)` but for this single-invoice form it's just the arithmetic above. The invoice status preview mirrors `docs/04:80-107`: `DRAFT→OPEN` on submit, then `PAID` if `paid==final`, `PARTIALLY_PAID` otherwise.

---

## 5.4 — Overpay dialog — Credit vs Change (`Q25`)

### Why

`Q25`: "If client over pays, there should be a dialogue which lets us select if we want to keep as credits or return as change. This will be done in same form, and also in the form where the payment is collected." `docs/05:17-18` (Refund vs Credit) and `docs/05:44` (Outstanding derived) motivate keeping these explicit: a kept overpayment is a **Credit** record (applicable against a future invoice), a returned overpayment is just **change** (no record).

### Trigger

On blur of `paidAmount` when `paidPaise > finalPaise` and `overpayDisposition` not yet set, open shadcn `Dialog`:

```
Title: Overpayment of ₹600
Body:  Client paid ₹4,600 for a ₹4,000 membership.
       Keep the excess as account credit for next renewal,
       or return it as change now?
[ Keep as credit ]   [ Return as change ]
Helper: Credit can be applied to next invoice · Change is handed back now
```

- Choice stored as `overpayDisposition: 'CREDIT' | 'CHANGE'` in form values, reflected in summary (`Credit ₹600` sky vs `Change due ₹600` emerald).
- Choice is required to unblock submit when overpaid — dialog is **non-dismissible** except via one of the two CTAs (Esc maps to `CHANGE` to be safe).
- Changing `paid` later to `<= final` auto-clears `overpayDisposition` and closes the implied state (no modal re-prompt unless threshold recrossed).

### Post-submit mapping (for future backend slice — documented so frontend contract is ready)

- `CHANGE`: no extra row; payment allocation covers only `finalPaise` (excess is change handed back, not recorded).
- `CREDIT`: allocate `finalPaise` to the invoice and record a `Credit` row of `paidPaise - finalPaise` (`credits` table) inside the same tx.

---

## 5.5 — Free-trial guard (Q21, §03 reuse)

When `finalPaise === 0`, the pricing section (§03) already intercepts submit with a Trial Guard dialog:

```
Title: Free trial — confirm trial membership
Body:  Final price is ₹0. Treat this membership as a trial?
       How many trial days? [ 7 ▾ ]  (7/14/21/30/custom)
[Confirm trial] [Cancel — adjust price]
```

Confirm sets `isTrial=true` and `endDate = startDate + trialDays` (overrides plan duration for this sale). Detail page later shows `Trial` badge.

---

## 5.6 — Tax & registration fee (optional rows, `Q22`)

Collapsed `Add charges` accordion under pricing:

- Row 1: `Tax` — either a rate chip `18%` with `₹720` amount, or an amount override (editing amount implies custom rate). Snapshot: `invoiceLines.tax_rate_bps / tax_amount_minor` (`billing.ts:74-77`).
- Row 2: `Registration Fee` — one-time `₹500` (from `membershipPlans.registration_fee_minor` · `catalog.ts:39`). Checkbox "Add registration fee (first purchase)" auto-checked if this Customer has zero prior memberships (lookup via `customers`/`memberships` count).
- Both optional; omitted rows omitted from totals. Summary hides them when zero.

---

## 5.7 — Payment history hint (loyalty)

Under the Paid row, when the Lead's Person already maps to a Customer with prior memberships, show muted caption `Previous dues: 0 pending invoices` or `₹4,200 due across 2 invoices (view)` — sourced from a lightweight `customers:outstandingSummary` read so the clerk knows the collection context before accepting partials.

---

## 5.8 — Reactivity in the Order Summary

The sticky card (§01) scrubs live:

```
Paid ₹4,600 — Change due ₹600  [Credit | Change toggle badge]
```

Tapping the Credit/Change badge reopens the overpay dialog — alternative to editing Paid.

### References

- `plans/membership-form-querstions-solutions.md:18-19, 21-22, 25, 35-37`.
- `docs/05-payments-and-finance.md:98-149` (payment methods, allocation, refund vs credit, outstanding derived).
- `docs/04-billing-and-invoicing.md:13-31` (worked example tax/registration), `billing.ts:33-54`.
- `src/main/db/schema/catalog.ts:35-39` (tax/registration), `membership.ts:68-72`.
- Credit vs change interaction patterned on `voucherify.io`, `ecomdesignpro.com` coupon UX (explicit "only one" rule, specific error reasons — mirrored here as explicit overpay disposition).
