# Implementation Details — Catalog Plans + Lead `plan_id` FK (Module 03)

This document is the implementation-level counterpart to `docs/03-catalog-and-offers.md`.
It covers the **real, SQLite-backed** membership-plan catalog: the `membership_plans` table,
the Catalog IPC surface, and the conversion of the lead's free-text `plan_interest` into a
real foreign key (`leads.plan_id`).

## Scope of this pass

- Create the `membership_plans` reference table (module catalog) with org-scoped, integer-minor
  pricing, plus seed the starter catalog for every organization.
- Stand up the full Catalog backend: repository, application use cases, IPC channels, preload
  bridge — and wire the renderer Plans page to it (prices converted ₹ ↔ paise on the wire).
- Replace the lead form's free-text **Plan interest** field with a **pick from the catalog**
  combobox that stores a real `plan_id`; display the joined `plan_name` wherever leads are shown.
- Offers remain on the renderer's in-memory `CatalogStore` (unchanged) — the offers backend is
  explicitly out of scope for this pass.

## Decisions (deliberate)

| Decision | Rationale |
| --- | --- |
| Prices stored as integer **minor units** (`base_price_minor`, paise) | Accounting rule from the backend plan: money is never stored as floats. Renderer converts ₹ ↔ paise at the API seam (`catalog/api.ts`). |
| `duration` / `billing_frequency` / `access_window` stored as renderer **enum texts** (`MONTHLY`, `ONE_TIME`, `ALL_HOURS`) | Mirrors the existing renderer constants; the docs' `duration_days`/`ANNUAL` vocabulary was **not** adopted (documented gap). |
| Plan delete is a **hard delete** guarded by `ConflictError` | `deletePlan` refuses while `leadRepo.countByPlanId` > 0 — a referenced plan must be deactivated instead. |
| No backfill of legacy `plan_interest` text | Explicitly decided: existing free-text values are dropped (`ALTER TABLE leads DROP COLUMN plan_interest`). |
| Lead-form plan picker is **pick-only** (`canCreate` false) | Plan creation lives in the Catalog module; a lead form never invents plans. |
| Offers stay mock | Deferred to the offers-backend pass. |

## Migration v9 — `catalog_plans`

Generated with `npx drizzle-kit generate`. The rename-vs-create ambiguity for
`leads.plan_interest` → `plan_id` was resolved by passing the column hint:

```bash
npx drizzle-kit generate --name catalog_plans --hints '[{"type": "create", "kind": "column", "entity": ["public", "leads", "plan_id"]}]'
```

The migration:

- Creates `membership_plans` (`organization_id`, `name`, `description`, `duration`,
  `billing_frequency` default `ONE_TIME`, `base_price_minor`, `access_window` default
  `ALL_HOURS`, `start_time`/`end_time`, `active` default true, timestamps;
  `UNIQUE(organization_id, name)`, org FK + `idx_membership_plans_org`).
- `ALTER TABLE leads ADD plan_id` (FK → `membership_plans(id)`) + `idx_leads_org_plan`.
- `ALTER TABLE leads DROP COLUMN plan_interest`.

## Migration v10 — `seed_plans`

Hand-written, idempotent starter catalog. Seeds 7 plans for any organization with zero plans
(`CROSS JOIN` a `UNION ALL` value list, guarded by `WHERE NOT EXISTS`), so a second migration
run is a no-op:

| Name | Duration | base_price_minor | Active |
| --- | --- | --- | --- |
| Basic Monthly | MONTHLY | 150000 | ✓ |
| Student Monthly | MONTHLY | 120000 | ✓ |
| Yoga Studio | MONTHLY | 180000 | ✓ |
| Premium Quarterly | QUARTERLY | 390000 | ✓ |
| Premium Half Yearly | HALF_YEARLY | 740000 | ✓ |
| Annual Premium | YEARLY | 2400000 | ✓ |
| Weekend Access | MONTHLY | 90000 | ✗ (inactive) |

The same rows are provisioned for **new** orgs at setup time via `seedPlansForOrganization`
(added to `src/main/db/seed.ts`, called from `setupOrganization` in `identity.ts` after
`seedSalesReferenceData`).

## Backend

New module files follow the layered architecture from `docs/08`:

```
src/main/db/schema/catalog.ts        → membershipPlans table + org relations (schema/index.ts)
src/main/domain/catalog.ts           → MembershipPlan + enum types
src/main/repositories/catalog.ts     → planRepo (org-scoped, no transactions)
src/main/application/catalog.ts      → listPlans / createPlan / updatePlan / deletePlan
src/main/ipc/catalog.ts              → registerCatalogIpc (wired in src/main/index.ts)
src/shared/contracts/catalog.ts      → planRow / create / update / id-request schemas
```

### Application use cases (`catalog.ts`)

- `listPlans` — `plan.view`; returns the org's full catalog (active + inactive) for the Plans screen.
- `createPlan` — `plan.create`; trims the name, `ConflictError` on a case-insensitive duplicate
  (`findByName` uses SQLite `LIKE`), one `withTransaction` boundary.
- `updatePlan` — `plan.update`; duplicate check excludes self; refuses foreign/missing plans.
- `deletePlan` — `plan.deactivate`; `ConflictError` when `leadRepo.countByPlanId` > 0.

### Lead FK changes (`sales.ts`, `lead.ts`, `contracts/sales.ts`, `application/leads.ts`)

- `leads.plan_id` replaces `plan_interest`; `mapLead`/`createLead`/`editLead` carry `planId`.
- `listLeads` left-joins `membership_plans` and returns `planId` + `planName` (single extra join).
- `planId` is validated by `assertPlanExists` (must belong to the current org) before any write.
- The plan picker search is now `searchLeadPlans(input: PlanSearchRequest) → PlanOptionRow[]`
  (`{ id, name }`), backed by `planRepo.searchActive` (active-only, `lead.view`-gated). The old
  `distinctPlanInterests` repository method and `searchLeadPlanInterests` use case are **removed**.
- `bulkMoveLeadStageInputSchema` gained an optional `note` (the strict-move dialog records the
  reason as each lead's NOTE activity, falling back to a "Bulk move to {target}" default).

## Renderer

- `features/catalog/api.ts`: plans now call `window.api.catalog.*`; the seam converts
  `basePriceMinor` (paise) ↔ `basePrice` (₹). Offers still go through the mock `CatalogStore`,
  which was slimmed down to offers-only.
- `features/leads/`: types/mapping switched `planInterest` → `planId`/`planName`; `api.ts`
  `searchPlanInterests` now returns `PlanOptionRow[]`.
- `new-lead-dialog.tsx` / `edit-lead-dialog.tsx`: the Plan field uses `AutocorrectCombobox`
  with `create` omitted (pick-only). Edit prefill resolves `planId` → `planName` via the list row.
- `AutocorrectCombobox` (`components/autocorrect-combobox.tsx`): `create` became optional and
  `canAdd` now requires a factory, so pick-only fields never render "+ Add".
- Display: `identity-card.tsx` shows `planName`; the dashboard's `MemberLeadContext.planInterest`
  is mock/stub data (rewritten when the membership module lands) and was left as-is.

## Tests

- `tests/db/migrations.test.ts` — version set `[0,3,4,5,6,7,8,9,10]`, table list + `membership_plans`,
  idempotency count 9, plus a dedicated `seed_plans` case (7 rows, `plan_id` present /
  `plan_interest` dropped, second run no-op). Grant/legacy fixtures gained a minimal `leads` table
  so v9's `ALTER` statements apply.
- `tests/main/application/catalog.test.ts` (14) — list/create/update/delete incl. duplicate,
  cross-org scoping, referenced-delete `ConflictError`, and permission gates.
- `tests/main/ipc/catalog.test.ts` (8) — every channel through the `{ ok, ... }` envelope incl.
  `VALIDATION_ERROR`/`PERMISSION_DENIED`/`CONFLICT` paths.
- `tests/helpers/sales-db.ts` — `seedOrgWithSession` now also seeds the starter plans.
- `tests/main/application/leads.test.ts`, `tests/main/ipc/sales.test.ts` — plan FK round-trips,
  cross-org plan rejection, `searchLeadPlans` (active-only + scoped), bulk-move `note`.
- `tests/renderer/new-lead-dialog.test.tsx`, `leads-page.test.tsx`, `setup.ts` — pick-only plan
  field, `planId` payload, catalog preload mock.

## Verify

```bash
npm run typecheck:node && npm run typecheck:web
npm test
npm run lint          # clean on all new/modified code (repo-wide prettier CRLF warnings pre-exist)
```

## Known gaps

- Legacy `plan_interest` text is **not** backfilled into `membership_plans`; it is dropped.
- Offers are still mock (`applicablePlanIds` reference the seeded plan ids illustratively).
- `findByName` duplicate detection relies on SQLite `LIKE` (case-insensitive); a leading `%`/`_`
  in a plan name would be treated as a wildcard (acceptable for now).
- `membership_plan_versions`, plan policy/access tables, and the offers backend are future work.