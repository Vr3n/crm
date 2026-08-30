# 00 — Foundation: Drizzle Retrofit, Database Layer, Contracts & Permissions

**Ties to:** Modules 08, 14, 15; guidelines §1–§21, §25, §28 Phase 1.
**Depends on:** the shipped identity/tenancy foundation (already in `src/main/`).
**Feeds into:** every other plan file.

This is Phase 1. No business features are built here; this is the substrate everything
else plugs into.

## 1. Drizzle retrofit (ADR-0004)

### Goal

All persistence goes through Drizzle on the `node:sqlite` driver. The shipped
identity/tenancy code (`src/main/db/*`, `src/main/repositories/identity.ts`,
`src/main/application/identity.ts`) is migrated from raw `node:sqlite` prepared
statements to Drizzle query builder + schema, without changing behavior or weakening
the 78 passing tests.

### Package changes

```text
dependencies:   + drizzle-orm
devDependencies:+ drizzle-kit
```

Verify Electron's bundled Node version supports `node:sqlite` (Node ≥ 22.5). The shipped
foundation already runs on `node:sqlite`, and the test suite runs in plain Node; confirm
the packaged Electron main process is on a compatible Node before locking this in.

### Connection layer (`src/main/db/connection.ts`)

- Keep the Electron-free `DatabaseSync` singleton (`openDatabase`, `closeDatabase`,
  `setDatabase`) exactly as shipped — it is what makes tests hermetic with `:memory:`.
- Keep `withTransaction` (BEGIN IMMEDIATE / SAVEPOINT nesting, module-level `txDepth` /
  `savepointSeq`). It is correct, tested, and is the single transaction boundary for the
  whole app. Do not replace it with Drizzle's `db.transaction()`.
- Add a lazily-built Drizzle instance bound to the same connection:

  ```ts
  let drizzleDb: DrizzleDb | null = null
  export function getDrizzle(): DrizzleDb {
    if (!drizzleDb) drizzleDb = drizzle(getDb(), { schema })
    return drizzleDb
  }
  ```

  Because Drizzle shares the `DatabaseSync` connection, statements issued via the query
  builder inside `withTransaction(fn)` participate in the enclosing transaction.
  Repositories must therefore **not** call `db.transaction()`; they operate on the
  injected Drizzle instance and the application use case owns the boundary.

### Schema files (`src/main/db/schema/`)

Move schema definitions out of `migrations.ts` into Drizzle schema modules:

```text
src/main/db/schema/
├── index.ts            # re-exports all tables + relations
├── identity.ts         # organizations, users, roles, permissions, role_permissions,
│                       # organization_staff, app_meta
├── people.ts           # people (person anchor — Module 01)
├── catalog.ts          # membership_plans, membership_plan_versions, offers,
│                       # offer_redemptions, policy lookups
├── sales.ts            # leads, lead_activities, lead_followups, lead_stage_history,
│                       # lead_sources, lead_stages, lead_lost_reasons
├── membership.ts       # customers, memberships, membership_freezes, membership_events
├── billing.ts          # invoices, invoice_lines, invoice_sequence
├── finance.ts          # payments, payment_allocations, refunds, credits, credit_allocations
└── ops.ts              # audit_log, settings
```

The `migrations/` array in `migrations.ts` is removed once every table is defined in
Drizzle schema (see §2 for the new runner).

### Repository retrofit

- Convert `src/main/repositories/identity.ts` to Drizzle query builder against the
  injected Drizzle instance. Method signatures (the repository *interface*) stay the
  same so `src/main/application/identity.ts` and its tests are untouched.
- Repository layer imports: application/domain interfaces + Drizzle only. Never the
  reverse.

### Retrofit acceptance

- `npm run typecheck`, `npm run lint`, `npm test` all green after the swap.
- The same user-visible behavior (setup, login, RBAC, remembered login).

## 2. Migration workflow (ADR-0005)

### Authoring

- Schema lives in `src/main/db/schema/*.ts` (Drizzle `sqliteTable`).
- `drizzle-kit generate` produces versioned SQL files in `src/main/db/migrations/`
  (e.g. `0000_identity.sql`, `0001_catalog.sql`) plus the journal. Only the generated
  SQL is committed; never hand-edit an applied migration (guidelines §22).
- Do not use `drizzle-kit push`; production applies migrations at startup.

### Startup runner

- SQL files are bundled into the main-process bundle via Vite `?raw` imports (electron-vite
  supports `?raw`), so there are no `.sql` files to copy alongside the packaged app.
- A rewritten `runMigrations()` applies unapplied migrations in order, recording each in
  the existing `schema_migrations` table (same semantics as today):

  ```ts
  import m0000 from '../migrations/0000_identity.sql?raw'
  import m0001 from '../migrations/0001_catalog.sql?raw'
  // ...
  const migrations = [{ version: 0, name: '0000_identity', sql: m0000 }, /* ... */]
  ```

- Startup sequence (guidelines §21): determine DB path → open SQLite → PRAGMAs →
  verify DB → backup if required → apply pending migrations → verify schema → construct
  repositories → construct application services → register IPC → create window.
- On migration failure: abort startup, preserve any backup, report an actionable error.
  Never continue on a partially migrated schema.

### PRAGMA baseline

```text
PRAGMA foreign_keys = ON;    -- already enforced per connection
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

Verified under the `node:sqlite` driver; adjust `busy_timeout` only if the driver
requires a different unit.

## 3. Coded IPC error contract (ADR-0006)

### Shape

Refactor `src/main/ipc/handle.ts` to the guidelines §16 contract:

```ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } }
```

- `ErrorCode` and the error-code catalog live in `src/shared/contracts/errors.ts`,
  importable from both main and renderer.
- `handle()` maps thrown domain errors to their codes via a registry; unknown errors map
  to `INTERNAL_ERROR`. No Electron-internal serialization leaks across the boundary.
- Preload unwraps the result and re-throws an `Error` carrying the code (the renderer
  client keeps its `throw`-style API).
- The renderer branches on `error.code`, never on `message`.

### Error code catalog (starter)

```text
VALIDATION_ERROR            NOT_FOUND            CONFLICT
UNAUTHENTICATED             PERMISSION_DENIED    INVALID_STATE_TRANSITION
PAYMENT_ALREADY_ALLOCATED   PAYMENT_OVER_ALLOCATED
INVOICE_ALREADY_FINALIZED   INVOICE_EMPTY         INVOICE_NUMBER_COLLISION
MEMBERSHIP_CANNOT_BE_FROZEN MEMBERSHIP_CANNOT_BE_CANCELLED
REFUND_EXCEEDS_PAYMENT      CREDIT_EXCEEDS_BALANCE
DUPLICATE                   INTERNAL_ERROR
```

The catalog is additive; new codes are added in `src/shared/contracts/errors.ts` with
each module.

### Domain error taxonomy

Extend `src/main/domain/errors.ts` so every `DomainError` subclass carries a stable
`code` from the shared catalog (today it has `DomainError`, `NotFoundError`,
`UnauthorizedError`, `ValidationError`, `ForbiddenError`). Add
`InvalidStateTransitionError`, `ConflictError`. Address known-gap #5: introduce a
dedicated `UnauthenticatedError` so an unauthenticated caller is not reported as
`PERMISSION_DENIED`.

## 4. Shared contracts (`src/shared/contracts/`)

New top-level `src/shared/contracts/` imported by main, preload, and renderer:

```text
src/shared/contracts/
├── errors.ts            # ErrorCode + catalog
├── money.ts             # money input/output shape (amount_minor, currency)
├── paging.ts            # page/limit + cursor conventions for list queries
├── ipc.channels.ts      # channel-name constants (single source of truth)
└── (per-module .ts)     # Zod schemas + inferred types per IPC operation
```

Rules:

- Every IPC operation has an explicit contract: **input** (Zod schema), **output**
  (Zod schema or inferred type), **errors** (allowed codes). Zod validation runs at the
  IPC boundary before the application layer is invoked (guidelines §15).
- The preload `.d.ts` (which duplicates `SessionContext` today) is replaced by importing
  the canonical types from `src/shared/contracts/` — resolves known-gap #6.
- Money crosses the boundary as `{ amount_minor: number, currency: string }`, never a
  formatted string.

## 5. Session & organization context

The shipped `SessionContext` (user + active org + role + resolved permission set) is the
source of the Organization Context. Every new command handler reads `organization_id`
from the session — never from a request field — and stamps it on every record it
creates. Extend `src/main/auth/session.ts` only if the permission-check helper needs a
broader contract; otherwise keep it.

## 6. Permission catalog expansion

Extend `src/main/db/permissions.ts` (`ALL_PERMISSION_CODES`) and the seed role grants in
`src/main/db/seed.ts` as modules land. The catalog is additive; super roles inherit new
codes automatically. Starter set for the business modules:

```text
lead.view  lead.create  lead.assign  lead.record_activity  lead.update_stage
lead.mark_lost  lead.convert
plan.view  plan.create  plan.update  plan.deactivate
offer.view  offer.create  offer.update  offer.deactivate
membership.view  membership.create  membership.activate  membership.freeze
membership.unfreeze  membership.renew  membership.change_plan
membership.request_cancellation  membership.cancel
invoice.view  invoice.create  invoice.finalize  invoice.void
payment.view  payment.record  payment.allocate
refund.view  refund.create
credit.view  credit.create  credit.apply
report.view  backup.manage  settings.manage
```

Seed role permission sets follow the Module 15 worked example (Sales, Front Desk,
Finance, Manager, Admin, Owner). These are data changes, not code changes.

## 7. Tests for the foundation

- **Connection/transaction tests (existing, keep green):** savepoint nesting, rollback
  on throw, `BEGIN IMMEDIATE` at outer level.
- **Migration runner tests:** fresh DB applies all migrations; idempotent re-run; a
  failing migration aborts and records nothing.
- **Contract tests:** Zod schemas reject malformed input; `handle()` maps each error
  subclass to the right code.
- **Repository tests:** identity repositories against a real Drizzle + `:memory:` DB
  (constraints, uniqueness, joins, persistence mapping).
- **IPC/preload tests (new, closes known-gap #9):** thin, mocked `ipcMain`/`ipcRenderer`
  harness verifying channel routing, input validation, and code-carrying errors.
