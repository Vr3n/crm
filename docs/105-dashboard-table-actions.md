# 105 — Dashboard Table Actions + Tooltips on Every Table Action

## What changed

The two dashboard work-queue cards now carry the same row actions as their
domain tables, and every icon-only table action app-wide shows a hover tooltip:

| Surface | Actions (all with tooltip on hover) |
|---|---|
| Recent leads card (`dashboard/components/recent-leads-table.tsx`) | **Blacklist / Lift blacklist**, **Edit** — new Actions column, mirrors `leads/components/lead-table.tsx` |
| Upcoming followups card (`dashboard/components/upcoming-followups-table.tsx`) | **Extend due date** (new), **Mark done** (existing), **Cancel** (new) — mirrors `followups/components/follow-up-table.tsx` |
| Leads table (`lead-table.tsx`) | Blacklist + Edit wrapped in `Tooltip` (previously `aria-label` only) |
| Memberships table (`membership-table.tsx`) | Blacklist wrapped in `Tooltip` |
| Customers table (`customer-table.tsx`) | Blacklist wrapped in `Tooltip` |
| Lead-detail follow-up panel (`detail/follow-up-panel.tsx`) | Extend / Done / Cancel moved from native `title=` to shadcn `Tooltip` (+ real `aria-label`s) |

## Wiring (`dashboard/pages/DashboardPage.tsx`)

- Four new targets: `editingLead`, `blacklistingLead`, `editingFollowUp`,
  `cancellingFollowUp`. The existing `CompleteFollowUpDialog` flow
  (`completeTarget`) is unchanged — Mark done keeps the richer notes/activity
  dialog on the dashboard.
- Dialogs are `React.lazy` + `<Suspense fallback={null}>`, remounted per open
  (`key={id}`), per `docs/form-implementation-guideline.md`. No new dialogs
  were built — all four are the existing domain dialogs.
- Permissions mirror the leads page exactly: `person.blacklist` gates the
  blacklist button; edit is owner-or-admin (`lead.edit` + owner match, super
  bypasses). `canEditLead` is `useCallback`'d so the table's column memo stays
  stable. Front Desk sees no action buttons.
- `DataTable` already stops propagation on `select`/`actions` cells, so
  row-click navigation is unaffected.

## Tooltip convention

`Tooltip` + `TooltipContent side="left"` on every icon-only action, matching
the existing `row-actions.tsx` / `follow-up-table.tsx` pattern. Labels:
Edit, Blacklist / Lift blacklist, Extend due date, Mark done, Cancel.

## Tests

`tests/renderer/dashboard-actions.test.tsx` (8 tests): Extend/Cancel/Done open
their dialogs; Edit opens prefilled; Blacklist opens; Front Desk sees neither
Edit nor Blacklist. Dashboard IPC (`window.api.dashboard.*`) is stubbed to
empty queues in the file's `beforeEach`.

## Verification

- `vitest run tests/renderer/dashboard-actions.test.tsx tests/renderer/leads-page.test.tsx` — 20/20 pass.
- `eslint` clean on all touched files; `prettier --write` applied.
- `typecheck:web` reports only the pre-existing `shared/contracts/customers.ts`
  error from the person-features branch (untouched by this change).
