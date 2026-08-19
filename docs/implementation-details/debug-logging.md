# Debugging & Logging

## Logger modules

Two tiny leveled loggers (timestamp + `[main]` / `[renderer]` prefix + `LEVEL` tag):

- Main process: `src/main/lib/logger.ts`
- Renderer: `src/renderer/src/lib/logger.ts`

Both expose `debug` / `info` / `warn` / `error`. Everything is printed through
`console.*`, so:

- Main logs appear in the terminal running the app (stdout/stderr).
- Renderer logs appear in the Electron DevTools console (`Ctrl+Shift+I`).

## Default level & env control

- Main: default `info`. Override with `GYMCRM_LOG_LEVEL=debug|info|warn|error`.
- Renderer: default `debug`. Override with `VITE_LOG_LEVEL` (set it in the
  renderer's `.env` / `VITE_*` env or `import.meta.env`).

Example (full IPC + SQL detail):

```powershell
$env:GYMCRM_LOG_LEVEL = "debug"; npm run dev
```

## What is logged today

| Layer | File | Level | Logs |
| --- | --- | --- | --- |
| IPC boundary | `src/main/ipc/handle.ts` | `debug` | every channel call (sanitized args), duration, ok/error + error code |
| App startup | `src/main/index.ts` | `info` | process start, log level, resolved DB path |
| Vocab search use case | `src/main/application/leads.ts` (`searchLeadVocabulary`) | `info` | `"vocab search <field>"` with org id, trimmed query, result count |
| Vocab repo query | `src/main/repositories/sales.ts` (`distinctLeadValues`) | `debug` | org id, column name, query, limit, generated SQL |
| Renderer search | `new-lead-dialog.tsx` (`searchPlanInterests`/`searchGoals`) | `debug` | query, result count + rows; failures at `warn` (re-thrown) |

## Debugging the plan/goal autocomplete search

The backend path is covered by app tests (search returns distinct non-empty
`plan_interest`/`goal` values for the current org), so a silent failure in the
running app is almost always one of:

1. **Stale build** — `npm run start` / `electron-vite preview` serves `out/`
   without rebuilding. Rebuild with `npm run build` first (or just `npm run dev`,
   which builds on every change). A stale preload means
   `window.api.leads.searchPlanInterests` is `undefined`, and the renderer logs
   `searchPlanInterests failed` at `warn` while the combobox shows
   "Could not search. Please try again."
2. **No data** — `distinctLeadValues` returns distinct values *already used on
   leads*. If no lead has `plan_interest`/`goal` set (yet), any query yields 0
   rows. With `GYMCRM_LOG_LEVEL=debug` you'll see `vocab search "plan_interest"`
   with `count: 0` and the SQL against the DB path printed at startup.
3. **Org scoping** — values are scoped to the current organization; a fresh
   org has an empty vocabulary by design.

Expected healthy debug output while typing in the Goal field:

```
[main] ... ipc leads:searchGoals {"query":"weight"}
[main] ... distinct lead values {"organizationId":1,"column":"goal","query":"weight","limit":20,"sql":"..."}
[main] ... vocab search "goal" {"organizationId":1,"query":"weight","count":1}
[main] ... ipc leads:searchGoals ok 1ms
[renderer] ... searchGoals {"query":"weight","count":1,"rows":[{"id":"Weight loss","label":"Weight loss"}]}
```
