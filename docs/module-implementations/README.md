# Module Implementation Plans

This folder is the module-by-module build plan for turning the **mock-backed** renderer
surfaces (customers, memberships, invoices, finance, collections, dashboard) and the
**partially built** catalog into real SQLite-backed vertical slices — DB tables, backend
queries/use cases, IPC channels, preload APIs, and frontend fetches — following the exact
pattern established by the **leads** (Module 01) and **catalog plans** (Module 03) slices.

Read the normative design docs (`docs/0X-*.md`) and the backend plans
(`docs/backend-plan/*.md`) for the *why*; read the file for a module to know the *what to
build* and *where it plugs in*.

## Index

| File | Ties to | Builds |
|------|---------|--------|
| [`README.md`](./README.md) | this overview — template, conventions, dependency order | — |
| [`catalog.md`](./catalog.md) | Module 03, `backend-plan/03-catalog.md` | offers, offer redemptions, plan versions, policy lookups |
| [`customers-memberships.md`](./customers-memberships.md) | Module 02, `backend-plan/02-customers-memberships.md` | customers, memberships, freezes, events |
| [`billing.md`](./billing.md) | Module 04, `backend-plan/04-billing.md` | invoices, invoice lines, numbering |
| [`finance.md`](./finance.md) | Module 05, `backend-plan/05-finance.md` | payments, allocations, refunds, credits |
| [`reference-transactions.md`](./reference-transactions.md) | Module 07, `backend-plan/07-reference-transactions.md` | sale / payment / freeze atomic flows |
| [`backbone.md`](./backbone.md) | Module 06, `backend-plan/06-backbone.md` | audit log, settings, domain events |
| [`read-models.md`](./read-models.md) | Module 09, `backend-plan/09-read-models.md` | dashboard, funnel, finance views, search, customer 360 |
| [`ops.md`](./ops.md) | Module 10, `backend-plan/08-ops.md` | backup/restore, import/export, delete policy |
| [`TODO-retrofit-api-split.md`](./TODO-retrofit-api-split.md) | Renderer API layer convention | deferred retrofit of existing features to per-module `api/<surface>.api.ts` |

## Build order (dependency chain)

```text
catalog.md (offers + policies)          ← pricing/policy data others read
  ↓
customers-memberships.md                ← sale/freeze/renewal targets
  ↓
billing.md                              ← invoices for sales/renewals
  ↓
finance.md                              ← payments/refunds/credits against invoices
  ↓
reference-transactions.md               ← orchestrates the above atomically
  ↓
backbone.md (audit/events/settings)     ← cross-cutting, written by the above
  ↓
read-models.md                          ← reads the transactional tables
  ↓
ops.md                                  ← backup/import/export/delete policy
```

Each module is planned to be shippable on its own, but the ordering above respects the
data/operation dependencies (e.g. `FreezeMembership` needs `freeze_policies`, invoices
need `customers`, payments need invoices).

## The per-module template (replicate the leads/plans slice)

Every module file contains these ten sections:

| # | Section | What it must specify |
|---|---------|----------------------|
| 1 | Scope & dependencies | Done vs. new; which `backend-plan` / design docs it ties to |
| 2 | DB tables | Drizzle `sqliteTable` — columns, types, FKs, indexes, CHECKs |
| 3 | Migrations | version numbers (start at **11**; 1–2 reserved for legacy runner), `migrations.ts` registration |
| 4 | Backend use cases & queries | commands (permission-gated, one `withTransaction`) + read queries |
| 5 | IPC channels & contracts | channel names, Zod input/output schemas, error codes |
| 6 | Preload API | `window.api.<module>.*` methods + `.d.ts` entries |
| 7 | Frontend fetches | `api/<surface>.api.ts` files (one per domain surface, wire-shape returns), `mappers.ts` (wire→display mapping), `queries.ts` TanStack hooks + invalidation keys — see "Renderer API layer" below |
| 8 | UI wiring | which existing mock page keeps its UI and swaps the store for IPC; which dialogs/actions to add |
| 9 | Seed & permissions | new permission codes, role grants, default data |
| 10 | Tests | application, IPC, repository, migration, renderer cases |

## Global conventions (apply to every module)

- **Layer discipline:** Renderer → IPC → Application (use case) → Domain → Repository →
  Drizzle → SQLite. Domain never imports Drizzle/SQLite/Electron/React. The renderer only
  talks to `window.api` through the feature `api.ts` seam.
- **Transaction ownership:** the application use case owns the `withTransaction`
  (BEGIN IMMEDIATE / savepoints). Repositories never commit on their own; Drizzle runs on
  the shared connection so it participates in the enclosing transaction.
- **Organization scoping:** every business table carries `organization_id`; every query
  filters by the session's Organization Context.
- **Money:** integer minor units (paise) in DB and domain; never floats. Formatting only in
  the renderer. Contracts carry `{ amount_minor }` (see `src/shared/contracts/money.ts`).
- **Immutability:** financial/membership history is never overwritten. Corrections are
  explicit operations (void, refund, credit, deactivate, cancel, expire).
- **State transitions:** no generic `updateStatus`; every transition is an explicit domain
  operation validated by a state machine that throws `InvalidStateTransitionError`.
- **Soft lifecycle:** never hard-delete rows that entered business history —
  deactivate/cancel/void/expire instead. Hard delete only for records never in business
  history (e.g. an empty DRAFT invoice).
- **Timestamps:** ISO-8601 UTC TEXT, default `datetime('now')` (existing convention).
- **Audit:** important operations write to `audit_log` inside the same transaction
  (Module 06; tables land in the `backbone` step, so earlier modules plan the write but
  implement it once `audit_log` exists).
- **Error codes:** domain errors carry stable codes from `src/shared/contracts/errors.ts`;
  new codes are added additively per module.
- **Paging:** list queries use `src/shared/contracts/paging.ts` (`Paged<T>`,
  page/limit/total/hasMore).

## Renderer API layer (per-module api files)

Every domain surface gets its **own** api file in
`src/renderer/src/features/<feature>/api/<surface>.api.ts`, with a barrel
`api/index.ts` re-exporting them. This replaces the older one-file-per-feature `api.ts`
so a surface's adapter can be lifted into another project as-is.

Rules (each module doc's §7 lists its concrete file layout):

- **One file per surface.** A surface is a cohesive domain operation set — e.g.
  `plans.api.ts`, `offers.api.ts`, `policies.api.ts` (catalog); `payments.api.ts`,
  `refunds.api.ts`, `credits.api.ts` (finance). Not one file per feature folder.
- **Wire-shape returns (portable + secure).** Api methods return the **shared-contract
  types exactly** — integer paise, ISO-UTC date text, raw enums — the same shapes the IPC
  boundary Zod-validates. No ₹ conversion, no enum renaming, no renderer-local types
  inside api files. Returning the already-validated wire shape is the most portable and
  secure convention: adapters never fabricate or relax data, so nothing unvalidated can
  leak into the UI.
- **Portability contract.** An api file may import only `window.api.<module>.*` and
  `src/shared/contracts/<module>.ts`. Move it + its contract module to another project and
  swap the `window.api.<module>` base for that project's transport (fetch, tRPC, another
  Electron preload). It must never import React, TanStack, sibling features, or
  renderer-local types.
- **Mapping lives in `mappers.ts`.** The wire→display conversion (₹ formatting, date
  parsing, enum reconciliation like `ANNUAL↔YEARLY`, `ACCESS↔LIMITED_ACCESS`) sits in a
  feature-level `mappers.ts` consumed by `queries.ts`. Components never touch
  `window.api` and never see wire shape.
- **`queries.ts` is the sole consumer** — TanStack hooks call `api/` methods and apply
  `mappers`; invalidation keys are feature-scoped.

> **Retrofit note:** existing features (`leads`, `identity`, `customers`, `invoices`,
> `finance`, `collections`, `dashboard`) still use the single-file `api.ts`. Splitting
> them is deferred — tracked in
> [`TODO-retrofit-api-split.md`](./TODO-retrofit-api-split.md). New modules and new
> surfaces ship with the split layout from day one.

## Definition of done (per module)

From `docs/backend-plan/README.md` §Definition of done and `AGENTS.md`:

- [ ] Use cases (commands/queries), not CRUD leaks into the UI.
- [ ] Inputs validated at the IPC boundary with Zod.
- [ ] Authorization via a Permission code in the backend.
- [ ] Business invariants enforced outside the UI; state transitions explicit.
- [ ] Correct transaction boundary; related writes atomic.
- [ ] Persistence behind repositories; Drizzle stays in infrastructure.
- [ ] Financial/membership records immutable where required.
- [ ] Audit record written where required.
- [ ] Domain/application errors typed with stable codes.
- [ ] Domain rules unit tested; repository behavior tested; critical workflows integration
      tested; renderer tests for the wired fetches.
- [ ] Renderer accesses the feature only through the feature `api.ts` client.
- [ ] Implementation documented in `docs/implementation-details/` per AGENTS.md step 5.