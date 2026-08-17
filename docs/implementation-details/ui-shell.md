# UI Shell & Design System

This document describes the application shell and design system shipped on top of the
identity/RBAC layer (Modules 14/15). It is written for a senior engineer reviewing the
renderer, mirroring the tone of the other `implementation-details` docs: _what_ was built,
_why_, the trade-offs accepted, and the known gaps.

## Scope

The shell replaces the scaffold's demo dashboard with a branded, navigable frame that all
future modules plug into:

- **Design tokens** — a cyan + pink palette, blocky (zero-radius) surfaces, light and dark
  themes.
- **Layout** — collapsible sidebar (grouped, permission-gated nav) + topbar (full-width
  search trigger, theme toggle, user menu) + routed content area.
- **Routing** — React Router `HashRouter` with a `Protected` guard and placeholder pages
  for Modules 01–13.
- **Operational Dashboard** — honest empty states; no fabricated numbers.
- **Session & feedback** — session state fully owned by TanStack Query; sonner toasts for
  login/setup/logout; an `AlertDialog` for the destructive sign-out confirmation.

No business module logic is implemented; each module route renders a roadmap placeholder.

## Design tokens (`src/renderer/src/assets/main.css`)

CSS custom properties drive every visual choice; components reference tokens, not raw
values, so a theme is a token swap.

- **Accent (cyan + pink).** `--primary` is `oklch(0.52 0.105 223.128)` in light and
  `oklch(0.45 0.085 224.283)` in dark (cyan, hue ≈ 220–230) and drives actions; `--secondary`
  is the vivid pink `oklch(0.525 0.223 3.958)` light / `oklch(0.459 0.187 3.815)` dark
  (hue ≈ 4) for the secondary button variant. `--accent` is a **light pink tint**
  (`oklch(0.955 0.02 3.958)` light / `oklch(0.27 0.02 3.958)` dark) used for subtle hover
  fills on nav/ghost/dropdown items — the vivid pink is deliberately _not_ used as a hover
  background, which read as harsh. Charts use a cyan ramp (`--chart-1..5`).
- **Radius — blocky.** All radius tokens (`--radius`, `--radius-sm/md/lg/xl/2xl/3xl/4xl`)
  are `0`, so every `rounded-*` utility renders square. `rounded-full` (avatars, pills, the
  scrollbar thumb) is preserved. This is a deliberate shape-consistency lock.
- **Type.** `--font-sans`, `--font-heading`, `--font-mono` (`IBM Plex Mono`, installed via
  `@fontsource/ibm-plex-mono`). Money, dates, and IDs render in `--font-mono` with
  `font-variant-numeric: tabular-nums` so digits align.
- **Semantic tokens.** `--success` / `--warning` / `--destructive` for status badges and
  toast tints (see the `success`/`warning`/`destructive` variants added to `ui/badge.tsx`).

## Spacing & density (the spacing design language)

Spacing is standardized on a **4px base unit**. Structural spacing (padding, margins,
gaps between blocks, card insets, page gutters) must be multiples of 4; Tailwind's `1`–`6`
steps are the working scale. This matches both the shadcn design language (whose Card
component ships a `--card-spacing` token in 4px steps) and the guidance of data-dense
design systems (Cloudscape, Maersk).

| Token | Tailwind                 | Usage                                                          |
| ----- | ------------------------ | -------------------------------------------------------------- |
| 4px   | `gap-1` / `p-1` / `mt-1` | Tight hierarchy gaps, small captions                           |
| 8px   | `gap-2` / `py-2` / `p-2` | Inline groups, table row/header vertical padding, toolbar gaps |
| 12px  | `gap-3` / `px-3`         | Compact card inset (`size="sm"`), control inner padding        |
| 16px  | `gap-4` / `px-4`         | Default card inset (`--card-spacing`), table↔toolbar gap       |
| 24px  | `gap-6` / `p-6`          | Page gutters, section rhythm                                   |
| 32px+ | `gap-8` / `p-8`          | Major layout breaks                                            |

**Card spacing** is owned by the `--card-spacing` variable on `ui/card.tsx`: `default` =
16px, `size="sm"` = 12px. Cards set their inset once on the root; header/content/footer
read the same variable, so a card's spacing never drifts from its neighbours.

**Allowed micro exceptions** — 2px (`gap-0.5`) for stacked cell sub-lines and icon-button
clusters; 6px (`gap-1.5`) for icon↔text inside a single control. These are the only
non-multiple-of-4 values permitted. **`2.5` steps (10px) are banned** in spacing (they are
fine as icon _sizes_, e.g. `size-3.5`).

**Table density** — rows are 36px (cell `py-2` + 20px text line), headers 40px (`h-10`).
This sits in the "standard" density band (36–40px) recommended for daily-use operational
dashboards; it is deliberately not the comfortable 48–52px band reserved for occasional
glance cards.

## Layout architecture (`src/renderer/src/layouts/AppLayout.tsx`)

The frame composes `TooltipProvider` (for collapsed sidebar tooltips) + `Sidebar` +
`Topbar` + `<Outlet/>` + `CommandMenu`.

- **`Sidebar`** — collapsible `256px → 68px` (persisted in `localStorage` key
  `crowncrm:sidebar-collapsed`). Nav is built from `NAV_GROUPS` in `lib/navigation.tsx`
  and filtered by permission via `visibleGroups(...)`. An identity chip sits at the bottom
  (avatar, name, role). A `NavBadge` hook exists but returns `null` — badges must never
  show fabricated counts (no fake numbers rule).
- **`Topbar`** — a **full-width** search trigger (`flex-1`, opens the command palette), a
  theme toggle, and a user dropdown whose **Sign out** item opens a destructive
  `AlertDialog` ("Sign out of {org}?", with a destructive ghost action and Cancel as the
  focused default). The page title collapses to hidden on small widths.
- **`CommandMenu`** — `cmdk`-based palette opened with `Ctrl/Cmd+K`, navigating to any nav
  destination. Note: the CLI-generated `CommandDialog` was missing the enclosing `<Command>`
  (cmdk root), which crashed with a `Cannot read properties of undefined ('subscribe')`
  error — fixed by wrapping the dialog children in `<Command>`.

### Navigation & permissions (`src/renderer/src/lib/navigation.tsx`)

`NAV_GROUPS` defines the grouped module tree:

- **Command** — Dashboard
- **Sales** — Pipeline, Follow-ups, Activities
- **People** — Customers, Memberships
- **Catalog** — Plans, Offers
- **Billing** — Invoices, Daily Collection
- **Finance** — Payments, Refunds, Reports
- **Administration** — Users & Roles, Organization

Each `NavItem` carries an optional `requires` permission code. Gating follows the Module 15
rule — **check permission codes, never role names**:

- Business modules carry no `requires` and are visible to every signed-in user (only
  `org.*`, `user.*`, `role.*` codes exist today).
- Administration is gated by `user.view` / `org.view`.

The dedicated sidebar search item was removed; search now lives solely in the topbar/`⌘K`.

## Routing & guard (`src/renderer/src/AppRoutes.tsx`)

- `HashRouter` (chosen over `BrowserRouter` so deep links work in `file://` packaged
  builds and refresh is harmless).
- `Protected` route guard: allow when the caller is **super** (Owner/Admin) OR holds the
  required permission code; otherwise redirect to `/`. This mirrors the command layer's
  `requirePermission` short-circuit for super users.
- `/` → Dashboard; each module path → `ModulePlaceholder`; `*` → `Navigate` to `/`.

## Session state — TanStack Query (`src/renderer/src/lib/identity-queries.ts`)

Session and identity status are owned **entirely by TanStack Query** — no `useEffect` sync,
no `useState<session>`. The global query cache is the single source of truth:

- `useIdentityStatus()` / `useIdentitySession(enabled)` read `['identity','status']` and
  `['identity','session']`.
- `useLogout()` runs the logout mutation and, on success, immediately sets the cached
  status to `LOGIN_REQUIRED` (and nulls the session) before invalidating, so the UI flips to
  the login phase instead of serving the stale `AUTHENTICATED` result from before logout —
  this was the original sign-out bug (the remounted `AuthGate` read the stale cached
  status and sat on the loading screen).
- `useCommitSession()` writes a fresh session into the cache after setup/login.

`App.tsx` derives the session from the queries and renders either the authenticated shell or
`AuthGate`; `AuthGate` no longer owns status/session queries or the remember-login
`useEffect` — it receives `status`/`statusPending` as props and reports success via
`onAuthenticated`.

## Feedback: toasts & confirmations

- **`components/ui/sonner.tsx`** — app-wide sonner `<Toaster/>`, mounted once at the app
  root in `main.tsx` (not inside `AppLayout`) so toasts survive logout/login transitions
  instead of being torn down or queued/stacked. Positioned bottom-right, `duration={2000}`,
  `richColors` with the success/error surfaces mapped to subtle `--success` / `--destructive`
  tints over the popover surface.
  - Login/setup fire `toast.success`; logout fires `toast.error` (destructive).
- **`components/ui/alert-dialog.tsx`** — Radix `AlertDialog` (from the already-used
  `radix-ui` package) styled with the design tokens. Used for the destructive sign-out
  confirmation: consequence in the title, a destructive-context `LogOut` icon, Cancel as the
  focused default, and a destructive ghost "Sign out" action.

## Placeholder & shared primitives

- **`pages/module-placeholder.tsx`** — generic roadmap landing for every module route.
- **`features/dashboard/`** — the operational dashboard (see `dashboard.md`): masthead,
  quick actions, and expirations / dues / cold-leads tables. It replaces the old
  `pages/dashboard.tsx`, which was deleted.
- **`components/page-header.tsx`**, **`components/stat-card.tsx`**,
  **`components/empty-state.tsx`** — shared presentational primitives.

**No fake numbers rule.** `StatCard`/badges/empty states render honest `--` or explicit
empty messages. They never invent counts (e.g. no "5 overdue" before real data).

## Theme (`src/renderer/src/lib/theme.tsx`)

`useTheme` supports `light` / `dark` / `system`, persists to `localStorage` key
`crowncrm:theme`, and resolves `system` against `prefers-color-scheme`. It applies the
theme via `useEffect` (not during render), toggles the `.dark` class on `<html>`, sets
`color-scheme`, and guards `localStorage` access.

## CLI-generated components

The shadcn CLI wrote components to an unresolved `@/` alias; they were moved to
`src/renderer/src/components/ui/`. The pre-existing custom `button.tsx`, `input.tsx`,
`input-group.tsx`, `field.tsx`, `badge.tsx` (which `AuthGate` depends on) were kept;
CLI duplicates of button/input/input-group were discarded. `ui/**` is ignored by ESLint —
the files are third-party generated and would otherwise raise thousands of
`explicit-function-return-type` noise.

## How to verify

```bash
npm run typecheck:web      # renderer tsc
npm run lint               # eslint — new/modified renderer code is clean
npm run dev                # launch the app, exercise collapse/palette/theme/routing/auth toasts
```

## Known gaps

- **Member-facing dashboard rows are mock.** The dashboard's Membership Expirations and
  Payments Due tables seed from `features/dashboard/mock-data` (Modules 02–05 not built yet);
  they light up for real when those modules wire real queries through the layered +
  `requirePermission` pattern. Leads Turning Cold is live from the leads store.
- **Search is a stub.** `⌘K` navigates nav destinations; people/search results are not
  implemented.
- **`ui/**` ESLint ignore** trades lint coverage for a clean gate; the vendored components
  are pinned by shadcn's generator rather than hand-reviewed.
- **Pre-existing errors** in `lib/utils.ts` (missing return type on `cn`) and
  `src/main/domain/errors.ts` predate this work and are left untouched.
