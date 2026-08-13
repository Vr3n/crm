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
- [`known-gaps.md`](./known-gaps.md) — deliberate limitations and next-sprint concerns.

## Scope of this pass

The foundation for one local, offline install: first-run **organization setup**, **login**,
**RBAC** (User → OrganizationStaff → single Role → Permission set), and the typed IPC +
preload bridge that lets the renderer drive these flows. It implements Modules 14 and 15
only. Modules 01–13 remain designed-but-not-built; the demo tables from the scaffold are
retained unchanged.

## How to run and verify

```bash
npm install              # installs deps incl. vitest + @vitest/coverage-v8
npm run typecheck        # tsc on node + web projects
npm test                 # vitest run (50 tests)
npm run test:coverage    # vitest with v8 coverage (target: auth/RBAC logic)
npm run lint             # eslint (scaffold ui/*.tsx files still warn on return types — not ours)
npx electron-vite build  # production build of main/preload/renderer
npm run dev              # launch the Electron app
```

## Status

- 50/50 tests passing.
- `typecheck` clean (node + web).
- ESLint clean on all new/modified code and tests (pre-existing scaffold warnings remain in `src/renderer/src/components/ui/*.tsx`).
- Coverage on the auth/RBAC logic: **92.75% statements / 97.87% lines** (see `tests-and-quality.md`).