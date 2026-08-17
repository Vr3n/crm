# Backend Foundation — Drizzle Retrofit, Generated Migrations & Coded IPC Contract

A senior-review walkthrough of the backend-foundation pass (Phase 1 of
`docs/backend-plan/00-foundation.md`). It retrofits the shipped identity/tenancy layer
from hand-rolled `node:sqlite` prepared statements onto **Drizzle ORM**, replaces inline
migration strings with **drizzle-kit generated migrations** executed by a custom `?raw`
runner, and replaces message-string error handling with a **coded IPC contract** shared by
main, preload, and renderer.

It is the implementation-level counterpart to ADRs **0004** (Drizzle over raw node:sqlite),
**0005** (drizzle-kit generate + startup runner), and **0006** (coded IPC error contract).
For each file: responsibility, notable decisions, and review concerns.

---

## 1. What changed, at a glance

| Area | Before | After |
| --- | --- | --- |
| DB access | `node:sqlite` prepared statements inline in repos | Drizzle query builder (`getDrizzle()`) with explicit joins |
| Schema | inline SQL strings in `migrations.ts` | `src/main/db/schema/` (Drizzle table defs) as source of truth |
| Migrations | hand-written versioned SQL strings | `drizzle-kit generate` → per-migration folder, executed by `?raw` runner |
| IPC errors | Electron default serialization leaks channel/class names | `{ ok, data \| error }` envelope with stable `ErrorCode` (17 codes) |
| IPC channels | hard-coded strings in `ipc/identity.ts` + preload | `IPC_CHANNELS` constants in `src/shared/contracts/ipc.channels.ts` |
| Boundary validation | app-layer only | Zod schemas at the IPC boundary (shape only) |
| Session/error types | duplicated `SessionContext`, `ForbiddenError` for unauthenticated | single `SessionContext` from shared contracts; `UnauthenticatedError` |

Known gaps **closed** by this pass: #5 (`requireSession` now throws `UnauthenticatedError`,
not `ForbiddenError('user.view')`) and #6 (single `SessionContext` — preload `index.d.ts`
imports it from shared contracts).

---

## 2. Drizzle schema — `src/main/db/schema/identity.ts` + `schema/index.ts`

`schema/identity.ts` declares the seven foundation tables with Drizzle's `sqliteTable`:
`organizations`, `users`, `roles`, `permissions`, `role_permissions`, `organization_staff`,
`app_meta`. The declarations mirror the shipped migration **exactly** — column names,
nullability, defaults, unique constraints, and the two `organization_staff` indexes
(`idx_staff_org`, `idx_staff_user`) are identical, because this schema is what
`drizzle-kit generate` diffed to produce the baseline migration.

Notable decisions:

- **Boolean columns** — `is_system_role` / `is_super` use `integer('…', { mode: 'boolean' })`,
  so TypeScript sees `boolean` while SQLite stores `0`/`1` (matching the legacy `DEFAULT 0`).
  Repository mappers no longer need a `=== 1` conversion.
- **No FK constraint on `users`** — a User is global (ADR 0001); the org binding lives in
  `organization_staff`. Preserved unchanged from the shipped schema.
- **`app_meta`** stays `key TEXT PRIMARY KEY, value TEXT NOT NULL` — the remembered-login store.
- **`schema/index.ts`** re-exports the tables, exposes a combined `schema` object (future
  modules append their tables here), and declares the `relations` config via
  `defineRelations(schema, (helpers) => ({ … }))`.

Review-worthy points on the relations API:

- In `drizzle-orm@1.0.0-rc.4` the relational config API is `defineRelations`; relation
  helpers are keyed by **snake_case property names** of the helper schema (e.g.
  `helpers.roles.organization_id`, never `organizationId`).
- Every relation must pass explicit `from`/`to` column pairs in this rc — auto-inference
  throws at module load ("not enough data provided to build the relation").
- The relations are declared for schema completeness; **repositories do not use
  `db.query.*`** (the relational API). The ORM convention here is the query builder with
  explicit `.innerJoin(...)` — see §4.

## 3. Connection layer — `src/main/db/connection.ts`

`getDrizzle()` lazily builds the Drizzle instance over the same `DatabaseSync` singleton
and caches it:

```ts
export type DrizzleDb = NodeSQLiteDatabase<typeof relations>

export function getDrizzle(): DrizzleDb {
  if (!drizzleDb) drizzleDb = drizzle({ client: getDb(), relations })
  return drizzleDb
}
```

- **Node-sqlite rc.4 config:** `drizzle()` for the node-sqlite driver no longer accepts a
  `schema` option (`Omit<DrizzleConfig<…>, 'schema'>`) — the relational config is wired via
  `relations` instead. `DrizzleDb` is typed from `typeof relations`.
- **Shares the connection, shares transactions.** Because the builder binds to the same
  `DatabaseSync`, statements issued inside `withTransaction(fn)` participate in the enclosing
  transaction; repositories must never call `db.transaction()` (the use case owns the
  boundary).
- The cached instance is reset to `null` in `openDatabase` / `closeDatabase` / `setDatabase`,
  so the per-test `:memory:` swap in the test harness keeps working unchanged.
- `withTransaction` (BEGIN IMMEDIATE / SAVEPOINT nesting) is untouched — it is the atomicity
  enforcement point described in `architecture.md` §3.

## 4. Repositories — `src/main/repositories/identity.ts`

Every repository method was rewritten from prepared statements to the Drizzle query builder,
**with public signatures unchanged** (the application layer and existing tests did not need
to change). Row → entity mapping (`mapOrg`, `mapUser`, `mapRole`, `mapStaff`) is retained;
boolean-mode columns now arrive as real booleans.

Review-worthy decisions:

- **Explicit joins everywhere** — e.g. `staffRepo.findActiveForLogin` and
  `existsWithOwnerCredentials` use `.innerJoin(users, …)` / `.innerJoin(roles, …)` with
  column-prefixed select aliases (`u_id`, `r_id`, `r_is_super`, …). This preserves the
  alias-collision fix documented in `identity-module.md` (the old `SELECT u.*, r.*` let the
  later role column win on shared names like `id`/`status`).
- **Case-insensitive lookups stay in SQL** — `eq(sql\`lower(${users.email})\`, email)` so the
  ORM emits the same `LOWER()` compare the shipped statements did.
- **`roleRepo.findPermissionCodes`** keeps the super short-circuit: an `is_super` role reads
  the whole catalog from `permissions`; otherwise it joins `role_permissions`.
- **`appMetaRepo.set`** uses `onConflictDoUpdate` (Drizzle's upsert) so the remembered login
  stays idempotent.

## 5. Migrations — drizzle-kit generated, `?raw` runner

### 5.1 `drizzle.config.ts` + the generated migration

- `drizzle.config.ts` — `dialect: 'sqlite'`, `schema: './src/main/db/schema/index.ts'`,
  `out: './src/main/db/migrations'`. The `url` is a dummy value (the runner executes the SQL,
  not drizzle-kit migrate). We only ever `npx drizzle-kit generate` (never `push`); the
  packaged app applies migrations at startup via the `?raw`-bundled runner.
- `npx drizzle-kit generate` produced `src/main/db/migrations/20260817133412_identity/` with
  `migration.sql` + `snapshot.json`. drizzle-kit rc.4 emits **one folder per migration** (no
  `meta/_journal.json`), and the SQL file separates statements with
  `--> statement-breakpoint` marker lines that are **not valid SQL** — the runner must split
  on them.

### 5.2 `src/main/db/migrations.ts`

`migrations.ts` bundles the generated SQL via a Vite `?raw` import, so no `.sql` files need
to be copied beside the packaged app:

```ts
import identitySql from './migrations/20260817133412_identity/migration.sql?raw'
```

(`src/main/env.d.ts` declares `declare module '*?raw'` for TypeScript.)

- **Statement splitting** — `applySql` splits the raw file on
  `/^\s*--> statement-breakpoint\s*$/m` and `db.exec`s each statement independently.
- **Atomic + idempotent** — the whole run sits inside `withTransaction`; `schema_migrations`
  (`version`, `name`, `applied_at`) records each version only after its SQL succeeds. SQLite
  DDL is transactional, so a failing migration rolls the run back.
- **Legacy reconciliation** — existing databases created by the pre-Drizzle runner already
  carry versions 1 (`identity_tenancy`) and 2 (`app_meta`) in `schema_migrations`, and their
  tables are already present. If `organizations` exists and version 0 is not recorded, the
  runner **marks version 0 applied without re-executing it** (the drizzle baseline matches
  what legacy already shipped). A fresh DB applies version 0 normally.

Review-worthy points:

- The `?raw` import path is relative to `src/main/db/migrations.ts` — `./migrations/...`.
  A `../migrations/...` path resolved outside the source tree and broke vitest's resolver
  (a real build/debug cycle this pass hit).
- The generated SQL differs cosmetically from the plan's `0000_identity.sql` example
  (folder-per-migration layout, backtick-quoted identifiers, named constraints such as
  `organizations_slug_unique`); the runner is written against the actual generator output,
  not an assumed layout.

## 6. Shared contracts — `src/shared/contracts/`

The canonical, shared-by-all-layers types. `tsconfig.node.json` and `tsconfig.web.json`
both include `src/shared/**/*`.

- **`errors.ts`** — `ERROR_CODES` (17 stable codes: VALIDATION_ERROR, NOT_FOUND, CONFLICT,
  UNAUTHENTICATED, PERMISSION_DENIED, INVALID_STATE_TRANSITION, six billing/finance codes,
  DUPLICATE, INTERNAL_ERROR), `ErrorCode`, the wire payload `IpcError { code, message,
  details? }`, the discriminated envelope `IpcResult<T> = { ok: true; data } | { ok: false;
  error }`, and `ApiError` + `isApiError` (what preload re-throws).
- **`identity.ts`** — `SessionContext` (with `permissions: string[]`), its mirror
  `sessionContextSchema`, and the boundary Zod schemas + inferred input types for setup,
  login, createStaff, and checkOrganizationExists. Boundary schemas validate **shape**
  (presence, length, primitives) only; domain rules (mobile format, password length,
  uniqueness) stay in the application layer so the shipped behavior is preserved.
- **`ipc.channels.ts`** — `IPC_CHANNELS` constant + `IpcChannel` union; never hard-code a
  channel string in a handler or the preload bridge again.
- **`money.ts` / `paging.ts`** — minimal primitives for the upcoming business modules
  (integer-cents money, stable paging shape).

## 7. Coded IPC boundary — errors, `handle.ts`, preload

### 7.1 `src/main/domain/errors.ts`

Rewritten to a coded taxonomy. `DomainError` (base) carries `readonly code: ErrorCode`
(defaults to INTERNAL_ERROR); subclasses `NotFoundError`, `ValidationError`,
`UnauthenticatedError`, `UnauthorizedError` (→ UNAUTHENTICATED, for login failures),
`ForbiddenError` (→ PERMISSION_DENIED, with the offending `permissionCode`),
`ConflictError`, `InvalidStateTransitionError`. `requireSession` now throws
`UnauthenticatedError` (known-gap #5 closed).

### 7.2 `src/main/ipc/handle.ts`

`handle()` wraps every `ipcMain.handle` so a thrown error **never** crosses the IPC boundary
through Electron's default serialization (which leaks `Error invoking remote method
'identity:login': DomainError: …`). Two overloads:

- `handle(channel, fn)` — pass-through (e.g. `identity:session`, `identity:status`).
- `handle(channel, schema, fn)` — validates the single input argument with the Zod boundary
  schema **before** the application layer runs; a malformed payload is rejected as
  VALIDATION_ERROR without invoking `fn`.

Every handler resolves to `IpcResult<R>`: `{ ok: true, data }`, or `{ ok: false, error }`
where `DomainError` keeps its own code and anything else (Error, non-Error throw) maps to
INTERNAL_ERROR (with a generic message for non-Error throws). `toIpcError` is the single
mapping point.

### 7.3 `src/main/ipc/identity.ts` + `src/preload/`

- `ipc/identity.ts` — registrations use `IPC_CHANNELS.*` constants and the shared Zod
  schemas; `identity:session` returns `SessionContext | null` (no schema, no session
  required).
- `src/preload/index.ts` — `contextBridge`-exposed `window.api`; each call
  `ipcRenderer.invoke`s and **unwraps the envelope**, re-throwing `new ApiError(code,
  message, details)` on `{ ok: false }` so the renderer keeps its throw-style API and
  branches on `error.code`.
- `src/preload/index.d.ts` — imports `SessionContext` / input types / `ApiError` /
  `IPC_CHANNELS` from shared contracts (no duplicate declarations — known-gap #6 closed).

## 8. Permission catalog + seeding

- **`src/main/db/permissions.ts`** — catalog expanded to the business modules: identity
  codes plus `lead.*`, `plan.*`, `offer.*`, `membership.*`, `invoice.*`, `payment.*`,
  `refund.*`, `credit.*`, `report.view`, `backup.manage`, `settings.manage`. `PermissionCode`
  and `ALL_PERMISSION_CODES` derive from it; new codes are additive (super roles inherit them
  automatically).
- **`src/main/db/seed.ts`** — rewritten in Drizzle: `seedPermissions()` uses
  `onConflictDoNothing` (same `INSERT OR IGNORE` semantics, so re-running after a catalog
  extension is a no-op for existing codes); `seedRolesForOrganization` runs in its own
  `withTransaction` (safe nested via SAVEPOINT) and inserts each role + its
  `role_permissions` links. `SEED_ROLES` grants follow the Module 15 worked example mapped
  onto the expanded catalog (Manager = full business access + org/user/role view; Sales,
  Front Desk, Finance = scoped subsets). The redundant helper this refactor removed also went
  away.

## 9. Test strategy

New files (all under `tests/`, 33 new cases — suite is now **118 tests / 12 files**):

- **`tests/db/migrations.test.ts`** — fresh DB applies version 0 and creates all seven
  tables; `schema_migrations` records `(0, 'identity')`; idempotency (second run applies
  nothing); **legacy reconciliation** (pre-existing `organizations` + versions 1/2 → version 0
  marked applied, drizzle tables *not* created); the "schema_migrations exists but no legacy
  tables" branch.
- **`tests/shared/contracts.test.ts`** — code catalog invariants (value === key, no
  duplicates), `ApiError`/`isApiError` narrowing, and accept/reject cases for all four
  boundary Zod schemas (over-length name, empty password, missing required fields).
- **`tests/main/ipc/handle.test.ts`** — mocks `electron` (`vi.hoisted` + `vi.mock`) so the
  wrapper is testable in plain Node. Verifies the `{ ok, … }` envelope on success, domain
  → stable-code mapping, Error → INTERNAL_ERROR, non-Error throw → INTERNAL_ERROR with the
  generic message, and VALIDATION_ERROR before the handler runs (fn not called). This closes
  known-gap #9 (no IPC/preload tests).
- **`tests/main/repositories/identity.test.ts`** — regression parity for the Drizzle
  retrofit: org/user/role/appMeta/staff CRUD, field mapping, case-insensitive owner-credential
  check, super vs non-super permission resolution, ACTIVE-only login/membership filters
  (incl. hiding a membership once a row is inactive).

Quality gates are green: `npm run typecheck` (node + web) exit 0, `npm run lint` exit 0
(3 real errors fixed along the way — two missing `cn()` return types and a `prefer-spread`
on `.apply()`; the 24k remaining lint warnings are the repo-wide pre-existing CRLF
line-ending prettier warnings), `npm test` 118/118.

## 10. Review concerns / trade-offs

1. **Node-sqlite `drizzle()` config differs from stable-orm docs** — in `drizzle-orm@1.0.0-rc.4`
   the node-sqlite driver no longer takes `schema`; the relational config goes through
   `relations`. Any upgrade to a stable release must re-check this signature.
2. **`defineRelations` helper columns are snake_case and need explicit `from`/`to`** — easy to
   get wrong; both are guarded by typecheck + the migration-folder tests.
3. **`?raw` bundling couples the runner to the generator's layout** — a drizzle-kit upgrade
   that changes the folder shape or the breakpoint marker would need a runner update.
   The runner is intentionally narrow (split on breakpoints, track versions).
4. **Drizzle rc-4 is a pre-1.0 dependency** — pinned by the requirement that stable
   `drizzle-orm` has no `node:sqlite` driver export at the version available. Worth revisiting
   once stable supports `node:sqlite`.
5. **Boundary Zod schemas are deliberately lenient** — shape-only validation keeps app-layer
   rules intact; do not tighten them without re-checking the application-layer validators.
6. **`DrizzleDb` type follows `typeof relations`** — adding tables requires registering them
   in both `schema` and `relations`; the type is only as complete as that registration.