# Tests & Code Quality

This pass included a full test suite for the identity/tenancy + auth/RBAC logic, driven by
Vitest running against a fresh in-memory SQLite DB per test. The suite is not incidental —
it was written first-class because the security and atomicity claims above are only credible
if exercised.

## Test harness

`tests/helpers/db.ts` registers Vitest hooks:

- `beforeEach`: close DB → `openDatabase(':memory:')` → `runMigrations()` → `seedPermissions()`
  → `setSession(null)`.
- `afterEach`: clear session. `afterAll`: close DB.

This gives hermetic, order-independent tests despite the process-wide DB/session singletons.
Because `connection.ts` is Electron-free, no Electron harness is required.

`vitest.config.ts` (test script `npm test` = `vitest run`; `test:coverage` adds v8 coverage
over `src/main/**/*.ts`, excluding `index.ts`, `ipc/**`, and `db.ts`).

## Coverage (v8)

```
All files    92.75 Stmts / 81.37 Branch / 95.65 Funcs / 97.87 Lines
application/identity.ts   87.67 Stmts / 98.38 Lines
repositories/identity.ts  97.82 Stmts / 100 Lines
auth/*                     (password, session covered)
db/seed.ts               100 Stmts / 100 Lines
db/migrations.ts          90 Lines (branch-light: setup/teardown paths)
db/connection.ts          90.32 Stmts (uncovered: error branches)
```

Uncovered branches are mostly defensive `if (!row) return null` early-returns and the
`Database not initialized` guard in `connection.ts` — low-risk, but a reviewer may add
targeted cases if 100% is desired.

## Test files

- `tests/auth/password.test.ts` — hashing format (`salt:hash`), round-trip verify, wrong
  password rejection, malformed stored value rejection.
- `tests/domain/phone.test.ts` — `IndianMobileNumber`: valid formats (bare / `+91` / `91` /
  `0091` / `0` / separated), normalization to 10 digits, invalid first digit, wrong lengths,
  non-digits, non-Indian prefix, blank; `tryParse` and `toString`.
- `tests/auth/session.test.ts` — session lifecycle; `requireSession` throws when null;
  `requirePermission` grants/denies; **super short-circuits every code**; `currentOrganizationId`
  requires a session. (The `beforeEach`/`afterEach` session reset is registered at file scope —
  see the bug note below.)
- `tests/db/seed.test.ts` — full catalog inserted; `seedPermissions` idempotent; all starter
  roles created; Owner/Admin are `system + super`; others are not; super returns the whole
  catalog; Manager returns exactly its configured codes.
- `tests/identity/setup-login.test.ts` — auth-status transitions; setup creates exactly one
  org/user/staff and returns an Owner super session; second-org rejection; validation
  (empty name, short password, bad slug) leaves zero rows; slug derivation; login success /
  case-insensitive email / wrong password / unknown email / no-org; `createStaffMember`
  unknown-role leaves no partial user; **full rollback on mid-transaction failure**.
- `tests/identity/rbac.test.ts` — the authorization matrix: each seeded role resolves exactly
  its configured permission set; Owner (super) gets the whole catalog; vertical escalation
  (Manager/Sales/Front Desk/unauth all blocked from `createStaffMember`; Owner allowed); the
  command-layer guard (`requirePermission`) honors view-vs-create-vs-manage; org-scoped email
  uniqueness.
- `tests/identity/session-persistence.test.ts` — remembered-login lifecycle: setup/login
  remember, logout forgets; restore succeeds when org+user+membership are all ACTIVE; restore
  returns `null` and forgets when the org is suspended, the user is disabled, the membership
  row is removed, or the remembered user row is deleted entirely; nothing is restored before
  first setup; a malformed remembered record is forgotten.

## Bugs the suite caught (and the fixes)

These are the strongest justification for the tests. Three real defects were found and fixed:

1. **Nested transaction crash.** `seedRolesForOrganization` wrapped itself in
   `withTransaction` but is called inside `setupOrganization`'s transaction. Naive
   `BEGIN`/`COMMIT` produced `"cannot start a transaction within a transaction"` and broke
   org setup. Fix: `withTransaction` now uses **SAVEPOINTs** for nested calls, only the
   outermost issues `BEGIN IMMEDIATE`/`COMMIT`, and savepoints are uniquely named
   (`src/main/db/connection.ts`). Caught by `tests/identity/setup-login.test.ts` ("rolls back
   the whole transaction when any step fails") and the general setup flow.

2. **Silent wrong-role mapping from a column collision.** `findActiveForLogin` used
   `SELECT u.*, r.*`. `users` and `roles` share column names `id` and `status`; node:sqlite's
   object mapping lets the later (`roles`) column win, so the resolved **user id** silently
   became the **role id**. A Manager login then resolved to another user's role (e.g. Sales).
   Fix: explicit aliases (`u_id`, `r_id`, `u_status`, …) in `findActiveForLogin`
   (`src/main/repositories/identity.ts`). Caught by `tests/identity/rbac.test.ts` ("assigns
   each role exactly its configured permissions" and the escalation tests). The Owner test
   passed only by luck of ids, underscoring the value of data-driven role assertions.

3. **Test isolation leak.** `beforeEach(setSession(null))` was scoped inside one `describe`,
   so a session set by an earlier block leaked into later blocks, making
   `currentOrganizationId()` appear to work while unauthenticated. Fix: register the session
   reset at file scope in `tests/auth/session.test.ts`. (A harness defect, not app code.)

## Quality gates (all green)

- `npm run typecheck` — `tsc --noEmit` for both `tsconfig.node.json` and `tsconfig.web.json`.
- `npm test` — 78/78 passing.
- `npm run test:coverage` — coverage above.
- ESLint on `src/main/**/*.ts`, `src/preload/**`, `tests/**/*.ts` — **0 errors** (prettier
  warnings auto-fixed). The remaining scaffold warnings are in
  `src/renderer/src/components/ui/*.tsx` and `src/renderer/src/lib/utils.ts` (missing explicit
  return types) — pre-existing, not introduced here.
- `npx electron-vite build` — main/preload/renderer all build cleanly.

## Notes for reviewers

- The suite deliberately asserts the **security boundary** (escalation blocked, super
  short-circuit, unauthenticated denied) rather than only happy paths.
- Tests exercise the application + repository + auth layers directly; IPC and preload are
  excluded from coverage and are thin enough that manual verification is acceptable, though a
  small `ipc.test.ts` using `ipcMain`/`ipcRenderer` mock could be added (`known-gaps.md`).