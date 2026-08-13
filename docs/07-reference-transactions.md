# Module 07 — Reference Transactions (Copy-Paste-Ready Worked Examples)

**Purpose:** these three transactions are the ones developers will implement first, and getting their atomicity right is what Scenario 9 in the Acceptance Criteria (Module 12) is testing for. Treat each one below as a checklist of "everything that must succeed together, or none of it happens."

## Why these three transactions get special treatment

Almost every bug report in gym-management software traces back to one of these three moments: a sale that half-completed, a payment that updated the invoice but not the allocation, or a freeze that changed the end date but not the status. Because SQLite gives you real transactions (`BEGIN ... COMMIT`/`ROLLBACK`), there's no excuse for these to ever leave the database in an inconsistent state — but only if the application layer wraps the *entire* multi-table operation in one transaction, not one transaction per table write.

# 46. Example: Membership Sale Transaction

When a customer purchases a membership:

```text
BEGIN TRANSACTION

1. Validate customer
2. Validate plan
3. Validate offer
4. Calculate price
5. Create membership
6. Snapshot commercial terms
7. Create invoice
8. Create invoice lines
9. Record payment if payment is made immediately
10. Allocate payment
11. Record audit event

COMMIT
```

If any step fails:

```text
ROLLBACK
```

The UI should never manually perform these steps independently.

---

# 47. Example: Payment Transaction

```text
RecordPayment

BEGIN

validate amount > 0

create payment

allocate payment to invoice

recalculate invoice payment state

create audit record

COMMIT
```

The invoice status should be derived according to domain rules:

```text
allocated = 0
    → OPEN

0 < allocated < total
    → PARTIALLY_PAID

allocated >= outstanding obligation
    → PAID
```

Exact handling of overpayments should be explicitly defined before implementation.

---

# 48. Example: Freeze Transaction

```text
FreezeMembership

BEGIN

validate membership is currently active

validate freeze policy

create membership freeze

apply billing rule

apply access rule

apply extension/credit rule

record membership event

create audit record

COMMIT
```

The implementation must not merely execute:

```text
membership.status = "FROZEN"
```

because the financial and entitlement consequences depend on the gym's policy.

---

