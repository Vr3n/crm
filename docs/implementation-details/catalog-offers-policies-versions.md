# Implementation Details — Catalog Offers, Policies, Plan Versions (Module 03)

Companion to `docs/03-catalog-and-offers.md` and `docs/module-implementations/catalog.md`.
This pass completes Module 03's catalog: **offers + redemptions**, **freeze/proration/
cancellation policies**, **plan price history**, plan **tax/registration** columns, and the
renderer's **per-surface `api/` split** that finally removes the in-memory `CatalogStore` mock.

## Scope of this pass

- New tables: `offers`, `offer_redemptions`, `membership_plan_versions`, `freeze_policies`,
  `proration_policies`, `cancellation_policies`; `membership_plans` gains
  `tax_code`, `tax_rate_bps`, `registration_fee_minor`, and the three policy FKs.
- Backend: repositories, application use cases, 13 new IPC channels + preload bridge — all
  gated by permission, org-scoped, with one `withTransaction` boundary per use case.
- Renderer: catalog now uses **real IPC** through `api/` facades + `mappers.ts`; `queries.ts`
  is the sole consumer. Offers page, Plans page, plan price-history dialog, tax/registration
  in the plan editor, and offer deactivation all go live.
- Removed: `src/renderer/src/features/catalog/api.ts` and `mock-data.ts` (the `CatalogStore`).

## Decisions (deliberate)

| Decision | Rationale |
| --- | --- |
| Offers are **deactivated, never deleted** | `offer_redemptions` keep referential meaning; historical invoices already snapshot their own price, so delete buys nothing. |
| `offer_redemptions.membership_id` / `invoice_id` are **plain nullable integers (no FK)** | `memberships`/`invoices` tables do not exist yet and `PRAGMA foreign_keys = ON` would fail the CREATE TABLE. FKs are deferred until those modules land (documented in `known-gaps.md`). |
| Offer `code` is **renderer-only**, derived from the name (`codeFromName`) | Never stored; avoids a redundant uniqueness constraint and keeps the form honest (the name is the source of truth). |
| `active` on the offer wire (not `isActive` like plans) | Raw column name surfaces at the contract seam; `mappers.ts` reconciles to the renderer's `isActive`. |
| Renderer `Offer.endDate` is nullable; `maxUses` 0 = unlimited | Mirrors `valid_to` nullable and `max_usage` nullable; open-ended offers are a first-class case. |
| Policy admin behind `settings.manage`, reads behind `plan.view` | No new permission codes (ADR-0008); only Owner/Admin can mutate policies. |
| `updatePlan` writes a `membership_plan_versions` row | Preserves the outgoing `base_price_minor`/`tax_rate_bps` — the sale-time snapshot story stays auditable. |
| Tax stored as `tax_rate_bps` (integer basis points), registration as `registration_fee_minor` | Accounting rule: money/rates never float; renderer converts bps ↔ % and ₹ ↔ paise at the seam. |
| Seed policies attach **defaults to pre-existing plans** (migration v12) | Existing orgs get Standard Freeze / Standard Proration / End of Period without manual data fixes. |

## Migrations

- **v11 `20260820133254_catalog_offers_policies`** (drizzle-kit generated): creates the six
  tables in dependency order (policies first, then `offers`, `offer_redemptions`,
  `membership_plan_versions`), then `ALTER TABLE membership_plans ADD COLUMN` for the tax,
  registration, and policy FKs.
- **v12 `20260820140000_seed_catalog_policies`** (hand-written, idempotent): seeds
  3 freeze / 3 proration / 3 cancellation policies per org guarded by `NOT EXISTS`, then
  `UPDATE membership_plans` to attach the default policy ids. A second run is a no-op.

Seed defaults: freeze = Standard Freeze / Credit Freeze / Paid Freeze (₹199);
proration = Standard Proration / Downgrade Remainder / No Partial Credit;
cancellation = Immediate / End of Period / 30 Days Notice.
`seedCatalogPoliciesForOrganization` is wired into the identity setup flow and
`tests/helpers/sales-db.ts`.

## Backend surface

- **Contracts** (`src/shared/contracts/catalog.ts`): `offerRowSchema`/create/update/`offerIdRequest`,
  `planVersionRowSchema` + list request, `freeze/proration/cancellationPolicyRowSchema` + create/
  update inputs, `policyLookupSetSchema`, and the policy enums. Money is paise, rates bps,
  dates ISO `yyyy-mm-dd`, offer active flag is `active`.
- **Domain** (`src/main/domain/catalog.ts`): `Offer`, `OfferRedemption`, `MembershipPlanVersion`,
  the three policy types, `OfferDiscountType`, and `validateOfferValue` (percentage 1–100, free
  period ≥ 1 month, fixed/override > 0).
- **Repositories** (`src/main/repositories/catalog.ts`): `planRepo` extended with the new
  columns; new `planVersionRepo`, `offerRepo` (`listWithUsage` = LEFT JOIN `offer_redemptions`
  + COUNT + GROUP BY, `listEligibleForPlan`, `countRedemptions`, `setActive`, `findByName`),
  and `freezePolicyRepo`/`prorationPolicyRepo`/`cancellationPolicyRepo`.
- **Application** (`src/main/application/catalog.ts`): plan CRUD + `listPlanVersions`,
  offer list/get/create/update/deactivate + `searchActiveOffers` (sale-time, not yet on IPC),
  `listPolicyLookups`, and create/update for all three policy types. Duplicate names raise
  `ConflictError`, unknown ids `NotFoundError`, missing permissions `ForbiddenError`.
- **IPC** (`src/main/ipc/catalog.ts`): 14 handlers total; input validation via zod schemas
  before any use case runs.

Permissions: offers `offer.view/create/update/deactivate`; plan versions `plan.view`;
policies write `settings.manage`, read `plan.view`.

## Renderer API layer

Per the shared `api/` convention (README + `TODO-retrofit-api-split.md`):

- `features/catalog/api/{plans,offers,policies,versions}.api.ts` + `index.ts` — thin facades
  over `window.api.catalog.*`, returning **wire shapes unchanged**.
- `mappers.ts` — the only place units/enums reconcile: ₹↔paise, %↔bps, `active`↔`isActive`,
  `valid_to`↔`endDate`, `max_usage`↔`maxUses` (0 = unlimited), and `codeFromName`.
- `queries.ts` — TanStack Query hooks (`usePlans`, `useOffers`, `usePlanVersions`,
  `usePolicyLookups`, plan/offer mutations incl. `useDeactivateOffer`); invalidation is
  feature-scoped (`catalog.plans`, `catalog.offers`, `catalog.plans.{id}.versions`).

UI changes: offer form drops the code input (read-only derived code shown), end date is
open-ended-clearable (`CatalogDatePicker` gained `clearable`), usage cell shows `N used`
for unlimited offers; Plans page shows Tax + Registration columns, the plan editor edits
them, and a "Price history" row action opens the versions dialog.

## Tests

- `tests/db/migrations.test.ts` — v11/v12 tables + versions; new test seeds policies and
  asserts defaults attach to a pre-existing org's plans idempotently.
- `tests/main/application/catalog.test.ts` — offers (create/duplicate/validation/scope/
  deactivate), plan versions (capture/ordering/permission), policy lookups + create
  cancellation policy (incl. `settings.manage` gate).
- `tests/main/ipc/catalog.test.ts` — new channels: list/create/deactivate offer, list plan
  versions, policy lookups, create cancellation policy, plus malformed-input and permission
  envelopes.
- `tests/renderer/catalog-page.test.tsx` — PlansPage renders tax/registration from wire rows,
  edit sends bps/paise, price-history dialog; OffersPage renders open-ended/unlimited and
  deactivates after confirmation. `tests/renderer/setup.ts` mock extended with all new
  `window.api.catalog.*` methods.

## Verification

- `npm run typecheck` (node + web) — clean.
- `npm test` — 364 tests; the single flaky `leads-page` follow-up timeout passes in
  isolation and is unrelated to this pass.
- `npm run lint` — 0 errors on all touched files (the 28k `prettier/prettier` warnings are
  the pre-existing CRLF line-ending noise across the repo).

## Deferred / follow-ups

- Real FKs on `offer_redemptions` when `memberships`/`invoices` land.
- `searchActiveOffers` to IPC when the sale-time checkout reads eligible offers.
- Policy admin screen (mutations + `usePolicyLookups` consumers already exist).