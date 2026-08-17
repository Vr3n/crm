# 02 — Customers & Memberships

**Ties to:** Module 02.
**Depends on:** 00, 03 (plan/offer/policy lookups), 01 (person anchor, conversion).
**Feeds into:** 04 (sales/renewals create invoices), 05 (payments settle them), 09.

Customer is the stable person; each membership row is one purchased entitlement period
(Module 02 §why-two-tables). Membership status is a cache — ground truth is dates plus
freeze records (Module 02 §technical decision).

## Tables (`src/main/db/schema/membership.ts`)

### `customers`

```text
id integer PK, organization_id FK,
person_id FK people NOT NULL UNIQUE,       -- one customer per person (ADR-0009)
billing_name text, billing_phone text, billing_email text,   -- contact snapshot for
billing_address text,                       -- invoices (Module 02 §21, §4 of Module 04)
emergency_contact text NULL,
notes text,
created_at / updated_at
```

Contact info may change; financial documents keep their own snapshot (see `04-billing.md`).

### `memberships`

```text
id integer PK, organization_id FK,
customer_id FK NOT NULL,                   -- indexed; Customer 1 ── * Membership
plan_id FK membership_plans NOT NULL,      -- kept for reporting only
offer_id FK offers NULL,                   -- reference to offer redeemed at sale
-- commercial snapshot (Module 03 §33, Scenario 3):
plan_name_snapshot text NOT NULL,
duration_days_snapshot integer NOT NULL,
base_price_minor integer NOT NULL,
discount_minor integer NOT NULL,
final_price_minor integer NOT NULL,
tax_rate_bps integer NOT NULL,
-- entitlement:
start_date text NOT NULL, end_date text NOT NULL,
billing_frequency text NOT NULL,
status text NOT NULL DEFAULT 'PENDING',    -- cache; derive from dates+freezes
-- cancellation (Module 02 §30):
cancellation_requested_at text NULL, cancellation_effective_date text NULL,
cancellation_reason text NULL,
created_at, created_by FK users NOT NULL
```

### `membership_freezes`

```text
id integer PK, organization_id FK,
membership_id FK NOT NULL,
start_date text NOT NULL, end_date text NOT NULL,
reason text, fee_minor integer NOT NULL DEFAULT 0,
billing_behavior text NOT NULL,            -- SUSPEND_BILLING / CONTINUE_BILLING (from plan's freeze_policy)
access_behavior text NOT NULL,             -- NO_ACCESS / LIMITED_ACCESS
extension_days integer NOT NULL DEFAULT 0, -- end-date shift applied (FREEZE_EXTENDS_END_DATE)
credit_days integer NOT NULL DEFAULT 0,    -- credit applied instead (FREEZE_CREDITS_PERIOD)
created_at, created_by FK users NOT NULL
```

Freeze is a record with policy fields — never `is_frozen` (Module 02 §8, Scenario 6).

### `membership_events`

```text
id, organization_id, membership_id FK,
type text NOT NULL,                        -- CREATED / ACTIVATED / FROZEN / UNFROZEN / RENEWED /
                                           -- PLAN_CHANGED / CANCELLATION_REQUESTED / CANCELLED /
                                           -- EXPIRED / TERMINATED
data text NULL,                            -- JSON detail (e.g. freeze id, old→new plan)
occurred_at text NOT NULL, created_by FK users NOT NULL
```

History is a first-class record (Module 02 §32); never overwrite old memberships.

## State machine (Module 11 §72)

```text
PENDING ──activate──► ACTIVE ──freeze──► FROZEN ──unfreeze──► ACTIVE
                        │  │                                        │
                        │  └──expire/────────────────────────────► EXPIRED
                        └──cancel──► CANCELLED
ACTIVE ──terminate──► TERMINATED       (forced business termination)
```

Explicit transitions only. `EXPIRED` is derived from `end_date < today` (Module 02 §31)
and maintained as a status by a reconciliation job — never set by UI code directly.
Cancellation distinguishes requested / effective / completed (§30) via the three
cancellation columns and `CancelMembership`.

## Commands

```text
CreateMembership         membership.create   -- from a sale (called by ConvertLead / SellMembership)
ActivateMembership       membership.activate -- PENDING → ACTIVE (starts entitlement)
FreezeMembership         membership.freeze   -- validates ACTIVE + policy (Module 07)
UnfreezeMembership       membership.unfreeze -- FROZEN → ACTIVE; end-of-freeze handling
RenewMembership          membership.renew    -- new entitlement period + billing records (Module 07)
ChangeMembershipPlan     membership.change_plan -- prorates per plan's proration_policy (ADR-0008)
RequestCancellation      membership.request_cancellation -- records requested_at + effective date per policy
CancelMembership         membership.cancel   -- applies cancellation policy, finalizes outstanding charges
TerminateMembership      membership.cancel   -- forced termination (permission-restricted)
ReconcileMembershipStatus (internal)         -- scheduled: expire overdue memberships, clear stale freezes
```

## Pricing / freeze / renewal services (Module 06 §40)

- `MembershipPricingService` — produces the `PricingSnapshot` (plan + offer → final
  price) shared with Catalog; used by sale, renewal, plan change.
- `MembershipFreezeService` — applies the plan's `freeze_policy`: fee, billing behavior,
  access behavior, and either extends `end_date` by `extension_days` or issues `credit_days`.
- `MembershipRenewalService` — extends or creates the next entitlement period, creating
  the renewal invoice (Module 07).

## Queries

```text
GetCustomerProfile        membership.view / customer.view
GetCustomerMemberships    membership.view    -- all periods, oldest→newest (Module 02 §worked example)
GetMembershipDetail       membership.view    -- + freezes + events + linked invoice(s)
GetActiveMemberships      membership.view
GetExpiringMemberships    membership.view    -- within N days
GetFrozenMemberships      membership.view
GetCancelledMemberships   membership.view
SearchPeople              (Module 09)
```

## Freeze math (worked example, Module 02 §worked example)

Annual plan 2025-07-01 → 2026-06-30; freeze 2025-12-01 → 2025-12-15, policy
`FREEZE_EXTENDS_END_DATE`, no fee.

- Create `membership_freezes` row (start/end/reason/fee=0/billing=SUSPEND_BILLING/
  access=NO_ACCESS/extension_days=15).
- `memberships.end_date` → 2026-07-15.
- Status ACTIVE → FROZEN at start, → ACTIVE at unfreeze (auto or explicit action).
- Audit + `membership_events` row written.

## Tests

- Customer ≠ active member: expired membership → customer still exists (Scenario context).
- Status-as-cache: an ACTIVE membership with `end_date` in the past reconciles to EXPIRED
  only via the reconciliation job; derived "can access today" is correct with open freezes.
- Freeze math: extension days applied; fee charged when policy says so; `credit_days`
  when `FREEZE_CREDITS_PERIOD`.
- Freeze on a FROZEN or EXPIRED membership rejected (`MEMBERSHIP_CANNOT_BE_FROZEN`).
- Renewal creates a new period, never mutates the old one; price snapshot preserved
  (Scenario 3).
- Plan change proration: per-plan `proration_policy` respected (ADR-0008).
- Cancellation effective-date rule per `cancellation_policy` (immediate vs end-of-period
  vs notice days).
- TERMINATED is terminal.