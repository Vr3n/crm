# Known Gaps & Follow-ups

Deliberate limitations and next-sprint concerns, so a reviewer can judge scope rather than
discover surprises. None of these block the current single-org, local, offline scope.

## Functional / design gaps

1. **Email uniqueness is app-level, not a DB constraint.** `users.email` has no `UNIQUE`
   index; uniqueness is enforced by `staffRepo.emailExistsInOrganization` inside
   `createStaffMember`. A partial unique index (e.g. a generated `lower(email)` per org) would
   make it race-proof, but is awkward to express across the `users` + `organization_staff`
   join without denormalizing `organization_id` onto `users`. For single-process local access
   this is acceptable; revisit if concurrency increases.

2. **No login brute-force / rate limiting.** A local admin tool with strong local passwords is
   the accepted risk posture. Add exponential backoff or account-lock after N failures if the
   app ever syncs to a shared store.

3. **No password-complexity or reset/forgot-password flow.** v1 ships with ≥8-char minimums
   only. Owner password recovery is out of scope for a local install (delete the DB to reset).

4. **Session is in-memory and lost on restart** (`src/main/auth/session.ts`). Accepted for a
   desktop tool; a token/session persistence layer is a future option, but keeping auth state
   volatile is the simpler and arguably safer default.

5. **`requireSession` throws `ForbiddenError('user.view')` for an *unauthenticated* caller.**
   This is semantically an authentication failure masquerading as an authorization code. It
   works (both map to "deny") but is confusing. A dedicated `UnauthorizedError`/`unauthenticated`
   distinction would be cleaner and is worth a small refactor.

6. **Duplicate `SessionContext` declarations.** `src/preload/index.d.ts` and
   `src/main/domain/identity.ts` each declare a `SessionContext`. They are kept in sync
   manually; unifying on one canonical type (imported into the preload d.ts) would remove
   drift risk.

7. **Multiple roles per user per org are not modeled.** `UNIQUE (organization_id, user_id)`
   on `organization_staff` enforces exactly one role per user per org (Module 15). A user who
   legitimately holds two roles (e.g. Sales + Front Desk) currently requires a second user
   account. A `role_assignments`-style many-to-many is a possible evolution but intentionally
   deferred.

## Hardening / infra

8. **Renderer sandbox is disabled** (`sandbox: false` in `src/main/index.ts`, inherited from
   the scaffold). `contextIsolation` + a narrow `window.api` surface mitigates this, but
   enabling the renderer sandbox would harden the Electron boundary. Note: with the sandbox
   on, the preload may need to be adapted if it requires Node APIs.

9. **No IPC/preload tests.** The IPC layer is thin but untested. Adding an `ipc.test.ts` with
   mocked `ipcMain`/`ipcRenderer` (or a shared `handleIpc` helper) would close the last
   coverage gap.

10. **Coverage leaves defensive branches untested** (e.g. `Database not initialized` in
    `connection.ts`, the `if (!row) return null` paths in repositories). Low risk; add targeted
    cases if 100% is a goal.

## Next sprint

- Wire the real CRUD flows (Member, Plan, Payment, Check-in) through the same
  layered + `withTransaction` + `requirePermission` pattern established here.
- Extend the `permissions` catalog and per-role grants as Modules 02–13 go live, so role
  permissions stay data-driven.
- Build the org-scoped multi-tenant queries on the demo tables (Module 08) once domains
  beyond identity exist.