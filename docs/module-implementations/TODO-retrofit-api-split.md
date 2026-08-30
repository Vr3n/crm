# TODO — Retrofit existing features to the per-module api layout

Existing features still use the **single-file** `api.ts` (one adapter per feature
folder). Per the decision in `README.md` → "Renderer API layer", all new modules and new
surfaces ship with the split `api/<surface>.api.ts` + wire-shape returns layout. This file
tracks the deferred retrofit of existing features.

**Convention target** (see `README.md`): each domain surface gets its own
`api/<surface>.api.ts` (wire-shape returns from `shared/contracts/<module>.ts`, no
renderer-local types, no React/TanStack imports), a barrel `api/index.ts`, mapping in
feature-level `mappers.ts`, and `queries.ts` as the sole consumer.

## Retrofit queue

| Feature (today: single `api.ts`) | Target split | When |
|---|---|---|
| `features/catalog/api.ts` | `api/plans.api.ts`, `api/offers.api.ts`, `api/policies.api.ts`, `api/versions.api.ts` + `mappers.ts` | **Ships as part of catalog.md implementation** (offers/policies/versions are new surfaces; plans methods move unchanged) |
| `features/leads/api.ts` | `api/leads.api.ts` (list/create/edit/stage/followups/activities) + `api/reference-data.api.ts` (sources/stages/goals/plans/searchSources) + `api/sale.api.ts` (reference-transactions) | with reference-transactions.md (sale.api) or later polish pass |
| `features/identity/api.ts` | `api/session.api.ts`, `api/users.api.ts`, `api/roles.api.ts`, `api/organizations.api.ts` | later polish pass |
| `features/customers/api.ts` | `api/customers.api.ts` + `api/customer360.api.ts` + `mappers.ts` | with customers-memberships.md implementation |
| `features/invoices/api.ts` | `api/invoices.api.ts`, `api/lines.api.ts` + `mappers.ts` | with billing.md implementation |
| `features/finance/api.ts` | `api/payments.api.ts`, `api/refunds.api.ts`, `api/credits.api.ts`, `api/outstanding.api.ts` + `mappers.ts` | with finance.md implementation |
| `features/collections/api.ts` | `api/collections.api.ts` + `mappers.ts` | with read-models.md implementation |
| `features/dashboard/api.ts` | `api/dashboard.api.ts`, `api/finance-reports.api.ts`, `api/funnel.api.ts` + `mappers.ts` | with read-models.md implementation |

## Notes

- **Split-now vs. split-later:** new surfaces land in the new layout immediately
  (e.g. catalog offers/policies/versions). Purely cosmetic splits of already-working
  adapters (leads, identity) are deferred and do not block a module shipping.
- **Do not break mocks:** when a feature still has mock-backed methods (e.g. catalog
  offers before catalog.md lands), the retrofit for that feature waits until its backend
  exists — the split and the real IPC data source ship together per module.
- **Cleanup:** once a feature is split, delete the old single `api.ts` and any
  `build.ts`/inline mapping it contained (mapping moves to `mappers.ts`).