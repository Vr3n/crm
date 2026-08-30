# Module Implementation — Catalog Completion (Module 03)

**Ties to:** `docs/backend-plan/03-catalog.md`, `docs/03-catalog-and-offers.md`,
`docs/implementation-details/catalog-plans-and-lead-fk.md`.
**Depends on:** plans slice (already shipped: `membership_plans`, migrations v9/v10,
catalog application/IPC/preload/renderer).
**Feeds into:** customers-memberships (sale/freeze/renewal read pricing + policies),
billing (invoice-line snapshots), reference-transactions (offer redemption).

## 1. Scope & dependencies

**Done today:** `membership_plans` table, plan CRUD (create/update/delete), 7 seeded
plans, permissions `plan.*`, renderer PlansPage fully wired to IPC.

**New in this step:**
- Offers backend (renderer is on the in-memory `CatalogStore` mock).
- `offer_redemptions` ledger (usedCount must be derived, not stored).
- `membership_plan_versions` (a version row is written on every plan update).
- Policy lookups: `freeze_policies`, `proration_policies`, `cancellation_policies`
  (ADR-0008: policy is data referenced by the plan, not one global rule).
- Plan columns the design doc calls for but v9 did not adopt: `tax_code`,
  `tax_rate_bps`, `registration_fee_minor`, `freeze_policy_id`, `proration_policy_id`,
  `cancellation_policy_id`.

## 2. DB tables (`src/main/db/schema/catalog.ts`)

```text
membership_plans                      (ALTER — migration only)
  + tax_code            text NULL               e.g. 'GST18' (snapshot source for lines)
  + tax_rate_bps        integer NOT NULL DEFAULT 0   1800 = 18.00%
  + registration_fee_minor integer NOT NULL DEFAULT 0
  + freeze_policy_id    integer FK freeze_policies NULL
  + proration_policy_id integer FK proration_policies NULL
  + cancellation_policy_id integer FK cancellation_policies NULL

membership_plan_versions
  id, organization_id FK, plan_id FK membership_plans,
  base_price_minor integer NOT NULL,
  tax_rate_bps integer NOT NULL DEFAULT 0,
  effective_from text NOT NULL,
  created_at text NOT NULL DEFAULT datetime('now')
  INDEX (organization_id, plan_id)

offers
  id, organization_id FK,
  name text NOT NULL, description text,
  discount_type text NOT NULL,       -- FIXED_AMOUNT / PERCENTAGE / OVERRIDE_PRICE / FREE_PERIOD
  value_minor integer NOT NULL,      -- paise (or % bps / override price / free-period days)
  applicable_plan_ids text NOT NULL DEFAULT '[]',   -- JSON number[] (or join table — decision below)
  eligibility text,
  valid_from text NOT NULL, valid_to text NULL,
  max_usage integer NULL, min_purchase_minor integer NULL,
  active integer NOT NULL DEFAULT 1,           -- deactivate, never hard-delete
  created_at, updated_at
  INDEX (organization_id), INDEX (organization_id, active)

offer_redemptions
  id, organization_id FK,
  offer_id FK offers NOT NULL,
  membership_id FK memberships NULL,
  invoice_id FK invoices NULL,
  applied_discount_minor integer NOT NULL,
  redeemed_at text NOT NULL,
  created_by FK users NOT NULL
  INDEX (organization_id, offer_id)

freeze_policies
  id, organization_id FK, name text NOT NULL,
  billing_behavior text NOT NULL,      -- SUSPEND_BILLING / CONTINUE_BILLING
  access_behavior text NOT NULL,       -- NO_ACCESS / LIMITED_ACCESS
  extend_or_credit text NOT NULL,      -- EXTEND_END_DATE / CREDIT_PERIOD / NONE
  fee_minor integer NOT NULL DEFAULT 0,
  free_freeze_count_per_year integer NOT NULL DEFAULT 0,
  description text
  INDEX (organization_id)

proration_policies
  id, organization_id FK, name text NOT NULL,
  rule text NOT NULL,                  -- UPGRADE_CREDIT_UNUSED / DOWNGRADE_CHARGE_REMAINDER /
                                       -- NO_PARTIAL_CREDIT / CUSTOM
  description text
  INDEX (organization_id)

cancellation_policies
  id, organization_id FK, name text NOT NULL,
  effective_rule text NOT NULL,        -- IMMEDIATE / END_OF_PERIOD / NOTICE_DAYS
  notice_days integer NULL,
  description text
  INDEX (organization_id)
```

Foreign keys reference `organizations.id` on every table. All money columns are integer
paise. `offers.applicable_plan_ids` may become a join table `offer_plans (offer_id,
plan_id)` if relational filtering is needed — decision in §10.

## 3. Migrations

- Two migrations (drizzle-kit generated): `membership_plans` policy/tax columns, then the
  four new tables + `membership_plan_versions`. Seed defaults for the three policy tables
  and optionally 1–2 starter offers in a final seed migration.
- Versions **11+** (1–2 reserved for legacy runner). Register in
  `src/main/db/migrations.ts` in order.
- Seeding happens per organization in `src/main/db/seed.ts` (existing
  `seedPlansForOrganization` pattern) so existing orgs also get policy defaults.

## 4. Backend use cases & queries (`src/main/application/catalog.ts`)

Commands (permission-gated, one `withTransaction`):

| Use case | Permission | Rules |
|---|---|---|
| `createOffer(input)` | `offer.create` | name required; validate `discount_type` + `value_minor` by type; `valid_to > valid_from`; unique name per org |
| `updateOffer(offerId, input)` | `offer.update` | editable while active; never rewrites `offer_redemptions` |
| `deactivateOffer(offerId)` | `offer.deactivate` | sets `active = 0`; historical redemptions intact |
| `createFreezePolicy / createProrationPolicy / createCancellationPolicy` | `policy.update` (new) or `settings.manage` | see §10 decision |
| `update<Policy>(id, input)` | `policy.update` / `settings.manage` | |
| `updatePlan` (existing) | `plan.update` | **add**: write a `membership_plan_versions` row capturing old `base_price_minor`/`tax_rate_bps` before the new values are applied |

Queries:

| Query | Permission | Returns |
|---|---|---|
| `listOffers(activeFirst)` | `offer.view` | offer rows; `usedCount` derived via `COUNT(offer_redemptions)` |
| `getOffer(offerId)` | `offer.view` | offer + used count |
| `listPolicyLookups()` | `offer.view` / `plan.view` | `{ freezePolicies, prorationPolicies, cancellationPolicies }` |
| `listPlanVersions(planId)` | `plan.view` | version rows oldest→newest |
| `searchActiveOffers(planId)` | `offer.view` | offers valid now, active, not maxed, applicable to the plan (sale-time) |

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `CATALOG_*` namespace):

```text
catalog:listOffers           → OfferRow[]                (offer.view)
catalog:getOffer             { offerId } → OfferRow      (offer.view)
catalog:createOffer          CreateOfferInput → OfferRow (offer.create)
catalog:updateOffer          { offerId, ...CreateOfferInput } → OfferRow (offer.update)
catalog:deactivateOffer      { offerId } → void          (offer.deactivate)
catalog:listPlanVersions     { planId } → PlanVersionRow[] (plan.view)
catalog:listPolicyLookups    {} → PolicyLookupSet        (plan.view)
catalog:createFreezePolicy | createProrationPolicy | createCancellationPolicy
catalog:updateFreezePolicy | updateProrationPolicy | updateCancellationPolicy
```

Contracts in `src/shared/contracts/catalog.ts`: `offerRowSchema`,
`createOfferInputSchema` (money as `value_minor` paise, `applicablePlanIds: number[]`),
`updateOfferInputSchema`, `offerIdRequestSchema`, `planVersionRowSchema`,
`policyRowSchemas` + inputs. Errors: reuse `CONFLICT` (duplicate name), `VALIDATION_ERROR`;
new code `OFFER_NOT_FOUND` not needed (`NOT_FOUND` suffices).

## 6. Preload API

Extend `window.api.catalog` in `src/preload/index.ts` + `index.d.ts`:

```text
listOffers(): Promise<OfferRow[]>
getOffer(offerId): Promise<OfferRow>
createOffer(input): Promise<OfferRow>
updateOffer(offerId, input): Promise<OfferRow>
deactivateOffer(offerId): Promise<void>
listPlanVersions(planId): Promise<PlanVersionRow[]>
listPolicyLookups(): Promise<PolicyLookupSet>
createFreezePolicy/updateFreezePolicy/createProrationPolicy/updateProrationPolicy/
createCancellationPolicy/updateCancellationPolicy
```

## 7. Frontend fetches (`src/renderer/src/features/catalog/`)

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/catalog/
├── api/
│   ├── plans.api.ts          # listPlans/createPlan/updatePlan/deletePlan
│   ├── offers.api.ts         # listOffers/getOffer/createOffer/updateOffer/deactivateOffer
│   ├── policies.api.ts       # listPolicyLookups + 3×create + 3×update policies
│   ├── versions.api.ts       # listPlanVersions(planId)
│   └── index.ts              # barrel re-export
├── mappers.ts                # NEW: wire→display (paise→₹, ISO→date, active↔isActive, usedCount)
├── queries.ts                # hooks consume api/ + mappers; feature-scoped invalidation keys
├── types.ts                  # renderer display types (kept); add PlanVersion, policy types
├── mock-data.ts              # removed (no mock left — offers move off CatalogStore)
└── ...components, pages      # unchanged
```

- **Wire shape everywhere:** api methods return the `shared/contracts/catalog` types
  exactly (`value_minor`, `min_purchase_minor`, ISO dates, `active`). All mapping
  (`value_minor`→`value` ₹, `valid_from/valid_to`→`startDate/endDate`,
  `max_usage`→`maxUses`, `active`→`isActive`) moves to `mappers.ts`; `code` stays a
  renderer-only display key; `usedCount` comes from the backend row (derived from
  redemptions), drop the stored counter. The current single `api.ts` is split into the
  four files above — plans methods keep their existing behavior, offers swap
  `CatalogStore` for `window.api.catalog.*`, the fake `delay()` is removed.
- `queries.ts`: add `useOffers`/`useCreateOffer`/`useUpdateOffer`/`useDeactivateOffer`
  (replace mock hooks), `usePlanVersions(planId)`, `usePolicyLookups`; invalidation keys
  `['catalog','offers']`, `['catalog','policy-lookups']`, `['catalog','plans']` (plan
  update also invalidates versions).
- Existing `OffersPage`, offer form/metrics/filters/table already render every field —
  swap `deleteOffer` action for `deactivateOffer` (confirm copy: "deactivate" not
  "delete"), and drive the plan checkbox list from `usePlans()`.

## 8. UI wiring

- Offers page keeps its UI; the data source becomes IPC. `deleteOffer` becomes
  `deactivateOffer`.
- PlansPage: "Save" on plan edit shows a version history affordance (read
  `usePlanVersions`), and the form optionally gains tax/registration/policy selects once
  the columns exist.
- Policy lookups get a small admin screen (or Settings section) — see §10.

## 9. Seed & permissions

- Permissions: `offer.view/create/update/deactivate` already exist and are seeded
  (Manager all, Sales view). Add `policy.view`/`policy.update` (or reuse `settings.manage`)
  and seed per the §10 decision.
- Seed per organization: default `freeze_policies` (e.g. SUSPEND_BILLING/NO_ACCESS/
  EXTEND_END_DATE), `proration_policies` (all four rules), `cancellation_policies`
  (IMMEDIATE/END_OF_PERIOD/NOTICE_DAYS), and attach sensible defaults to seeded plans.

## 10. Tests

- **Pricing/versioning (unit):** `updatePlan` writes a version row preserving the prior
  `base_price_minor`/`tax_rate_bps`; plan row keeps new values.
- **Offers (application + IPC):** create validates discount-type/value combos; duplicate
  name → `CONFLICT`; deactivate flips `active` only; `listOffers` derives `usedCount` from
  redemptions; expiry/max-usage rejected at sale-time search.
- **Policy lookups (application + IPC):** CRUD + org scoping + permission denial.
- **Repository:** org-scoped queries against `:memory:` SQLite.
- **Migration tests:** expected version set grows; policy seed is idempotent for existing
  orgs.
- **Renderer:** OffersPage lists real IPC offers; deactivate calls the channel; plan
  version list renders.

## 11. Decisions & open items

1. **`applicable_plan_ids`**: JSON text column vs. `offer_plans` join table. JSON is
   simpler for a single-user desktop app; a join table is needed only if plans filtering
   queries become hot. Default: JSON, revisit if needed.
2. **Policy permissions**: introduce `policy.view`/`policy.update` codes, or gate policy
   admin behind `settings.manage`. Default: reuse `settings.manage` to avoid new codes,
   and treat policy lookups (read) as `plan.view`/`offer.view`.
3. **`tax_rate_bps`/`registration_fee_minor`**: adopt on plans now (needed by
   `membership_plan_versions` and invoice-line snapshots), or defer until billing lands.
   Default: adopt now since billing is next.
4. **`deactivateOffer` vs. renderer's current `deleteOffer`**: backend is
   deactivate-not-delete; renderer must stop offering hard delete.
5. **Plan `deletePlan`**: current code hard-deletes when unreferenced. Keep guarded
   hard-delete (plan is reference data; no history yet) but document that once
   `membership_plan_versions`/`memberships` exist, delete must be replaced by
   `deactivatePlan`.