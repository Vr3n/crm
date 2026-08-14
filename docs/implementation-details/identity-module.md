# Identity Module — Per-File Review

A senior-review walkthrough of each file added or changed for Modules 14/15. Files are
grouped by layer. For each: responsibility, notable decisions, and review concerns.

## Domain layer

### `src/main/domain/identity.ts`
Entity shapes and the `SessionContext`. Pure TypeScript, no DB imports — the renderer can
import `SessionContext` safely.

- `Organization`, `User`, `Role`, `OrganizationStaff` mirror the v2 schema.
- Discriminated union statuses (`OrgStatus`, `UserStatus`, `StaffStatus`) are plain string
  unions, not TS enums, to stay serializable across IPC and match the DB `TEXT` columns.
- `SessionContext` carries `permissions: PermissionCode[]` and `isSuper` so the command layer
  never needs to re-derive rights. It is deliberately denormalized (org name/slug, user name)
  to feed the UI with one object.

### `src/main/domain/errors.ts`
Minimal error hierarchy. `ForbiddenError` stores `code` for targeted UI handling. Kept free
of framework imports.

## DB layer

### `src/main/db/connection.ts`
Covered in `architecture.md`. Key points for review: the mutable singleton (`setDatabase`),
the PRAGMAs applied on open, and the SAVEPOINT-nesting `withTransaction`. The savepoint
sequence counter is module-level and monotonic, which is fine because it only needs
uniqueness within one outer transaction.

### `src/main/db/migrations.ts`
Versioned migrations as inline TS strings. A `schema_migrations` table tracks applied
versions; `runMigrations` skips already-applied versions and is idempotent.

- **Migration 1** (`identity_tenancy`): `organizations`, `users`, `roles`, `permissions`,
  `role_permissions`, `organization_staff`. The scaffold's demo tables were removed rather
  than carried forward.
- **Migration 2** (`app_meta`): a minimal `key TEXT PRIMARY KEY, value TEXT` store for
  app-level settings. v1 uses it to hold the remembered login (`remembered_session`), keeping
  session persistence inside the SQLite file rather than a loose file on disk.

Notable schema decisions:
- `users` has **no** `organization_id` — a User is global; the org binding lives in
  `organization_staff`. This realizes ADR 0001 (global User + OrganizationStaff join) and
  avoids the word "Membership" for the join (reserved for the gym product in Module 02).
- `organization_staff` has `UNIQUE (organization_id, user_id)` — one user, one role, per org
  (Module 15 "one active role per user per organization"). A user who needs multiple roles
  requires multiple users or a future role-combination mechanism.
- `roles` has `UNIQUE (organization_id, name)`; `permissions.code` is globally `UNIQUE`.
- `role_permissions` uses `ON DELETE CASCADE` from both sides.
- `organization_staff.status` supports the `INVITED` lifecycle (future), though v1 only
  creates `ACTIVE` rows.
- Emails are normalized to lowercase at the application layer; **there is no `UNIQUE` on
  `users.email`** — uniqueness is scoped to `(organization_id, email)` via
  `staffRepo.emailExistsInOrganization`, matching the multi-tenant design (same email across
  different orgs is legal). Reviewer note: the uniqueness check is app-level, not a DB
  constraint, so it is only as strong as the code path that calls it (`known-gaps.md`).

### `src/main/db/permissions.ts`
The canonical catalog: `PERMISSIONS` (object of `code` constants), `PermissionCode` (derived
union type), `ALL_PERMISSION_CODES`. Naming convention `<domain>.<verb>`. New permissions are
added here **and** reach the DB via `seedPermissions`.

### `src/main/db/seed.ts`
`SEED_ROLES` data + `seedPermissions()` + `seedRolesForOrganization(organizationId)`. The
latter wraps its own `withTransaction` so it is safe to call from within a larger
transaction (the savepoint design in `connection.ts` makes this correct). It is idempotent
per-organization only in the sense that it creates roles; the `UNIQUE(organization_id, name)`
constraint prevents duplicate role creation if called twice.

## Auth layer

### `src/main/auth/password.ts`
scrypt hashing + constant-time verification (see `architecture.md` §6).

### `src/main/auth/session.ts`
In-memory session store + guards:

- `setSession`/`getSession` — trivial, but the mutation boundary for tests and logout.
- `requireSession()` — throws `ForbiddenError('user.view')` when null. Using a permission
  code as the message is a minor conflation (it is really an authentication error, not an
  authorization error) — a reviewer may prefer a dedicated `UnauthorizedError` here. It is
  functionally correct because both map to "deny", but the semantics are worth a look.
- `requirePermission(code)` — the enforcement point; super short-circuits.
- `currentOrganizationId()` — session-sourced org stamp.

### Session Persistence (remembered login)

The session store is in-memory, so by itself a restart loses the login. To avoid forcing a
re-login on every launch, the app persists a *remembered login* and rehydrates it at startup:

- **DB shape** — `app_meta.remembered_session` holds a small JSON record, `{ organizationId,
  userId }`. Only the identity *keys* are stored; the `SessionContext` is **never snapshotted**.
- **Re-derive, don't snapshot** — on startup the context is rebuilt from live DB data via
  `buildSessionContext`. Because Role→Permission mappings are editable data, rebuilding each
  launch means a revoked permission cannot silently persist across restarts until the next
  login.
- **Re-validation rule** — restore succeeds only when the single joined membership query
  (`staffRepo.findActiveMembership`) returns a row, i.e. the **organization, user, AND
  membership are all `ACTIVE`**. One query (not three lookups) avoids a TOCTOU gap and
  degrades to `null` whether a row is disabled or deleted. Any failure → `forgetLogin()` →
  login screen.
- **`logout()`** clears the in-memory session and the remembered record, so the app only
  auto-logins for users who did not sign out.
- **Startup ordering** — `restoreRememberedLogin()` runs in `main/index.ts` *before*
  `createWindow()` (awaited in the async `whenReady` sequence, after migrations + permission
  seeds). The renderer's first `identity.status()` therefore already sees `AUTHENTICATED` —
  no login-screen flash. `forgetLogin()` swallows its own errors so a persistence failure can
  never crash startup (worst case: a stale row that simply fails validation again).

## Application layer

### `src/main/application/identity.ts`
The commands plus the session-persistence helpers. This is where the bulk of reviewable logic
lives.

- **`getAuthStatus()`** — derives `SETUP_REQUIRED` / `LOGIN_REQUIRED` / `AUTHENTICATED` from
  org count + session. Drives the renderer's first screen.
- **`checkOrganizationExists(input)`** — a pure read used by the setup screen to pre-validate
  the org name. Returns `true` when an organization exists under the same name AND (the owner
  email matches OR the organization mobile matches). No session/`requirePermission` required
  (runs pre-login); it normalizes email (lowercase) and mobile (`IndianMobileNumber.tryParse`)
  before delegating to `organizationRepo.existsWithOwnerCredentials`. Mirrors the app-level,
  code-enforced uniqueness style used elsewhere in the module. Note: v1 is single-install, so
  in practice an existing org sends the setup screen to LOGIN_REQUIRED; the check is groundwork
  for multi-tenant and a friendly error path.
- **`setupOrganization(input)`** — validates (name/owner/password ≥8, slug format, and the
  required mobile number via `IndianMobileNumber.parse`), then in
  one `withTransaction`: guards single-org (`count > 0` ⇒ reject), creates the org,
  `seedRolesForOrganization`, looks up the `Owner` role, creates the Owner user, creates the
  staff membership, and returns a fully-built `SessionContext`. The single-org guard **inside**
  the transaction prevents a race where two setup calls both pass the pre-check.

### `src/main/domain/phone.ts` — `IndianMobileNumber`
A domain value object that validates and normalizes the required organization mobile number
to a bare 10-digit form (`9876543210`). Per TRAI/DoT allocation a valid number is exactly 10
digits with a leading `6-9`; `parse` accepts optional country-code prefixes (`+91`, `91`,
`0091`, `0`) and formatting separators (space/hyphen/parens), strips them, and throws
`ValidationError` on blank or invalid input. `tryParse` returns `null` instead of throwing.
Stored value is always the 10-digit form.
- **`login(input)`** — lowercases email, resolves the single org, calls
  `staffRepo.findActiveForLogin`, verifies the password with constant-time compare, builds +
  stores the session. Unknown email and wrong password both raise `UnauthorizedError` (no
  user-enumeration signal).
- **`createStaffMember(input)`** — the concrete vertical-escalation test: gated by
  `requirePermission(USER_CREATE)`. Validates, checks org-scoped email uniqueness, resolves
  the role by name, then atomically creates user + staff in one transaction.
- **`rememberLogin`/`forgetLogin`/`restoreRememberedLogin`/`logout`** — the session-persistence
  commands (see "Session Persistence" above). `setupOrganization` and `login` call
  `rememberLogin` after building the context; `logout` clears both the in-memory session and
  the remembered record.

Helper `buildSessionContext` (lines 152–176) materializes the session; `getStaffRow` is a
private read used by it.

Review-worthy points:
- `setupOrganization` returns a `SessionContext` and also calls `setSession` (via
  `buildSessionContext`). Returning-and-side-effecting is convenient for the UI but slightly
  impure; the renderer also re-reads via `identity:session`, so the dual path is harmless.
- Password length is validated (≥8) but there is **no** password-complexity or
  rate-limiting/brute-force protection (`known-gaps.md`). For a local single-user admin tool
  this is a conscious, documented trade-off.

## Repositories

### `src/main/repositories/identity.ts`
Thin data access with explicit row → entity mappers (`mapOrg`, `mapUser`, `mapRole`,
`mapStaff`). Repos are plain object literals with prepared statements over the singleton.

- **`roleRepo.findPermissionCodes(roleId)`** — the super short-circuit: for an `is_super`
  role it returns every code from `permissions`; otherwise it joins `role_permissions`.
- **`appMetaRepo`** — tiny `get`/`set`/`delete` over `app_meta`; `set` uses an upsert so the
  remembered login is idempotent.
- **`staffRepo.findActiveMembership(orgId, userId)`** — the single joined query backing the
  restore path (see "Session Persistence"). Filters `os.status`, `u.status`, and `o.status`
  all `= 'ACTIVE'` in one statement.
- **`organizationRepo.existsWithOwnerCredentials({ name, email, mobile })`** — one query for the
  setup-screen "organization already exists" check: an org row where `name` matches AND
  (`mobile_number` matches OR an `organization_staff` member whose role is super (`is_super = 1`,
  i.e. Owner/Admin) has the matching email, case-insensitive). `is_super` is the owner proxy;
  non-owner staff emails do not satisfy it.
- **`staffRepo.findActiveForLogin`** — this query uses **explicit column aliases** (`u_id`,
  `r_id`, `u_status`, …) rather than `SELECT u.*, r.*`. That is a deliberate fix: `SELECT
  u.*, r.*` collides on shared column names (`id`, `status`), and node:sqlite's object
  mapping lets the later (role) column win, silently producing a **wrong user/role mapping**.
  This was a real bug the test suite caught (see `tests-and-quality.md`).

## IPC + preload + main entry

- **`src/main/ipc/identity.ts`** — thin `ipcMain.handle` registrations for `identity:*`
  channels; `identity:logout` calls the application `logout()` (clears session + remembered
  login). All handlers go through `src/main/ipc/handle.ts`, which returns a `{ ok, data |
  message }` envelope so errors never leak channel names / error classes to the renderer.
- **`src/main/preload/index.ts`** — `contextBridge`-exposed `window.api.identity`.
- **`src/main/preload/index.d.ts`** — typed surface for the renderer.
- **`src/main/index.ts`** — app bootstrap: `openDatabase(userData path)` →
  `runMigrations()` → `seedPermissions()` → `await restoreRememberedLogin()` →
  `registerIdentityIpc()`. Order matters: migrations precede seeding; permissions are seeded
  before any org setup (so role→permission links resolve); the remembered login is restored
  before the window loads so the first `identity.status()` already reports `AUTHENTICATED`.

## Renderer (auth gate)

- `src/renderer/src/components/AuthGate.tsx` — renders the setup form (no org) or login form
  (org, no session) via `window.api.identity.status()/setup()/login()`, then reveals the app.
- `src/renderer/src/main.tsx` — creates a `QueryClient` (defaults `retry: false`,
  `refetchOnWindowFocus: false`) and wraps the app in `QueryClientProvider`; this is the app's
  first TanStack Query integration.
- `src/renderer/src/components/AuthGate.tsx` — server state is managed with TanStack Query, not
  manual effects. `status` and `session` are dependent queries (`session` runs only when
  `status === 'AUTHENTICATED'`); a minimal effect just forwards a resolved session to the parent
  (`onAuthenticated`). The screen (`setup`/`login`) is derived from the status query, with a tiny
  `manualPhase` override for the "Sign in" / "Set up this machine" toggle (reset on remount via
  logout). `orgExists` is `status === 'LOGIN_REQUIRED'` and hides the setup toggle.
- The two forms are built on `@tanstack/react-form`.
  A small `AuthField` wrapper wires each field to a reactive `<Input>`: it derives
  `invalid = validate(value) && evaluated` and `valid = !validate(value) && evaluated`, then sets
  `aria-invalid` / `data-valid` **directly on the input**. `evaluated` is true once the user has
  blurred, submitted, **or** the value is complete enough to judge live (`completeWhen`, e.g. a
  10-digit mobile), so borders react the moment a value is committed or complete without ever
  flashing red mid-typing of incomplete free-text. Every field shows a specific, actionable error
  (e.g. mobile → "Indian mobile numbers start with 6, 7, 8, or 9"), a realistic placeholder
  (`Jane Doe`, `jane@example.com`), success (green border + check), a live 10-digit mobile counter,
  and a live password-strength meter plus an "At least 8 characters" requirement tick. On successful
  submit the button flips to a green success state (`LoadingButton` `success`), announces via an
  `aria-live` region, and waits ~700 ms before revealing the app — so completion is actually seen.
  Two additional guards keep setup honest:
  - **"Organization already exists" check** — a debounced (`useDebouncedValue`, ~500 ms)
    `useQuery` on the org name + owner email + mobile calls `identity.checkOrganizationExists`,
    gated by `enabled` so it only fires when all three are complete/valid. The query key carries
    the debounced inputs, so a fetch only runs when they change; `isFetching` tracks pending and
    `isSuccess && data` sets `existsError` ("An organization with this name already exists"),
    surfaced under the org-name field via the `extraError` prop and gating submission. No manual
    timers or cancellation — TanStack Query owns the lifecycle.
  - **Submit disabled until valid** — the `LoadingButton` on *both* forms is `disabled` until the
    form is genuinely valid (`setupValid`/`loginValid` derived from each field's `completeWhen` +
    validator, plus `!existsError && !checkingExists` for setup). TanStack's `canSubmit` alone was
    insufficient: it is true while a form is still untouched (empty), which contradicts
    "disabled by default". The "Set up this machine" toggle is hidden when an organization already
    exists (`orgExists` from the status query), so the user can never reach setup again.
- `src/renderer/src/components/ui/field.tsx` — shadcn-style `Field` family (`Field`,
  `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`). Follows the shadcn convention:
  the caller owns the control and sets `aria-invalid`/`data-valid` on it directly (no
  `cloneElement`), while `Field` renders the label and a reserved helper line so error/hint swaps
  never shift the layout. `FieldError` accepts the TanStack `errors` array shape.
- `src/renderer/src/components/ui/input-group.tsx` — `InputGroup` + `InputGroupAddon` for
  leading icons, the mobile counter, and the password visibility toggle.
- `src/renderer/src/components/ui/input.tsx` — adds a `data-valid` success variant (green border
  + green focus ring) alongside the existing `aria-invalid` destructive variant.
- `src/renderer/src/components/ui/password-strength.tsx` — live 3-segment Weak/Okay/Strong meter.
- `src/renderer/src/App.tsx` — gates the main UI behind `AuthGate`.
- `src/renderer/src/components/Sidebar.tsx` — shows the signed-in user/role and a working
  sign-out that calls `window.api.identity.logout()`.

Note: the pre-existing scaffold `Input` (double-quote style, missing explicit return type) still
carries the one remaining ESLint error in `src/renderer/src/components/ui/`; it is not introduced
by this pass.