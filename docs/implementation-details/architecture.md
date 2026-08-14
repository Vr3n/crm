# Architecture — Identity & Tenancy

This document describes the layered architecture of the identity/tenancy foundation and,
critically, *where* the security and atomicity rules are enforced. A senior reviewer should
be able to verify each architectural rule in Module 08 / Module 06 / Module 15 against a
concrete file and line in this doc.

## 1. Layers and the flow of a request

The renderer never touches SQLite directly. Every operation flows through one direction:

```
Renderer (React)
   │  window.api.identity.*          ← typed, context-isolated, exposed via preload
   ▼
Preload (src/preload/index.ts)
   │  ipcRenderer.invoke(channel, input)
   ▼
Main process IPC (src/main/ipc/identity.ts)
   │  ipcMain.handle(channel, …)     ← thin: delegates straight to the application layer
   ▼
Application layer (src/main/application/identity.ts)
   │  validates → requirePermission() → withTransaction(...) → repositories
   ▼
Repositories (src/main/repositories/identity.ts)
   │  prepared statements against the singleton DatabaseSync
   ▼
SQLite (node:sqlite, node:sqlite node:sqlite)
```

- **Main process = trust boundary.** `src/main/index.ts:48` opens the DB at
  `app.getPath('userData')/gym-crm.db`, runs migrations, seeds permissions, then
  `registerIdentityIpc()` (`index.ts:55`) is the only door the renderer has to the database.
- **IPC handlers are deliberately thin.** `src/main/ipc/identity.ts` does no business logic;
  it forwards to the application functions. This keeps the authorization and transaction
  logic out of the transport layer and unit-testable in plain Node (no Electron).

## 2. The connection layer is Electron-free (testability)

`src/main/db/connection.ts` imports only `node:sqlite`. `openDatabase(path)` accepts a file
path **or `':memory:'`**, applies `journal_mode = WAL`, `foreign_keys = ON`, and
`busy_timeout = 5000`, and installs the process-wide singleton. The Electron-specific
`userData` path is resolved by the caller (`src/main/index.ts:48`), not by the connection
layer.

**Why:** the whole application/repository layer can run in a plain Node test runner against
a fresh `:memory:` database with no Electron harness. This is what makes the 50-test suite
fast and hermetic.

The singleton is mutable (`setDatabase`/`closeDatabase`) specifically so tests can swap in a
fresh in-memory DB per test. This is the main trade-off: a process-wide mutable singleton is
not ideal for a multi-window/multi-tenant process, but v1 is a single-organization local
desktop app and the API is intentionally narrow.

## 3. Atomicity: `withTransaction` with SAVEPOINT nesting

`src/main/db/connection.ts:53` implements the "every multi-table business operation is one
atomic transaction" rule (Module 06 rule #2):

```ts
withTransaction(fn) {
  isOuter = txDepth === 0
  marker  = isOuter ? null : `sp_${++savepointSeq}`
  exec(isOuter ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${marker}`)
  txDepth++
  try { r = fn(); exec(isOuter ? 'COMMIT' : `RELEASE SAVEPOINT ${marker}`) }
  catch (e) { exec(isOuter ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${marker}`); release; throw }
}
```

- `BEGIN IMMEDIATE` at the outermost level acquires a write lock up front (avoids
  deadlock escalation when two nested steps both write).
- **Nested calls become SAVEPOINTs.** This matters because `seedRolesForOrganization`
  (`src/main/db/seed.ts:61`) wraps itself in a transaction but is invoked from inside
  `setupOrganization`'s outer `withTransaction` (`src/main/application/identity.ts:98`).
  A naive "BEGIN inside BEGIN" fails with "cannot start a transaction within a transaction" —
  this was a real bug caught by the tests (see `tests-and-quality.md`). The savepoint design
  means any domain/repository function can safely wrap its own work regardless of whether a
  caller already opened a transaction.
- `txDepth`/`savepointSeq` are module-level counters; only the outermost call issues
  BEGIN/COMMIT. Savepoint names are made unique via the sequence counter, which SQLite
  requires within a single outer transaction.

## 4. RBAC enforcement: permissions-as-data, enforced at the command layer

Model (see `src/main/db/migrations.ts` v2 and `src/main/domain/identity.ts`):

```
organizations ─┐
roles ─────────┼─ organization_id (org-scoped)          permissions ── code (global catalog)
role_permissions: (role_id, permission_id)              role_permissions: role_id ↦ permission_id
organization_staff: (organization_id, user_id, role_id) — the User↔Org↔single-Role join
users ─────────┘   (global, no org_id)
```

Enforcement points, in order:

1. **Every command calls `requirePermission(code)` first.** `requirePermission` in
   `src/main/auth/session.ts:27` reads the resolved permission set off the `SessionContext`.
   It checks **permission codes, never role names** (Module 15 rule #4). Example:
   `createStaffMember` gates on `PERMISSIONS.USER_CREATE`
   (`src/main/application/identity.ts:51`).
2. **Super short-circuits.** `requirePermission` returns immediately if `session.isSuper`.
   Owner/Admin are the only `is_super` roles (`src/main/db/seed.ts:18-19`). This is why they
   need no enumerated `role_permissions` rows — `roleRepo.findPermissionCodes`
   (`src/main/repositories/identity.ts:167`) returns the whole catalog for a super role,
   which also means a new permission added to the catalog is immediately available to
   super roles with no data migration.
3. **No session ⇒ denied.** `requireSession` (`session.ts:15`) throws `ForbiddenError`
   before any code is consulted, so even a perfectly-enumerated role cannot act without a
   login.
4. **Organization identity comes from the session, never a request field.**
   `currentOrganizationId()` (`session.ts:36`) returns the session's org id, which every
   org-scoped query uses (e.g. `emailExistsInOrganization`, `roleRepo.findByName`). The
   renderer cannot spoof `organization_id` — it isn't accepted as input.

### Error taxonomy (`src/main/domain/errors.ts`)

- `DomainError` base; subclasses `NotFoundError`, `UnauthorizedError`, `ValidationError`,
  `ForbiddenError`. `ForbiddenError` carries the offending `code` so the UI can react
  specifically. Kept dependency-free so both main and renderer can import them.

## 5. Session model

A `SessionContext` (`src/main/domain/identity.ts:52`) is the fully-resolved, denormalized
"who am I + what org + what role + what can I do" object. `login`/
`buildSessionContext` (`src/main/application/identity.ts:152`) materialize it once and stash
it in the in-memory session store (`src/main/auth/session.ts`). This avoids re-querying the
role/permission join on every IPC call.

- It is **not** a JWT. The in-memory `SessionContext` is re-derived on every launch from a
  remembered login (`{ organizationId, userId }` in the `app_meta` table) via
  `restoreRememberedLogin` before the window loads, so the renderer's first `identity.status`
  already reports `AUTHENTICATED`. `identity:logout` clears both the in-memory session and the
  remembered record.
- Trade-off: only the identity *keys* are persisted, never the resolved context — the role/
  permission join is re-queried on each startup, which keeps the snapshot from going stale if
  Role→Permission mappings change.

## 6. Password handling (`src/main/auth/password.ts`)

- `hashPassword` → `scryptSync(plain, randomSalt(16 bytes), 64)`, stored as `salt:hash` hex.
- `verifyPassword` → constant-time `timingSafeEqual` on equal-length buffers; malformed stored
  values return `false`. Node's `crypto.scryptSync` has built-in per-instance key derivation
  cost; a future hardening pass can expose tunable `N/r/p` and move to `scrypt` (async).
- Passwords are normalized/validated at the application layer (min 8 chars) and never logged.

## 7. Seeding as data, not logic

- `src/main/db/permissions.ts` is the **single source of truth** for the catalog (code
  constants + `ALL_PERMISSION_CODES`). `seedPermissions` (`src/main/db/seed.ts:49`) mirrors
  it into the `permissions` table idempotently (`INSERT OR IGNORE`).
- `SEED_ROLES` (`seed.ts:17`) is plain data describing starter roles and their granted
  permission codes. Owner/Admin are `is_system + is_super`; Manager/Sales/Front Desk/Finance
  are ordinary editable rows. `seedRolesForOrganization` (`seed.ts:61`) materializes them and
  their `role_permissions` links inside a transaction.
- This keeps "policy" in the database so future UI can edit role permissions without a code
  deploy, while the *catalog itself* stays compiled (new codes are additive).

## 8. Renderer boundary and typed bridge

- `src/preload/index.ts` uses `contextIsolation` + `contextBridge` to expose a narrow
  `window.api.identity` surface (`setup/login/session/status/createStaff/logout`). No raw
  `ipcRenderer` is exposed to the renderer, and no other database surface exists yet.
- `src/preload/index.d.ts` mirrors the input/output shapes (`SetupOrganizationInput`,
  `SessionContext`, etc.) so the React side is fully typed against the bridge. Note there are
  two `SessionContext` declarations (preload `.d.ts` and `src/main/domain/identity.ts`); they
  are kept in sync manually — flagged as a known gap (`known-gaps.md`).
- `src/main/index.ts` does not use `sandbox: true` (it sets `sandbox: false` on the
  `BrowserWindow`, inherited from the scaffold). With `contextIsolation` and a narrow exposed
  API this is a defensible, common Electron configuration, but a reviewer may want the renderer
  sandbox enabled as hardening (`known-gaps.md`).