# 07 — Reference Transactions (Copy-Paste-Ready Worked Examples)

**Ties to:** Module 07, acceptance Scenarios 2, 4, 5, 6, 9.
**Depends on:** 00–05.
**Feeds into:** 02/04/05 implementation details; these are the first workflows tested
end-to-end.

These three transactions are implemented first and tested for atomicity — Scenario 9
("crash halfway through a sale") is the test. Each step list below is "everything that
must succeed together, or none of it happens." All of it runs inside one `withTransaction`
(begin immediate / savepoints); every repository write uses the same injected Drizzle
instance so nothing commits early.

## 46. Membership Sale / Lead Conversion

`ConvertLead` (from a WON lead) and `SellMembership` (from a customer) share this core.
This is the transactional vertical slice that proves the architecture (guidelines §28
Phase 4).

```text
withTransaction:
  1. Validate customer or lead (lead must be WON-eligible; customer must exist)
  2. Validate plan (active) and offer (valid, unexpired, within max_usage)
  3. Calculate price via MembershipPricingService → PricingSnapshot (03)
  4. Create membership (snapshot commercial terms, status PENDING)      [02]
  5. Create invoice (DRAFT) + invoice lines from the snapshot           [04]
  6. Record offer redemption row                                        [03]
  7. If payment made immediately: RecordPayment + AllocatePayment       [05]
  8. Finalize invoice → assign number (counter incremented in-tx)       [04]
  9. Activate membership (PENDING → ACTIVE)                              [02]
  10. Mark lead WON + write conversion record (lead.customer_id)         [01]
  11. Write membership_events + audit_log rows                           [06]
```

If any step fails → ROLLBACK. The UI never performs these steps independently
(Module 07 §46).

**Scenario 9 test:** force a failure after step 5 (e.g. inject a plan-validation error
at finalize) and assert the database contains no customer/membership/invoice rows — or
the complete set, never a subset.

## 47. Payment Transaction

```text
withTransaction:
  1. Validate amount > 0; validate customer
  2. Create payment                                                   [05]
  3. Allocate to invoice(s); assert allocation ≤ payment and ≤ outstanding [05]
  4. Re-derive invoice state from allocation math (OPEN/PARTIALLY_PAID/PAID) [05]
  5. If unallocated remainder: surface to caller (→ another invoice or a Credit)
  6. Write audit_log row                                               [06]
```

Invoice state derivation (Module 07 §47):

```text
allocated = 0                    → OPEN
0 < allocated < outstanding       → PARTIALLY_PAID
allocated ≥ outstanding           → PAID
```

Overpayment rule is the single policy function from 05-finance.md.

**Scenario 4 test:** partial payment leaves PARTIALLY_PAID with correct Paid/Due display.

## 48. Freeze Transaction

```text
withTransaction:
  1. Validate membership is ACTIVE (or FROZEN-free)                    [02]
  2. Validate freeze policy from plan's freeze_policy (dates, fee, allowance) [03]
  3. Create membership_freezes row (start/end/reason/fee/billing/access/extension) [02]
  4. Apply billing rule (SUSPEND_BILLING or CONTINUE_BILLING — no billing engine in v1,
     behavior recorded for future + audit)
  5. Apply access rule (NO_ACCESS / LIMITED_ACCESS — recorded; gatekeeper is future)
  6. Apply extension/credit rule: extend membership.end_date by extension_days,
     OR issue credit_days via IssueCredit
  7. Set membership status FROZEN (cache)
  8. Write membership_events + audit_log rows                           [06]
```

Never `membership.status = 'FROZEN'` alone (Module 07 §48, Scenario 6).

**Scenario 6 test:** freeze records who/when/start/end/reason/billing consequence/access
consequence/extension, and the end-date shift is persisted.

## Test strategy for these three

- **Application tests:** use cases with real repositories against a fresh `:memory:`
  Drizzle DB. Focus: transaction boundaries, workflows, side effects, error handling.
- **Mid-failure tests:** deliberately throw at each step boundary and assert full
  rollback (nothing partially committed) — this is Scenario 9 for sale, payment, and
  freeze.
- **Integration tests:** IPC → application → repository → SQLite for the three critical
  flows.
- **Domain tests:** pure rules (state transitions, allocation math, freeze math) with no
  database.
