# Crown CRM — Backend Implementation Plan

This folder is the module-wise backend implementation plan for the Crown CRM Electron
application. It turns the normative design modules in `docs/` and the rules in
`docs/backend-implementation-guidelines.md` into an ordered, buildable plan, and records
the decisions made during the `/grilling` + `/domain-modeling` session.

Read the normative spec to understand *why*; read this folder to know *what to build
next*. Decisions and vocabulary live in `plans/docs/adr/` and `plans/CONTEXT.md`.

## Index

| File | Ties to `docs/` module | What it plans |
|------|------------------------|---------------|
| [`00-foundation.md`](./00-foundation.md) | 08, 14, 15, guidelines | Drizzle retrofit, database foundation, migration runner, coded IPC error contract, shared contracts, permission catalog expansion |
| [`03-catalog.md`](./03-catalog.md) | 03 | Plans, plan versions, offers, freeze/proration/cancellation policy lookups |
| [`01-sales.md`](./01-sales.md) | 01 | People anchor, leads, activities, follow-ups, stages, conversion |
| [`02-customers-memberships.md`](./02-customers-memberships.md) | 02 | Customer identity, membership lifecycle, freeze, renewal, plan change, cancellation |
| [`04-billing.md`](./04-billing.md) | 04 | Invoices, invoice lines, tax snapshotting, invoice numbering |
| [`05-finance.md`](./05-finance.md) | 05 | Payments, allocations, refunds, credits, outstanding balance |
| [`07-reference-transactions.md`](./07-reference-transactions.md) | 07 | The three atomic reference transactions (sale, payment, freeze) |
| [`06-backbone.md`](./06-backbone.md) | 06, 11 | Audit log, aggregate boundaries, domain services, commands/queries, domain events |
| [`09-read-models.md`](./09-read-models.md) | 09 | Dashboards, funnel, finance views, search, customer 360 |
| [`08-ops.md`](./08-ops.md) | 10 | Delete policy, concurrency, backup/restore, import/export |

## Locked decisions

These were settled during the grilling session and recorded as ADRs in `plans/docs/adr/`:

1. **Drizzle everywhere** — `drizzle-orm` over the `node:sqlite` driver for all
   persistence, including retrofitting the shipped identity/tenancy foundation
   (ADR-0004).
2. **`drizzle-kit generate` + custom startup migration runner** — versioned SQL files
   bundled via Vite `?raw` imports, applied at app startup (ADR-0005).
3. **Coded IPC error contract** — `{ ok, data } | { ok: false, error: { code, message, details? } }`
   everywhere (ADR-0006).
4. **Lead Stage as reference table + code enum** — pipeline is data, only
   `is_won`/`is_lost` flags drive logic (ADR-0007).
5. **Per-plan proration policy** — proration is configurable data, not one global rule
   (ADR-0008).
6. **`people` anchor table** — Person ≠ Lead ≠ Customer enforced structurally (ADR-0009).

## Architecture mapping

The guidelines' suggested directory structure (guidelines §25) maps onto the shipped
layout. Dependency rules are more important than folder names; this table is the
authoritative mapping:

| Guidelines §25 path | Shipped path (kept) |
|---------------------|---------------------|
| `src/domain/` | `src/main/domain/` |
| `src/application/` | `src/main/application/` |
| `src/infrastructure/sqlite/` | `src/main/db/` (+ new `src/main/db/schema/`, `src/main/db/migrations/`) |
| `src/main/ipc/` | `src/main/ipc/` (unchanged) |
| `src/preload/` | `src/preload/` (unchanged) |
| `src/renderer/api/client.ts` | `src/renderer/src/lib/` renderer API client |
| `src/shared/contracts/` | **new** `src/shared/contracts/` (importable by both processes) |

## Global conventions (apply to every module)

- **Layer discipline:** Renderer → IPC → Application (use case) → Domain → Repository →
  Drizzle → SQLite. Domain never imports Drizzle/SQLite/Electron/React. The renderer only
  ever talks to `window.api` through the renderer API client.
- **Transaction ownership:** the application use case owns the transaction. Repositories
  never commit on their own. All DML for one business operation runs inside the shared
  `withTransaction` (BEGIN IMMEDIATE / SAVEPOINT nesting). Drizzle's query builder runs
  on the same connection, so it participates in that transaction — do not call
  `db.transaction()` inside a use case; use `withTransaction`.
- **Organization scoping:** every business table carries `organization_id`; every query
  filters by the session's Organization Context. Never skip the filter because "there is
  only one org".
- **Money:** integer minor units (paise) in the database and in the `Money` domain value
  object. Never floating point. Formatting happens only in the renderer.
- **Immutability:** financial and membership history is never overwritten. Corrections go
  through explicit business operations (void, refund, credit, deactivate, cancel).
- **State transitions:** never a generic `updateStatus`. Every transition is an explicit
  domain operation that validates legality and performs side effects.
- **IDs:** integer auto-increment primary keys (local single-user SQLite). Business
  numbers (e.g. invoice numbers) are generated separately and never reuse the PK.
- **Timestamps:** ISO-8601 UTC TEXT columns (consistent with the shipped
  `datetime('now')` convention).
- **Soft delete:** never hard-delete rows that have entered business history. Prefer
  deactivate/cancel/void/archive (see `08-ops.md`).
- **Audit:** important operations write to `audit_log` inside the same transaction.

## Build order

```text
00 Foundation (Drizzle retrofit + DB + errors + contracts + permissions)
   ↓
03 Catalog (plans, offers, policy lookups)     ← reference data others point at
   ↓
01 Sales (people, leads, activities, follow-ups, stages)
   ↓
02 Customers & Memberships (identity, lifecycle, freeze, renewal, plan change)
   ↓
04 Billing (invoices, lines, numbering)
   ↓
05 Finance (payments, allocations, refunds, credits)
   ↓
07 Reference transactions (sale, payment, freeze — atomic)
   ↓
06 Backbone (audit, aggregates, services, events)
   ↓
09 Read models (dashboards, funnel, search, customer 360)
   ↓
08 Ops (delete policy, concurrency, backup, import/export)
```

This follows the dependency order in Module 12 §79: the vertical slice ("Create Lead")
and the transactional slice ("Sell Membership") are implemented as soon as 00–07 give
them enough substrate, not deferred to the end.

## Definition of done (per module)

A backend feature is done only when every applicable criterion from guidelines §30 is
yes. At minimum, for each new business operation:

- [ ] Represented as a business use case (command/query), not CRUD.
- [ ] Inputs validated at the IPC boundary with Zod.
- [ ] Authorization checked in the backend via a Permission code.
- [ ] Business invariants enforced outside the UI.
- [ ] State transitions explicit.
- [ ] Transaction boundary correct and all related writes atomic.
- [ ] Persistence isolated behind repositories; Drizzle stays in infrastructure.
- [ ] Financial records immutable where required.
- [ ] Audit record written where required.
- [ ] Domain/application errors typed with stable codes.
- [ ] Domain rules unit tested; repository behavior tested; critical workflow integration tested.
- [ ] Renderer accesses the feature only through the renderer API client.
