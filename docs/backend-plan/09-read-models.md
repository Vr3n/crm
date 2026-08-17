# 09 — Read Models: Dashboards, Reporting, Search & Customer 360

**Ties to:** Module 09.
**Depends on:** 01–05 (this is a read layer over the transactional tables).
**Feeds into:** the renderer dashboard pages.

Built last, per Module 12 §79: a dashboard built against an incomplete domain model gets
rebuilt when the model changes. Every number here is a **query derived from the
transactional tables** — never a separately maintained counter (Module 09 §why-read-model).
If a cached read model is ever introduced, it must be rebuildable from source records.

## Query set

Read-only handlers in `src/main/application/*/queries.ts`; gated by read permissions
(`report.view`, `lead.view`, `invoice.view`, `payment.view`, `membership.view`).

### Operational dashboard (Module 09 §58)

```text
GetDashboardOperational report.view
  - Today's follow-ups          (lead_followups: due today, not completed)
  - New leads                  (leads created today)
  - Overdue follow-ups          (due < today, not completed)
  - Memberships expiring soon   (end_date within N days, status ACTIVE)
  - Outstanding dues            (invoices not PAID/VOID → live sum of outstanding)
  - Today's collections         (SUM payments.payment_date = today, GROUP BY method)
  - Recent payments             (latest N payments)
  - Recent membership sales     (latest N memberships created)
```

### Sales funnel & metrics (Module 09 §59–60)

```text
GetFunnelCounts        report.view  -- per lead_stage counts (stages are data, ADR-0007)
GetSalesMetrics        report.view  -- lead count, contact/visit/trial/conversion/lost rates,
                                     -- avg conversion time, revenue by source, revenue by salesperson
RevenueBySalesperson   report.view  -- links payments → invoices → memberships → lead owner
RevenueByLeadSource    report.view  -- lead.source survives conversion (Module 09 §60)
```

### Finance views (Module 09 §62)

```text
GetDailyCollections         report.view -- by method + total, from payments (Module 09 §63)
GetMonthlyCollections       report.view -- month-to-date, from payments
GetOutstandingInvoices      payment.view -- derived: finalized − allocated − credits
GetInvoiceList              invoice.view -- filtered by status (OPEN/PARTIALLY_PAID/PAID/VOID/UNCOLLECTIBLE)
GetRefundsSummary / GetCreditsSummary    -- totals, this month
GetRevenueByPlan            report.view -- from invoice lines (plan_id reference, snapshotted)
```

### Membership metrics (Module 09 §61)

```text
GetMembershipMetrics report.view
  -- active / frozen / expiring / expired / cancelled / new / renewed / upgraded / downgraded
```

### Global search (Module 09 §69)

```text
SearchPeople report.view (or search.*)
  -- name / phone / email → person → leads + customer
SearchInvoices invoice.view -- by invoice number or customer
SearchMemberships membership.view -- by membership/customer
```

Phone-number search is prioritized for gym workflows.

### Customer 360 (Module 09 §70)

```text
GetCustomer360 customer.view
  -- profile + current/active membership + financial summary (outstanding)
  -- + sales history (conversion source) + activity + follow-ups + invoices + payments
```

Composed from the existing read queries so the employee never navigates five screens.

## Read model discipline

- Reporting queries use optimized SQL / read models and live apart from the write-side
  repository interfaces (Module 09 §71). `MembershipRepository` does not grow a
  `getRevenueByMonthAndPlanAndSalespersonAndLeadSource()` method.
- Dashboards never write. If the renderer needs a refresh trigger, it subscribes to the
  domain events from `06-backbone.md` (post-commit) or re-fetches on navigation.

## Tests

- Daily collections = `SUM(payments)` grouped by method for a date; correct after a
  payment is corrected (re-run reflects the change — Module 09 §worked example).
- Funnel counts match `lead_stage_history`/`leads` reality.
- Outstanding dues = live derivation; equals the sum of per-invoice outstanding.
- Revenue-by-source survives conversion (lead.source preserved on the conversion path).
- Search by phone finds the person and links leads + memberships + invoices.
- Query handlers never mutate state (assert no DML in query path).
