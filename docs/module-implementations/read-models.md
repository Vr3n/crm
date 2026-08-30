# Module Implementation — Read Models: Dashboard, Funnel, Reports, Search, 360 (Module 09)

**Ties to:** `docs/backend-plan/09-read-models.md`,
`docs/09-ui-dashboards-and-reporting.md`, `docs/backend-plan/06-backbone.md` (settings).
**Depends on:** all transactional modules (01–05) — it reads their tables and never
writes. Uses backbone settings for period definitions.
**Feeds into:** ops (export of report results), UI everywhere.

## 1. Scope & dependencies

The renderer already carries the read-model shapes as mock data: `features/dashboard/`
(expiring memberships, payment dues, member record drawer), `features/collections/`
(daily collection report), `features/finance/` (registers), plus report widgets on the
dashboard. Every one of those comments says the same thing: *"the real system builds
these as read models over the transactional Module 01–05 tables."* This module is exactly
that — a **query-only backend** (no schema beyond what the transactional modules created)
that returns these aggregates, plus the IPC/preload/renderer wiring that replaces the
mocks.

Nothing here writes. Every handler is a read with a permission gate, and every result is a
derived projection computed at query time from the source tables (no stored
aggregate/denormalized counters).

## 2. DB tables

None new. Read models query `people`, `leads`, `customers`, `memberships`,
`membership_freezes`, `membership_events`, `offers`, `offer_redemptions`, `invoices`,
`invoice_lines`, `payments`, `payment_allocations`, `refunds`, `credits`,
`credit_allocations`, and `settings`.

A handful of supporting indexes (added as migration-only changes) to keep hot projections
fast:

```text
memberships        (organization_id, end_date)     -- expiring list
memberships        (organization_id, status)       -- active/frozen/cancelled lists
invoices           (organization_id, issued_at)    -- daily/period revenue
payments           (organization_id, payment_date, method) -- daily collections by method
leads              (organization_id, status, created_at)  -- funnel
```

## 3. Migrations

- Migration 1: the supporting indexes above. Versions **20+** (19 reserved for backbone).
  Register in `migrations.ts`.

## 4. Backend queries

All read-only; each returns a typed aggregate. Permission codes `report.view` (dashboards
+ reports) and `report.export` (used by ops) with granular read codes reusing the source
module views where a single-entity read (`getCustomerProfile`) already exists.

| Query | Returns |
|---|---|
| `dashboardKpis()` | active members, expiring in N days, overdue total, new leads this week, revenue this month, renewal rate — derived from memberships/invoices/payments/leads |
| `dashboardExpiringMemberships(window)` | rows: member ref, plan, purchasedAt, expiresAt |
| `dashboardPaymentDues(overdueOnly)` | rows: member ref, plan, amountDue, total, oldest invoice |
| `funnel()` | lead counts by stage over a period (lead stage history) |
| `revenueByPlan(period)` | plan → { invoiced, collected, discounts } |
| `revenueByStaff / bySource(period)` | attribution from invoices + leads |
| `dailyCollections(from, to)` | per-day { total, count, byMethod[] } (answers `features/collections`) |
| `monthlyCollections(period)` | per-month totals |
| `outstandingDues(asOf)` | open balances per customer/invoice (drives finance + collections) |
| `membershipMetrics(period)` | new/renewed/frozen/cancelled counts, churn |
| `customer360(customerId)` | profile + memberships (all) + invoices (all) + payments + credits + active freezes — one aggregate for the detail page |
| `globalSearch(query)` | ranked people/leads/customers/invoices/memberships matching name/phone/email/no |

Every projection computes money in paise and formats in the renderer (`build.ts`), same as
the transactional reads.

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `REPORT_*` namespace):

```text
report:dashboardKpis            {} → DashboardKpis            (report.view)
report:expiringMemberships      { windowDays } → ExpiringRow[] (report.view)
report:paymentDues              { overdueOnly } → DueRow[]     (report.view)
report:funnel                   { from, to } → FunnelRow[]     (report.view)
report:revenueByPlan            { from, to } → RevenueRow[]    (report.view)
report:revenueByStaff           { from, to } → RevenueRow[]    (report.view)
report:revenueBySource          { from, to } → RevenueRow[]    (report.view)
report:dailyCollections         { from, to } → DayCollection[] (report.view)
report:monthlyCollections       { from, to } → MonthCollection[] (report.view)
report:outstandingDues          {} → OutstandingRow[]          (report.view)
report:membershipMetrics        { from, to } → MembershipMetrics (report.view)
report:customer360              { customerId } → Customer360   (customer.view + report.view)
report:globalSearch             { q } → SearchResults          (report.view)
```

Contracts in `src/shared/contracts/report.ts` mirror the renderer read-model types
(dashboard/types.ts, collections/types.ts, finance/types.ts) but with `*_minor` money and
ISO dates; the `build.ts` layer converts to rupee/date display values. All date-range
inputs validate `to >= from`.

## 6. Preload API

Add `window.api.report` in `src/preload/index.ts` + `index.d.ts` with one method per
channel above, unwrapping `data` or rejecting with the typed error.

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/dashboard/
├── api/
│   ├── dashboard.api.ts      # kpis/expiringMemberships/paymentDues
│   ├── finance-reports.api.ts# revenueByPlan/revenueByStaff/revenueBySource/membershipMetrics
│   ├── funnel.api.ts         # funnel(from,to)
│   └── index.ts
├── mappers.ts                # *_minor→₹, ISO→date, KPI formatting
└── queries.ts                # per-widget hooks (below)

features/collections/
├── api/
│   ├── collections.api.ts    # dailyCollections/monthlyCollections
│   └── index.ts
├── mappers.ts                # byMethod totals → display
└── queries.ts                # useDailyCollections/useMonthlyCollections

features/search/
├── api/
│   ├── search.api.ts         # globalSearch(q)
│   └── index.ts
├── mappers.ts                # ranked results → grouped display rows
└── queries.ts                # useGlobalSearch(q) with debounce

features/customers/
├── api/
│   ├── customer360.api.ts    # customer360(customerId) (window.api.report.*)
│   └── ...
```

- `features/dashboard/api/`: replace `mock-data.ts`/`store.ts` with `window.api.report.*`
  in wire shape; `queries.ts` adds `useDashboardKpis`, `useExpiringMemberships(windowDays)`,
  `usePaymentDues(overdueOnly)`, `useFunnel(from,to)`, `useRevenueByPlan/Staff/Source`,
  `useMembershipMetrics` — each invalidated when any transactional mutation invalidates
  `['dashboard']` (reference-transactions already centralizes sale invalidation).
- `features/collections/api/collections.api.ts`: replace `mock-data.ts` with
  `report:dailyCollections`; `queries.ts` `useDailyCollections(from,to)` invalidated on any
  `['finance']` mutation.
- `features/finance/api/`: `useOutstandingDues()` from `report:outstandingDues` for the
  dues widget; registers keep the granular `finance:*` reads.
- New `features/search/`: `useGlobalSearch(q)` with
  debounce, linking to the detail routes.
- Customer detail page: `useCustomer360(customerId)` (via
  `features/customers/api/customer360.api.ts`) feeds the drawer/record view.

## 8. UI wiring

- Dashboard keeps its widget layout; every widget reads a real report query. Member
  record drawer (`features/dashboard/member-record.ts`) becomes `report:customer360`.
- Collections page keeps its daily report table; rows now aggregate real payments.
- Finance "outstanding dues" widget and any receivable summary switch to
  `report:outstandingDues`.
- New global search bar in the top nav opens a results dropdown.
- Report period controls (from/to) are real inputs now (previously fixed mock dates).

## 9. Seed & permissions

- Permissions to add: `report.view`, `report.export` (used by ops export). Seed grants:
  Manager = all; Receptionist = `report.view` (dashboard, collections, outstanding);
  Sales = `report.view` (funnel, their own revenue); `report.export` = Manager only.
- No seed rows.

## 10. Tests

- **Projection correctness (repository/integration):** seed a known fixture
  (customers/memberships/invoices/payments/allocations/leads) and assert each projection's
  numbers: daily collections by method, outstanding dues, revenue by plan, funnel counts,
  dashboard KPIs — against hand-computed expected values, in paise.
- **Date ranges:** from/to filtering incl. month boundaries and empty ranges.
- **customer360:** one aggregate with correct membership history + invoice + payment +
  credit lists.
- **globalSearch:** matching by name/phone/email/invoice no; ranking (name hits first);
  org scoping.
- **IPC:** handler tests (validation, permission, envelope).
- **Renderer:** dashboard widgets render query results; collections table groups by day;
  search dropdown navigates.

## 11. Decisions & open items

1. **Query-time projection, not stored aggregates:** confirms the mock-type comments —
  every number is derived at read. Keeps the read models always consistent with the
  transactional tables; the supporting indexes keep them fast for a single-user desktop
  DB.
2. **Collections source:** `report:dailyCollections` (server-aggregated) wins over
  client-grouping `finance:listPayments` — settles finance.md §11.4.
3. **Dashboard "cold leads":** already real (leads store); the dashboard KPI reads it via
  the leads repository, not a duplicate query.
4. **Caching:** TanStack Query provides the client cache; no server-side cache. Invalidate
  broadly (`['dashboard']`, `['collections']`) on any relevant mutation so projections
  never go stale.
5. **Reconciliation / period definitions:** use `settings` (e.g. "expiring window days",
  "overdue grace days") so gyms can tune dashboard definitions without code changes.