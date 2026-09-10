# Follow-ups Table Ordering — Open First, Done Sunk

The Follow-ups page (`all` bucket) mixed completed/cancelled rows among open
ones: the page sorts rows open-first upstream (`sortFollowUpRows`), but the
table re-sorted everything by raw `dueAt` via
`initialSorting={[{ id: 'dueAt', desc: false }]}`. Done rows keep their
original (often old) due dates, so they interleaved with open rows — and the
`done` bucket lost its newest-completed-first order the same way.

## What changed

- `src/renderer/src/features/followups/components/follow-up-table.tsx` —
  removed the table-level `initialSorting` so the default row order is the
  upstream `sortFollowUpRows` order (open by due date, done sunk by completion
  time). The Due column now uses the custom `dueAtOpenFirst` sort instead of
  `'datetime'`.
- `src/renderer/src/features/followups/build.ts` — new exported
  `dueAtOpenFirst` TanStack `SortFn`: the open/done partition is absolute in
  both directions; only the within-partition due-date order follows the sort
  direction. It reads the direction from `row.table.atoms.sorting` because the
  engine negates the comparator result on desc — a direction-blind comparator
  would surface done rows first on descending sorts.
- `src/renderer/src/features/dashboard/components/data-table.tsx` — the shared
  `DataTable` now seeds `sorting: initialSorting ?? []`. An omitted
  `initialSorting` left the sorting atom `undefined`, and the first header
  click crashed in the library's toggle updater (`old.findIndex` on
  `undefined`). This was a latent footgun for every table without an initial
  sort, found by the new table-level test.
- Dashboard "Upcoming followups" card: untouched — it filters out done rows
  and pre-sorts upstream, so its `dueAt` initial sort was already a no-op.

## Verification

- `tests/renderer/follow-ups-build.test.ts` — `sortFollowUpRows` contract:
  open-before-done (even with older done due dates), due-asc within open,
  completion-desc within done, cancelled treated as done.
- `tests/renderer/follow-up-due-sort.test.ts` — `dueAtOpenFirst` comparator
  contract in both directions (incl. the desc pre-negation).
- `tests/renderer/follow-up-table.test.tsx` — rendered order: default
  open-first, asc Due keeps done sunk (done partition re-orders by due date),
  desc Due flips open rows latest-first while done rows stay sunk.
- Full unit suite 861/863 (only the 2 pre-existing
  `membership-cancel-renew` date flakes); `typecheck:web` clean; ESLint 0
  errors on touched files (repo-wide CRLF warnings unchanged); follow-ups e2e
  specs (`followup-stage-change`, `dashboard-followup-stage-change`,
  `winback-blacklist`) 5/5 green against a rebuilt `out/`.
