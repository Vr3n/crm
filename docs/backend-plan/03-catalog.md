# 03 — Catalog: Plans, Offers & Policy Lookups

**Ties to:** Module 03.
**Depends on:** 00 (foundation).
**Feeds into:** 02 (memberships reference plans/offers), 04 (invoice lines snapshot
catalog pricing).

Reference/lookup data — pure CRUD for configuration screens, no state machines. Built
second so later modules have something to point at and pricing math can be demoed in
isolation.

## Tables (`src/main/db/schema/catalog.ts`)

### `membership_plans`

```text
id            integer PK
organization_id  integer NOT NULL FK organizations  (indexed, every query filters by it)
name          text NOT NULL
description   text
duration_days integer                     -- e.g. 30 / 90 / 365
billing_frequency text NOT NULL           -- ONE_TIME / MONTHLY / QUARTERLY / ANNUAL
base_price_minor integer NOT NULL         -- integer paise, never float
registration_fee_minor integer NOT NULL DEFAULT 0
tax_code      text                        -- e.g. GST18; snapshot source for invoice lines
tax_rate_bps  integer NOT NULL DEFAULT 0  -- basis points (1800 = 18.00%) to avoid float
freeze_policy_id       integer FK freeze_policies
proration_policy_id    integer FK proration_policies
cancellation_policy_id integer FK cancellation_policies
active        integer NOT NULL DEFAULT 1  -- deactivate, never hard delete
created_at / updated_at
```

- Price lives in minor units. `tax_rate_bps` (basis points, integer) lets the invoice
  line snapshot an exact rate without floats (guidelines §10).
- Plans are **not** inventory: no quantity/stock columns (Module 03 §11). Future physical
  products get their own `inventory_items` table.

### `membership_plan_versions`

```text
id, plan_id FK, organization_id FK,
base_price_minor, tax_rate_bps, effective_from, created_at
```

One row per price/terms change. Reporting answers "what did this plan cost in January"
from versions; memberships/invoices snapshot their own values and never recompute from
the plan.

### `offers`

```text
id, organization_id FK
name, description
discount_type text NOT NULL              -- FIXED_AMOUNT / PERCENTAGE / OVERRIDE_PRICE / FREE_PERIOD
value_minor integer NOT NULL             -- fixed ₹ amount, or % in basis points, or override price, or free-period days
                                          -- (one value column + enum, per Module 03's decision)
applicable_plan_ids JSON or join table   -- eligibility: which plans the offer applies to
eligibility text                         -- reserved: future rules (new members only, etc.)
valid_from / valid_to
max_usage integer NULL
min_purchase_minor integer NULL
active integer NOT NULL DEFAULT 1
created_at / updated_at
```

- `discount_type` + a single `value_minor` (meaning depends on type) implements all four
  math cases with one pricing function (Module 03 §9).
- Deactivate, never hard-delete; deactivated offers stop being offered but historical
  redemptions stay intact.

### `offer_redemptions`

```text
id, organization_id, offer_id FK, membership_id FK NULL, invoice_id FK NULL,
applied_discount_minor, redeemed_at, created_by
```

The actual application of an offer is recorded here (Module 03 §9). Never recompute a
historical sale from the current offer definition.

### Policy lookups (ADR-0008, REVIEW.md)

```text
freeze_policies        -- id, organization_id, name, billing_behavior, access_behavior,
                        --   extend_or_credit (EXTEND_END_DATE / CREDIT_PERIOD / NONE),
                        --   fee_minor, free_freeze_count_per_year, description
proration_policies     -- id, organization_id, name, rule
                        --   (UPGRADE_CREDIT_UNUSED / DOWNGRADE_CHARGE_REMAINDER /
                        --    NO_PARTIAL_CREDIT / CUSTOM), description
cancellation_policies  -- id, organization_id, name, effective_rule
                        --   (IMMEDIATE / END_OF_PERIOD / NOTICE_DAYS), notice_days, description
```

Seeded with sensible defaults per organization on setup; editable via settings screens.
Membership operations read these by `*_policy_id` on the plan (Module 02 §8, Module 12).

## Commands (CRUD for configuration screens — this is the one place generic CRUD is right)

```text
CreateMembershipPlan       plan.create
UpdateMembershipPlan       plan.update       -- edits live terms; creates a plan version row
DeactivateMembershipPlan   plan.deactivate   -- active = 0; existing memberships unaffected (Scenario 7)
CreateOffer                offer.create
UpdateOffer                offer.update
DeactivateOffer            offer.deactivate
CreateFreezePolicy / UpdateFreezePolicy / CreateProrationPolicy /
UpdateProrationPolicy / CreateCancellationPolicy / UpdateCancellationPolicy
```

## Queries

```text
ListPlans (active first), GetPlanVersions(planId),
ListOffers (active first), GetOffer(offerId),
ListPolicyLookups
```

## Domain

- `Money` value object for prices; `PricingSnapshot` value object
  (`base_price_minor`, `discount_minor`, `final_price_minor`, `tax_rate_bps`,
  `plan_name`, `duration_days`) produced by a `MembershipPricingService`
  (Module 06 §40) and consumed by the sale/renewal flows (Module 07).
- Pricing math: `FIXED_AMOUNT` subtracts; `PERCENTAGE` subtracts pct of base;
  `OVERRIDE_PRICE` sets final; `FREE_PERIOD` sets discount = prorated period value.
  Rounding: to nearest minor unit, half-up, applied once per line (define once in the
  pricing service and unit-test it — Module 04's rounding rule).

## Tests

- Pricing service: all four discount types; rounding; zero/negative price rejected.
- Snapshot principle: create plan at ₹24,000, change to ₹26,000 → old membership /
  invoice snapshot unchanged (acceptance Scenario 3 & 8, ready for the integration test).
- Plan version history: price change creates a version, never rewrites the previous one.
- Deactivate plan → new sales rejected, existing memberships unaffected (Scenario 7).
- Offer expiry: expired offer cannot be applied to a new sale.
