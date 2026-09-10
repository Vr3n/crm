# Implementation Details — Identity & Tenancy (Modules 14/15)

This folder is the implementation-level counterpart to the normative design docs
(`docs/14-organization-and-multi-tenancy.md`, `docs/15-users-roles-and-access-control.md`)
and the recorded decisions in `plans/docs/adr/`. It is written for a senior engineer
reviewing the actual shipped code, so it emphasizes *what* was built, *why* the choices
were made, the trade-offs accepted, the test strategy, and the known gaps.

## Documents

- [`README.md`](./README.md) — this overview (how to run, verify, and navigate the code).
- [`architecture.md`](./architecture.md) — layers, data flow, and the transaction/RBAC enforcement model.
- [`identity-module.md`](./identity-module.md) — per-file review of the identity/tenancy implementation.
- [`tests-and-quality.md`](./tests-and-quality.md) — test strategy, coverage, and the bugs the suite caught.
- [`ui-shell.md`](./ui-shell.md) — the app shell & design system (sidebar/topbar/routing, pink accent, theme, permission-gated nav).
- [`dashboard.md`](./dashboard.md) — the operational dashboard (masthead, quick actions, expirations / dues / cold-leads tables).
- [`known-gaps.md`](./known-gaps.md) — deliberate limitations and next-sprint concerns.
- [`leads-pipeline.md`](./leads-pipeline.md) — the SQLite-backed leads pipeline (list read model, stage machine, activities/follow-ups).
- [`complete-followup-stage-change.md`](./complete-followup-stage-change.md) — optional pipeline move when marking a follow-up done (atomic completion + stage change, single + bulk).
- [`winback-terminal-confirm-blacklist.md`](./winback-terminal-confirm-blacklist.md) — LOST win-back re-open, terminal-stage scheduling confirm, and the blacklist refund-only rule (backend guards + renderer).
- [`catalog-plans-and-lead-fk.md`](./catalog-plans-and-lead-fk.md) — the `membership_plans` catalog (Module 03) and the `leads.plan_id` FK migration (v9/v10).
- [`autocorrect-combobox.md`](./autocorrect-combobox.md) — the reusable TanStack Form/Query-backed autocomplete + create combobox (`src/renderer/src/components/autocorrect-combobox.tsx`).

## Scope of this pass

The foundation for one local, offline install: first-run **organization setup**, **login**,
**RBAC** (User → OrganizationStaff → single Role → Permission set), and the typed IPC +
preload bridge that lets the renderer drive these flows. It implements Modules 14 and 15
only. Modules 01–13 remain designed-but-not-built; the scaffold's demo tables and demo
dashboard were removed so the codebase contains only the real application.

## How to run and verify

```bash
npm install              # installs deps incl. vitest + @vitest/coverage-v8
npm run typecheck        # tsc on node + web projects
npm test                 # vitest run (78 tests)
npm run test:coverage    # vitest with v8 coverage (target: auth/RBAC logic)
npm run lint             # eslint (scaffold ui/*.tsx files still warn on return types — not ours)
npx electron-vite build  # production build of main/preload/renderer
npm run dev              # launch the Electron app
```

## Status

- 78/78 tests passing.
- `typecheck` clean (node + web).
- ESLint clean on all new/modified code and tests (pre-existing scaffold warnings remain in `src/renderer/src/components/ui/*.tsx`).
- Coverage on the auth/RBAC logic: **92.75% statements / 97.87% lines** (see `tests-and-quality.md`).
- Persisted **remembered login**: after first setup or login the app auto-restores the session
  on launch (no login-screen flash); signing out clears it.
- **Reactive auth forms**: the setup/login forms react to input with shadcn-style field state —
  inputs show red (error) / green (success) borders + icons, granular per-field error messages
  (e.g. mobile "starts with 6–9"), realistic placeholders, a live 10-digit mobile counter, a live
  password-strength meter + requirement tick, and a green submit-success moment before navigation.
  Borders evaluate live once a field is committed or complete, not only after blur. Server state
  uses TanStack Query (`QueryClientProvider` in `main.tsx`): a debounced `useQuery` checks the
  backend for an existing organization (name + owner email/mobile) and shows "organization already
  exists" under the name; the submit button on both forms stays **disabled until the form is
  valid**, and the "Set up this machine" toggle is hidden once an organization exists. (See
  `identity-module.md` → Renderer.)