# Module 5 — Dashboard & reports

- **Effort:** 2 days
- **Depends on:** M1 (schema + repo conventions), M2 (IPC), M4 (shell, Toaster, router)
- **Delivers:** the real `DashboardPage` — the metric counts, the 7-day lead trend
  chart, and the four dashboard tables (Recent Leads, Upcoming Expirations,
  Outstanding Payments, Recent Membership Sales) — plus the `dashboardRepo` queries and
  IPC channels behind them.

## 1. Goal

The dashboard is the port of `organization_dashboard_view` + its HTMX table endpoints.
After this module, opening the app shows live numbers from SQLite. All queries run in
main via `dashboardRepo`; the renderer is a pure consumer (TanStack Query + `react-chartjs-2`).

## 2. Inputs / sources (Django → port)

| Django source                                                | Ports to                                  |
| ------------------------------------------------------------ | ----------------------------------------- |
| `crown_crm/organizations/views.py` `organization_dashboard_view` | `dashboardRepo.getOverview()`           |
| `crown_crm/leads/views.py` `hx_lead_chart_data`              | `dashboardRepo.getTrend7d()`              |
| `crown_crm/accounting/views.py` `hx_recent_membership_sales_table` | `dashboardRepo.recentSales(page, size)` |
| `crown_crm/accounting/views.py` `hx_membership_expirations_table` | `dashboardRepo.expirations(page, size)` |
| `crown_crm/accounting/views.py` `hx_outstanding_payments_table`  | `dashboardRepo.outstanding(page, size)` |
| `crown_crm/accounting/tables.py` (columns, ₹ formatting)    | Dashboard table columns                   |
| `crown_crm/templates/organizations/dashboard.html`          | `DashboardPage` JSX layout                |

## 3. Design decisions (pinned)

1. **All money in cents out of main; `formatINR` (M1 §4.7) renders it.** The Django
   `₹ {{ ...|floatformat:2 }}` column content becomes `formatINR(totalPaidCents)`.
2. **One dashboard query bundle vs N round-trips:** `getOverview()` returns counts +
   both 7-day trends in one IPC call (the dashboard renders together anyway). The four
   tables are **separate, paginated** channels so HTMX-style per-table refresh and the
   `per_page` toggles (5/10) survive without refetching the whole page.
3. **Query keys match HTMX refresh triggers.** After a mutation that touches leads/sales
   (M6+), `invalidateQueries({ queryKey: ["dashboard"] })` refreshes the whole dashboard
   — the equivalent of the Django `lead-deleted`/`lead-created` events on
   `hx-trigger`.
4. **`per_page` is validated in main** (`{5, 10}`, fallback 5) — port of the Django
   `VALID_PER_PAGE` guard.
5. **7-day trend buckets are computed in SQL** (GROUP BY `date(created_at)`), then
   zero-filled in the renderer — avoids the O(n) Python dictionary scan and the
   `TruncDate` port is straightforward.

## 4. Implementation steps

### 4.1 Contracts (`src/common/contract.ts` additions)

```ts
export const DashboardOverview = z.object({
  leadCount: z.number(),
  recentLeadCount: z.number(),        // created in last 30 days
  salesDates7d: z.array(z.string()),  // labels "Aug 05" …
  salesTrend7d: z.array(z.number()),
  leadTrend7d: z.array(z.number()),
});
export type DashboardOverview = z.infer<typeof DashboardOverview>;

export const TableQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.union([z.literal(5), z.literal(10)]).default(5),
});

export const RecentSaleRow = z.object({
  uuid: z.string(),
  leadName: z.string(),
  duration: z.string(),
  totalPaidCents: z.number(),
  balanceCents: z.number(),
  created_at: z.string(),
});

export const ExpiringRow = z.object({
  uuid: z.string(),
  leadName: z.string(),
  membershipStartDate: z.string().nullable(),
  membershipEndDate: z.string().nullable(),
  daysLeft: z.number(),
  totalPaidCents: z.number(),
  balanceCents: z.number(),
});

export const OutstandingRow = z.object({
  uuid: z.string(),
  leadName: z.string(),
  membershipStartDate: z.string().nullable(),
  priceCents: z.number(),
  totalPaidCents: z.number(),
  balanceCents: z.number(),
});

export const Paged<T extends z.ZodTypeAny> = z.object({
  rows: z.array(T),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
});
export type Paged<T> = { rows: T[]; total: number; page: number; perPage: number };

export const CH = {
  // ...existing channels...
  dashboard: {
    overview: "dashboard:overview",
    recentSales: "dashboard:recentSales",
    expirations: "dashboard:expirations",
    outstanding: "dashboard:outstanding",
    recentLeads: "dashboard:recentLeads",
  },
} as const;
```

### 4.2 `dashboardRepo` (`src/main/db/repositories/dashboard.ts`)

Raw SQL, soft-delete-filtered everywhere. Money aggregated as cents.

```ts
import type { Database } from "better-sqlite3";

export const dashboardRepo = {
  getOverview(db: Database) {
    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 6 * 86_400_000); // today..6 days back

    const leadCount = (db.prepare(
      "SELECT COUNT(*) AS c FROM leads WHERE is_deleted = 0",
    ).get() as any).c;
    const recentLeadCount = (db.prepare(
      "SELECT COUNT(*) AS c FROM leads WHERE is_deleted = 0 AND created_at >= ?",
    ).get(thirtyDaysAgo) as any).c;

    // group by UTC date for the trailing 7 days; zero-fill client-side
    const salesBuckets = db.prepare(
      `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c
         FROM memberships
        WHERE is_deleted = 0 AND created_at >= ?
        GROUP BY d ORDER BY d`,
    ).all(sevenDaysAgo.toISOString()) as { d: string; c: number }[];

    const leadBuckets = db.prepare(
      `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c
         FROM leads
        WHERE is_deleted = 0 AND created_at >= ?
        GROUP BY d ORDER BY d`,
    ).all(sevenDaysAgo.toISOString()) as { d: string; c: number }[];

    return { leadCount, recentLeadCount, salesBuckets, leadBuckets };
  },

  /** Recent membership sales — port of hx_recent_membership_sales_table. */
  recentSales(db: Database, page: number, perPage: number) {
    const where = "m.is_deleted = 0";
    const total = (db.prepare(
      `SELECT COUNT(*) AS c FROM memberships m WHERE ${where}`,
    ).get() as any).c;
    const rows = db.prepare(
      `SELECT m.uuid,
              CASE WHEN l.middle_name IS NULL THEN l.first_name || ' ' || l.last_name
                   ELSE l.first_name || ' ' || l.middle_name || ' ' || l.last_name END AS leadName,
              m.duration,
              COALESCE(SUM(r.amount_cents), 0) AS totalPaidCents,
              COALESCE(m.price_cents, 0) - COALESCE(SUM(r.amount_cents), 0) AS balanceCents,
              m.created_at
         FROM memberships m
         JOIN leads l ON l.uuid = m.lead_id AND l.is_deleted = 0
         LEFT JOIN receipts r ON r.sale_id = m.uuid AND r.is_deleted = 0
        WHERE ${where}
        GROUP BY m.uuid
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?`,
    ).all(perPage, (page - 1) * perPage) as any[];
    return { rows, total, page, perPage };
  },

  /** Upcoming expirations — port of hx_membership_expirations_table (60-day window). */
  expirations(db: Database, page: number, perPage: number) {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const where = `m.is_deleted = 0 AND m.membership_end_date >= '${today}' AND m.membership_end_date <= '${cutoff}'`;
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM memberships m WHERE ${where}`).get() as any).c;
    const rows = db.prepare(
      `SELECT m.uuid,
              CASE WHEN l.middle_name IS NULL THEN l.first_name || ' ' || l.last_name
                   ELSE l.first_name || ' ' || l.middle_name || ' ' || l.last_name END AS leadName,
              m.membership_start_date, m.membership_end_date,
              CAST(julianday(m.membership_end_date) - julianday(?) AS INTEGER) AS daysLeft,
              COALESCE(SUM(r.amount_cents), 0) AS totalPaidCents,
              COALESCE(m.price_cents, 0) - COALESCE(SUM(r.amount_cents), 0) AS balanceCents
         FROM memberships m
         JOIN leads l ON l.uuid = m.lead_id AND l.is_deleted = 0
         LEFT JOIN receipts r ON r.sale_id = m.uuid AND r.is_deleted = 0
        WHERE ${where}
        GROUP BY m.uuid
        ORDER BY m.membership_end_date ASC
        LIMIT ? OFFSET ?`,
    ).all(today, perPage, (page - 1) * perPage) as any[];
    return { rows, total, page, perPage };
  },

  /** Outstanding payments — port of hx_outstanding_payments_table (balance > 0). */
  outstanding(db: Database, page: number, perPage: number) {
    const where = `m.is_deleted = 0 AND m.price_cents IS NOT NULL
                   AND (m.price_cents - COALESCE((SELECT SUM(amount_cents) FROM receipts r WHERE r.sale_id = m.uuid AND r.is_deleted = 0), 0)) > 0`;
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM memberships m WHERE ${where}`).get() as any).c;
    const rows = db.prepare(
      `SELECT m.uuid,
              CASE WHEN l.middle_name IS NULL THEN l.first_name || ' ' || l.last_name
                   ELSE l.first_name || ' ' || l.middle_name || ' ' || l.last_name END AS leadName,
              m.membership_start_date, m.price_cents AS priceCents,
              COALESCE(SUM(r.amount_cents), 0) AS totalPaidCents,
              m.price_cents - COALESCE(SUM(r.amount_cents), 0) AS balanceCents
         FROM memberships m
         JOIN leads l ON l.uuid = m.lead_id AND l.is_deleted = 0
         LEFT JOIN receipts r ON r.sale_id = m.uuid AND r.is_deleted = 0
        WHERE ${where}
        GROUP BY m.uuid
        ORDER BY m.membership_start_date ASC
        LIMIT ? OFFSET ?`,
    ).all(perPage, (page - 1) * perPage) as any[];
    return { rows, total, page, perPage };
  },

  /** Recent leads (the dashboard's "Recent Leads" card) — 5 rows, newest first. */
  recentLeads(db: Database, limit = 5) {
    return db.prepare(
      `SELECT uuid, first_name, middle_name, last_name, status
         FROM leads WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ?`,
    ).all(limit) as any[];
  },
};
```

Notes on the port:

- `daysLeft` is computed in SQL from `julianday` (Django computes `days_left` in Python
  on `membership_end_date - today`); results match.
- The outstanding subquery excludes fully-paid sales (Django's `.exclude(balance=0)`).
- `where` strings are **static literals**; `page`/`perPage` are bound parameters. The
  `where` fragments contain no user input — never interpolate `search` etc. into them
  (search is M6 and uses bound params).

### 4.3 IPC handlers (`src/main/ipc/dashboard.ts`)

```ts
import { registerIpc } from "./registry";
import { CH, DashboardOverviewSchema, TableQuerySchema, Paged, z } from "@common/contract";
import { dashboardRepo } from "../db/repositories/dashboard";

export function registerDashboardIpc(db: Database): void {
  registerIpc(CH.dashboard.overview, z.object({}), (ctx) => dashboardRepo.getOverview(ctx.db));

  registerIpc(CH.dashboard.recentSales, TableQuerySchema, (ctx, q) =>
    dashboardRepo.recentSales(ctx.db, q.page, q.perPage),
  );
  registerIpc(CH.dashboard.expirations, TableQuerySchema, (ctx, q) =>
    dashboardRepo.expirations(ctx.db, q.page, q.perPage),
  );
  registerIpc(CH.dashboard.outstanding, TableQuerySchema, (ctx, q) =>
    dashboardRepo.outstanding(ctx.db, q.page, q.perPage),
  );
  registerIpc(CH.dashboard.recentLeads, z.object({ limit: z.number().int().min(1).max(10).default(5) }), (ctx, q) =>
    dashboardRepo.recentLeads(ctx.db, q.limit),
  );
}
```

### 4.4 Preload additions (`src/preload/index.ts`)

```ts
dashboard: {
  overview: () => ipcRenderer.invoke("dashboard:overview"),
  recentSales: (q) => ipcRenderer.invoke("dashboard:recentSales", q),
  expirations: (q) => ipcRenderer.invoke("dashboard:expirations", q),
  outstanding: (q) => ipcRenderer.invoke("dashboard:outstanding", q),
  recentLeads: (limit) => ipcRenderer.invoke("dashboard:recentLeads", { limit }),
},
```

### 4.5 Renderer — `DashboardPage` (`src/renderer/src/features/dashboard/DashboardPage.tsx`)

Layout follows `dashboard.html`: two cards up top (Recent Leads, Upcoming Expirations),
two below (Outstanding Payments, Recent Membership Sales), plus metric cards for
Total Leads / Recent-30-day Leads and a 7-day chart row. The Django template's metric
cards and chart are commented out (`dashboard.html:22–64`); this port **enables** them —
they were the intended dashboard.

Data with one `useQuery(["dashboard", "overview"])` + per-table queries:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
} from "chart.js";
import { call } from "../../lib/api";
import { formatINR } from "../../lib/money";
import { DataTable } from "../../components/DataTable";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement);

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => call(window.api.dashboard.overview()),
  });
  const expirations = useQuery({
    queryKey: ["dashboard", "expirations", 1, 5],
    queryFn: () => call(window.api.dashboard.expirations({ page: 1, perPage: 5 })),
  });

  if (overview.isLoading) return <div className="p-5 text-center">Loading…</div>;
  const d = overview.data!;

  const chartData = {
    labels: d.salesDates7d,
    datasets: [
      { label: "Membership Sales", data: d.salesTrend7d, borderColor: "#dc3545", tension: 0.3 },
      { label: "Leads", data: d.leadTrend7d, borderColor: "#007bff", tension: 0.3 },
    ],
  };

  return (
    <div className="container-fluid">
      <h4>Welcome, to <span className="text-primary">{/* gym name — M10 */}</span></h4>

      {/* metric cards (Django dashboard.html:22-64, now enabled) */}
      <div className="row">
        <div className="col-md-4 mb-4">
          <div className="metric-card">
            <p className="text-muted">Total Leads</p>
            <div className="metric-value">{d.leadCount}</div>
            <div className="metric-change up">{d.recentLeadCount} this month</div>
          </div>
        </div>
        <div className="col-md-8 mb-4">
          <div className="card"><div className="card-body">
            <h6 className="text-danger mb-0">7-Day Activity</h6>
            <Line data={chartData} />
          </div></div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6"><RecentLeadsCard /></div>
        <div className="col-md-6">
          <ExpirationsCard query={expirations} />
        </div>
      </div>
      <div className="row mt-4">
        <div className="col-md-6"><OutstandingCard /></div>
        <div className="col-md-6"><RecentSalesCard /></div>
      </div>
    </div>
  );
}
```

The four cards use a shared paginated `DataTable` component (built here, reused by M6+):

```tsx
// src/renderer/src/components/DataTable.tsx — generic paged table (5/10 per page)
export function DataTable<T>({ columns, rows, total, page, perPage, onPageChange, onPerPageChange }: {
  columns: { key: string; label: string; render: (row: T) => ReactNode }[];
  rows: T[]; total: number; page: number; perPage: number;
  onPageChange: (p: number) => void; onPerPageChange: (p: number) => void;
}) {
  return (
    <>
      <div className="table-responsive-sm">
        <table className="table table-sm table-hover">
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* pagination: Prev/Next + per-page 5/10 select, mirroring the Django RequestConfig */}
    </>
  );
}
```

Each card is its own `useQuery(["dashboard", <kind>, page, perPage])` so changing
`perPage` only refetches that table.

### 4.6 Dashboard refresh wiring

Add to M4's `queryClient` default invalidations — after any leads/sales mutation
(M6/M8), the dashboard refetches:

```ts
// in the mutation helper used by M6/M8
queryClient.invalidateQueries({ queryKey: ["dashboard"] });
```

This is the React equivalent of the Django HTMX `lead-created`, `lead-deleted`,
`sale-created` triggers on the dashboard table containers.

### 4.7 Tests (`tests/db/dashboard.test.ts`)

Seed a temp db with 2 leads (one recent), 2 memberships (one paid, one outstanding, one
expiring) and assert the repo outputs. Add an integration test over the SQL so a schema
regression (e.g., a dropped index or column rename) fails the build:

```ts
describe("dashboardRepo", () => {
  // seed...
  it("counts leads and recent leads", () => {
    const o = dashboardRepo.getOverview(db);
    expect(o.leadCount).toBe(2);
    expect(o.recentLeadCount).toBe(1);
  });
  it("excludes fully-paid sales from outstanding", () => {
    const { rows } = dashboardRepo.outstanding(db, 1, 5);
    expect(rows.length).toBe(1); // only the unpaid one
    expect(rows[0].balanceCents).toBeGreaterThan(0);
  });
  it("returns only memberships expiring within 60 days", () => {
    const { rows } = dashboardRepo.expirations(db, 1, 5);
    expect(rows.every((r) => r.membershipEndDate != null)).toBe(true);
  });
});
```

## 5. Acceptance criteria (definition of done)

1. Dashboard renders with live counts, the 7-day line chart (Chart.js from npm, offline),
   and the four tables.
2. `per_page` toggles 5/10 work per table; invalid values fall back to 5 (main-side).
3. Fully-paid sales are absent from Outstanding; expirations only within the 60-day
   window, ascending by end date; recent sales newest-first; all money shown via
   `formatINR`.
4. After a leads/sales mutation elsewhere, the dashboard refreshes (invalidate wiring).
5. `dashboardRepo` queries are covered by vitest against seeded temp db.
6. `npm run build` + `npm run lint` green.

## 6. Edge cases / gotchas

- **Zero-fill:** if a day has no sales/leads, its bucket is absent from the SQL result —
  the renderer must zero-fill all 7 labels (Django did this with `sales_dates.index`).
- **`price_cents IS NULL`** (membership without a set price): excluded from outstanding
  (Django's `.filter(price__isnull=False)`), included in recent sales with `0` balance.
- **`julianday` vs Python `date.today()`:** SQLite uses UTC `julianday('now')` if you use
  it — pass the explicit `today` string (already in the query) so it matches the local
  date used for the expiry window.
- **Chart.js tree-shaking:** register only the scales/elements you use to keep the
  bundle small (shown above); importing `Chart` wholesale pulls in unused plugins.
- **Money must never be formatted in main** — `dashboardRepo` returns raw cents.

## 7. Files touched

Created (in `crm-electron/`): `src/main/db/repositories/dashboard.ts`,
`src/main/ipc/dashboard.ts`, `src/renderer/src/features/dashboard/DashboardPage.tsx`,
`src/renderer/src/features/dashboard/{RecentLeadsCard,ExpirationsCard,OutstandingCard,
RecentSalesCard}.tsx`, `src/renderer/src/components/DataTable.tsx`,
`tests/db/dashboard.test.ts`.

Updated: `src/common/contract.ts` (dashboard schemas + channels), `src/preload/index.ts`
(dashboard API), M4 `lib/query.ts` (dashboard invalidation wiring).

Django files read (no writes): `organizations/views.py`,
`accounting/views.py` (`hx_membership_expirations_table`, `hx_recent_membership_sales_table`,
`hx_outstanding_payments_table`), `leads/views.py` (`hx_lead_chart_data`),
`accounting/tables.py`, `templates/organizations/dashboard.html`.
