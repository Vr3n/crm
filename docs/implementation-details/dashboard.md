# Operational Dashboard (Module 09 §58)

This document describes the redesigned dashboard shipped on top of the UI shell. It follows
the same pattern as the leads feature (`features/leads/`) and the tone of the other
`implementation-details` docs: _what_ was built, _why_, the trade-offs accepted, and the
known gaps.

## Scope

The old dashboard was fully presentational (a greeting, a KPI row, and empty-state lists —
no data, no query wiring). This pass replaces it with a work-first dashboard:

- **Masthead** — the Organization is the large title; the signed-in staff member sits beside
  it as a prominent identity (avatar + name + role); the greeting is demoted to a small
  subtitle.
- **Quick actions** — an outline-button row: **New Lead** (opens the same add-lead dialog as
  the Leads page) plus Schedule Follow-Up / Schedule Activity / New Membership Sale, which
  toast an honest "upcoming module" notice rather than faking a flow.
- **Five tables in three rows** —
  - **Row 1:** Upcoming Followups and Recent Leads (live data from the leads/followups stores).
  - **Row 2:** Membership Expirations and Payments Due (member-facing, mock data).
  - **Row 3:** Leads Going Cold (full-width, live from the leads store).
- **KPI cards removed** — no fabricated numbers.

All five dashboard tables reuse the shared `DataTable` component with context-based
pagination (`showPagination={false}` + `CardPaginationFooter` in `CardFooter`).

## Design read

This is an internal, data-dense ops dashboard for gym front-desk staff — not a marketing
surface. The design skills' principles (visual hierarchy, strategic color placement,
anti-slop discipline) apply; their landing-page machinery (scroll/magnetic motion,
`rounded-[2rem]` double-bezel, huge `py-24` rhythm) does **not**. It stays on the
established system: blocky 0-radius, cyan primary accent, Space Grotesk headings, IBM Plex
Mono for money/dates, dark-mode aware. Dials: VARIANCE 3 · MOTION 2 · DENSITY 8.

**Color rules followed** (Color Consistency Lock):

- **One accent** (primary cyan) reserved for interactive elements — buttons, `+ Follow-up`,
  the New Lead action.
- **Semantic color only where it communicates status**: warning for memberships expiring
  within `EXPIRING_SOON_DAYS`, destructive for expired, muted for far-out / cold. No rainbow
  accents.
- Money, dates, and day-counts render in `font-mono tabular-nums` so columns scan on a single
  edge (visual-density rule).

## Data layer (`features/dashboard/`)

Mirrors the `features/leads/` pattern: types → constants → mock data → async api → TanStack
Query hooks.

| File           | Purpose                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `types.ts`     | `PersonRef`, `MembershipExpiration`, `PaymentDue`.                                                                   |
| `constants.ts` | Thresholds: `EXPIRING_SOON_DAYS = 7`, `COLD_LEAD_DAYS = 4`, `MAX_ROWS = 6`.                                          |
| `mock-data.ts` | Seeded member rows with timestamps relative to _now_ (mix of overdue / due-soon / far-out so urgency styling shows). |
| `store.ts`     | `DashboardStore` — in-memory read models (`upcomingExpirations` ascending, `listPaymentsDue` by amount).             |
| `api.ts`       | Async facade with a `delay(120)` latency seam — the future SQLite/IPC drop-in point.                                 |
| `queries.ts`   | `useUpcomingExpirations()`, `usePaymentsDue()` with a `dashboardKeys` factory.                                       |
| `format.ts`    | `formatMoney`, `daysUntil`, `daysSince`.                                                                             |

The member-facing rows are **mock** because Members/Memberships/Payments are Modules 02–05,
not yet built. The **Leads Turning Cold** table reads live data from `features/leads`
(`useLeads()`), so it reflects real lead mutations.

## Components (`features/dashboard/components/`)

- **`dashboard-header.tsx`** — swapped masthead (org big, staff identity, greeting small).
- **`dashboard-actions.tsx`** — the quick-action row; `New Lead` → `onNewLead` callback,
  others → "upcoming module" toast.
- **`upcoming-followups-table.tsx`** — open follow-ups due within the next 7 days, soonest
  first. Data from `useFollowUpRows()` (the shared leads-derived read model). Columns:
  Lead (name + stage badge) · Follow-up title · Due (mono date + relative). Row click
  navigates to `/leads/:id`.
- **`recent-leads-table.tsx`** — non-terminal leads sorted by createdAt descending. Data
  from `useLeads()`. Columns: Lead (name + stage badge) · Contact · Source · Created
  (relative). Row click navigates to `/leads/:id`.
- **`membership-expirations-table.tsx`** — ascending by expiration; Client · Expiration
  (`n days remaining` badge) · Plan (purchase date) · `+ Follow-up`. Expiry urgency via
  `ExpiryBadge` (destructive expired / warning due-soon / outline far-out).
- **`payments-due-table.tsx`** — largest amount first; Client · Amount Due (total subtitle,
  success tone) · Plan (purchase date) · `+ Follow-up`.
- **`leads-going-cold-table.tsx`** — from `useLeads()`, excludes `LOST`/`WON`, filters to
  leads with no follow-up/activity for `>= COLD_LEAD_DAYS` (last-touch = newest activity or
  follow-up timestamp, `createdAt` if never touched), sorted longest-silence-first; Lead ·
  Contact · Last follow-up/activity.
- **`card-pagination-footer.tsx`** — shared helper that reads pagination state from
  `DataTableContext` and renders it inside a `CardFooter`, used by all four dashboard card
  tables.
- **`contact-cell.tsx`** — name + best-available contact (phone → email → em dash).

## Page & routing

- **`features/dashboard/pages/DashboardPage.tsx`** — composes header, actions, the two-column
  member tables, the full-width cold-leads table, and the `NewLeadDialog` mount.
- **`AppRoutes.tsx`** — the index route now renders `DashboardPage` (was
  `pages/dashboard.tsx`, which was deleted). No nav change (Dashboard is already the `command`
  group's sole item).

## How to verify

```bash
npm run typecheck:web      # renderer tsc — clean
npm run lint               # eslint — 0 errors on the new feature
npx electron-vite build    # production build
npm run dev                # launch and click through masthead/actions/tables/New Lead
```

## Known gaps

- **Member rows are mock.** Expirations and payments seed from `features/dashboard/mock-data`
  and reset on reload; the real read models come with Modules 02–05.
- **`+ Follow-up` on member tables is a toast**, not a working flow — deliberately honest,
  wired once the Members module exists.
- **Schedule Follow-Up / Activity / Membership Sale** quick actions are placeholders.
- **Calendar** is deferred to a dedicated sprint (needs a performant calendar component).
