# Module 02 — Customer Identity & Membership Lifecycle

**Bounded context:** `Customer`
**Depends on:** Module 01 (a Customer is born out of a converted Lead) and Module 03 (a Membership references a Plan).
**Feeds into:** Module 04/05 (every Membership sale/renewal/freeze creates Invoices and expects Payments).

## Why Customer and Membership are two different tables, not one

This is the single most common modeling mistake in gym software: storing "member" as one row with `plan`, `start_date`, `end_date`, `status` columns directly on the person. That works until the person renews, upgrades, freezes, or has ever had a second membership (couple plan → renews solo, or buys a PT package alongside their gym plan). Then you're retrofitting history onto a row that was designed to represent "now."

Model it as `Customer 1 ── * Membership`. The customer is the stable person. Each **Membership row is one purchased entitlement period** — a new row is created on renewal, not an overwrite of the old one.

## Worked example: one customer, three memberships over two years

```text
Customer: Priya Verma (customer_id = 42)

Membership #1
  plan = Monthly Basic, start = 2025-01-01, end = 2025-01-31
  status = EXPIRED (she didn't renew immediately)

Membership #2
  plan = Quarterly Premium, start = 2025-03-15, end = 2025-06-14
  status = EXPIRED

Membership #3
  plan = Annual Unlimited, start = 2025-07-01, end = 2026-06-30
  status = ACTIVE, currently has 1 freeze record (Dec 2025, 15 days, medical)
```

Priya's "customer view" in the UI shows **all three**, because a manager asking "has Priya been a loyal member?" needs the full picture, not just the current row. Deleting or overwriting membership #1 and #2 when #3 was created would erase that answer.

## Worked example: freeze math, made concrete

Freeze is the part of this module most teams get wrong because they think of it as `is_frozen = true`. Walk through one real case:

```text
Membership: Annual Unlimited
  start = 2025-07-01, end = 2026-06-30 (365 days)

Priya requests a freeze: 2025-12-01 → 2025-12-15 (15 days), reason = "travel"

Gym policy for this plan: FREEZE_EXTENDS_END_DATE, no freeze fee for first freeze/year

MembershipFreeze record created:
  start_date = 2025-12-01
  end_date   = 2025-12-15
  reason     = "travel"
  fee        = 0
  billing_behavior = SUSPEND_BILLING   (no charge accrues during freeze, irrelevant here since already paid in full)
  access_behavior  = NO_ACCESS         (gym access disabled Dec 1–15)
  extension_days   = 15
  created_by = staff_id 7

Effect on Membership:
  end_date shifts from 2026-06-30 → 2026-07-15 (+15 days)
  status changes: ACTIVE → FROZEN (Dec 1) → ACTIVE again (Dec 15, automatically or on unfreeze action)
```

Every one of those five freeze-record fields is *policy*, and every gym you onboard may set them differently for the same "15 day freeze" request. That's why freeze must be its own table (see original doc §8) rather than a boolean — the boolean can't hold "why the end date moved."

## Technical decision, explained intuitively

**Why does a `Membership` need its own `price`, `discount`, and `plan_name_snapshot` fields instead of just a foreign key to `Plan`?**
Same reasoning as invoice lines (Module 04): plan prices change over time. If Membership only stores `plan_id`, then re-displaying an old membership after a price change silently rewrites history — the UI would show today's price for a membership sold a year ago. Copy the commercially relevant fields onto the Membership row at creation time. The `plan_id` reference is still kept, purely so reporting can answer "how many people are on the Monthly Basic plan," but nothing financial should ever be *recomputed* from it.

**Why is `status` alone not the source of truth for "is this membership active right now"?**
Because `status='ACTIVE'` could be stale if a nightly job hasn't yet flipped an expired membership to `EXPIRED`, or a freeze wasn't correctly reverted. Application logic that needs to know "can this person access the gym today" should derive it from `status + start_date + end_date + open freeze records`, not trust the cached status column blindly. The status column is a helpful index/cache for fast queries (e.g. "list all ACTIVE memberships"), refreshed by a scheduled reconciliation job — but the dates and freeze records are the ground truth.

---

# 4. Customer / Member

## Customer

A person who has entered a commercial relationship with the gym.

A Customer can exist without an active membership.

For example:

```text
Customer
    └── Membership expired

Customer still exists.
```

Therefore:

```text
Customer ≠ Active Member
```

The UI may call a customer an "active member" when they currently have an active membership.

---

# 5. Membership Plan

A Membership Plan is a reusable commercial product definition.

Examples:

```text
Monthly Basic
Monthly Premium
Quarterly Premium
Annual Unlimited
Student Monthly
Couple Annual
```

A plan contains rules such as:

```text
Name
Description
Duration
Price
Billing frequency
Access rules
Maximum duration
Registration fee
Renewal behavior
Freeze policy
Cancellation policy
Tax configuration
Active/inactive
```

A plan is not a customer's membership.

Changing a plan must not alter existing memberships.

For example:

```text
Plan:
    Premium Monthly
    Price = ₹2,000
```

A customer purchases it.

Six months later:

```text
Plan:
    Premium Monthly
    Price = ₹2,500
```

The customer's historical purchase must remain associated with its original commercial terms.

---

# 6. Membership

A Membership is the customer's actual purchased entitlement.

Conceptually:

```text
Customer
    │
    └── Membership
          ├── Plan
          ├── Start Date
          ├── End Date
          ├── Billing Terms
          ├── Price
          ├── Discounts
          ├── Freeze History
          └── Status
```

Recommended statuses:

```text
PENDING
ACTIVE
FROZEN
EXPIRED
CANCELLED
TERMINATED
```

Avoid treating status as the complete source of truth.

Dates and events are equally important.

For example:

```text
status = ACTIVE
start_date = 2026-08-01
end_date   = 2026-08-31
```

should explain why the membership is active.

---

# 7. Membership Lifecycle

Typical lifecycle:

```text
                ┌───────────┐
                │  PENDING  │
                └─────┬─────┘
                      │ activate
                      ▼
                ┌───────────┐
         ┌──────│   ACTIVE  │──────┐
         │      └─────┬─────┘      │
       freeze         │            │
         │            │ cancel     │ expire
         ▼            ▼            ▼
   ┌──────────┐ ┌───────────┐ ┌──────────┐
   │  FROZEN  │ │ CANCELLED │ │ EXPIRED │
   └────┬─────┘ └───────────┘ └──────────┘
        │
      unfreeze
        │
        ▼
     ACTIVE
```

`TERMINATED` should represent a forced business termination, for example for serious policy violations or unresolved account conditions.

---

# 8. Membership Freeze

Freeze is a business operation, not merely a status change.

A freeze may affect:

```text
Gym access
Billing
Membership expiration
Credits
Renewal date
Freeze fee
```

Different gyms can have different policies. Current gym-management systems demonstrate that all of these combinations exist: some freeze access but continue billing, some pause payments, some extend the membership, and some issue proportional credit.

Therefore the domain should represent a Freeze explicitly.

```text
MembershipFreeze

id
membership_id
start_date
end_date
reason
fee
billing_behavior
access_behavior
extension_days
created_at
created_by
```

Do not encode freeze behavior directly inside a boolean such as:

```text
membership.is_frozen
```

That loses history.

---



---

## Customer Identity (record shape)

*(Original spec section 21 — placed here since it defines the Customer entity itself.)*

# 21. Customer Identity

A customer record should be relatively stable.

Recommended information:

```text
customer_id
full_name
phone
email
date_of_birth
gender             [only if required]
address
emergency_contact  [if required]
notes
created_at
updated_at
```

Contact information may change.

Historical financial documents should not depend on the current customer record for their historical description.

For example, an invoice should retain the customer's billing information applicable at invoice creation/finalization.

---



---

## Renewal, Upgrade/Downgrade, Cancellation, Expiration & Membership History

*(Original spec sections 28-32 - the rest of the Membership lifecycle beyond the initial sale and freeze.)*

# 28. Membership Renewal

Renewal should create a new commercial event.

Do not simply change:

```text
membership.end_date += 30 days
```

without recording why.

A renewal may:

```text
use same plan
use a new plan
use a new offer
change price
change duration
change billing frequency
```

Therefore renewal should produce an explicit operation such as:

```text
RenewMembership
```

which creates the relevant billing records and adjusts the membership entitlement according to the selected business rule.

---

# 29. Membership Upgrade / Downgrade

Plan changes are not simply edits to `membership.plan_id`.

Example:

```text
Basic Monthly
      ↓
Premium Monthly
```

There may be:

```text
unused days
proration
new price
credit
additional fee
new billing date
```

Therefore:

```text
ChangeMembershipPlan
```

should be a domain operation.

The exact proration policy should be configurable.

---

# 30. Cancellation

Cancellation should distinguish:

```text
Cancellation requested
Cancellation effective
Cancellation completed
```

Some gyms require notice before the next billing date; others terminate immediately or at the end of the current period. Current gym policies demonstrate that cancellation rules vary materially.

Therefore do not encode a universal rule such as:

```text
cancel = immediate
```

Instead represent:

```text
cancellation_requested_at
cancellation_effective_date
cancellation_reason
```

Business policy determines the effective date.

---

# 31. Expiration

Expiration should normally be derived from membership entitlement dates.

Example:

```text
end_date < today
```

means the membership period has ended.

However, the system may maintain an explicit `EXPIRED` state for operational/reporting purposes.

Do not use expiration as a deletion mechanism.

Expired memberships are historical business data.

---

# 32. Membership History

A customer may have:

```text
Membership 001
    Monthly Basic
    Jan 2026 → Feb 2026

Membership 002
    Annual Premium
    Mar 2026 → Mar 2027

Membership 003
    Monthly Premium
    Apr 2027 → ...
```

Do not overwrite old memberships.

Historical memberships are valuable for:

```text
Retention analysis
Lifetime value
Renewal rate
Upgrade analysis
Customer history
Revenue analysis
```

---

