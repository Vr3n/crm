# Crown CRM → Electron.js Rewrite — Module Implementation Plans (M0–M5)

This folder contains the **detailed, implementation-ready plans** for the first six
modules of the Electron rewrite. They expand on the master document
[`../electron_rewrite_plan.md`](../electron_rewrite_plan.md) — read that first for the
decisions, concept mapping, target layout and the pinned algorithms.

Each module lives in **its own file** so it can be implemented, reviewed and edited in
isolation. Cross-module contracts are called out explicitly in each file.

## Build order

`M0 → M1 → M2 → M3 → M4 → M5` produces a walking skeleton:

1. **M0** — toolchain compiles and runs (`npm run dev` shows an empty window).
2. **M1** — database opens, migrates, and repository CRUD works (verified by vitest).
3. **M2** — typed IPC + security envelope; renderer can talk to main safely.
4. **M3** — first-run admin creation → login → logout round-trips over IPC.
5. **M4** — app shell (sidebar/navbar), router, lazy routes, toasts, auth UI.
6. **M5** — dashboard shows real counts, charts and tables from the database.

Package with `electron-builder` (M12) at the end of each vertical slice so it stays
testable on a real Windows machine.

## Module index

| File                     | Effort | Delivers                                                        |
| ------------------------ | ------ | --------------------------------------------------------------- |
| `module-00-scaffold.md`  | 2d     | Repo, tooling, dependencies, build configs                      |
| `module-01-data-layer.md`| 3d     | SQLite connection, migrations, full schema, repositories        |
| `module-02-ipc-security.md` | 2d  | IPC contract, envelope, preload, security hardening             |
| `module-03-auth.md`      | 2d     | scrypt auth, first-run admin, audit log, auto-lock              |
| `module-04-app-shell-navigation.md` | 3d | AppShell, router, TanStack Query, Toaster, auth screens  |
| `module-05-dashboard-reports.md`    | 2d | Dashboard metrics, charts, recent-leads/expirations/outstanding/sales tables |

## Conventions used by all modules

- **Money is integer cents** everywhere in the database and IPC; only the renderer
  formats it as currency. `formatINR(cents)` is the single renderer util (M4).
- **Soft-delete is a convention**, not a framework: every table carries
  `is_deleted` / `deleted_at` (except plain Django models ported verbatim — see M1
  schema notes), and every repository query filters `is_deleted = 0`.
- **SQLite runs only in the main process.** The renderer touches data exclusively
  through the typed IPC contract from M2.
- **Audit writes share the mutation transaction** (M3) — never a separate write.
- **Performance ceiling:** ≤100k leads, ≤500k receipts, <50 ms/query, with indexes on
  every FK and hot filter (M1).

## How to implement a module

1. Open the module file and its "Depends on" prerequisites.
2. Follow the numbered steps; the file lists the exact files to create and the
   Django source files it ports from.
3. Run the module's acceptance tests (vitest) and the "Definition of done" checks
   before moving on.

## Verification commands (set up in M0)

```bash
npm run dev           # launch electron-vite dev with hot reload
npm run build         # type-check + bundle main/preload/renderer
npm test              # vitest unit + integration tests
npm run lint          # eslint + tsc --noEmit
```
