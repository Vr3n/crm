# Module 09 — UI Module Structure, Dashboards & Reporting

**Bounded context:** presentation / read-models.
**Depends on:** all business modules (this is a read layer over them, built last per the recommended development order in Module 12).

## Why this module is explicitly a "read model," not a source of truth

Every number on a dashboard (today's collections, sales funnel counts, active-membership counts) must be a **query derived from the transactional tables** in Modules 01–06 — never a separately maintained counter. The temptation to add `dashboard_stats` tables that get incremented on every transaction is understandable (it's fast to query) but dangerous (it drifts from reality the first time an edge case is missed). If performance becomes a real issue later, add a materialized/cached read table that is *rebuildable from scratch* by re-running the query — never one that's the only place a number lives.

## Worked example: "Daily Collection" report, traced to its source

```text
Report requested: "Daily Collection for 2026-08-13"

Underlying query (conceptually):
  SELECT payment_method, SUM(amount)
  FROM payments
  WHERE payment_date = '2026-08-13'
  GROUP BY payment_method

Result:
  CASH            ₹8,500
  UPI             ₹22,300
  CARD            ₹6,000
  ────────────────────────
  Total           ₹36,800
```

Nothing here is stored redundantly — it's a live aggregation over Module 05's `payments` table. If a payment recorded today turns out to have the wrong date and gets corrected, tomorrow's re-run of this exact report reflects the correction automatically, with zero risk of a stale cached total.

## Technical decision, explained intuitively

**Why does the spec insist the dashboard shouldn't be built first, even though it's the most visible, most demo-friendly screen?**
Because a dashboard built against an incomplete or wrong domain model has to be rebuilt when the model changes — twice the work. Worse, a flashy dashboard built early tends to freeze the underlying data model prematurely ("we can't change the schema, the dashboard depends on it") before the business rules are actually settled. Build the boring, correct backbone (Modules 01–06) first; the dashboard then becomes a comparatively quick, low-risk layer on top.

---

# 57. UI Module Structure

The application can map closely to the bounded contexts:

```text
src/
    main/
        database/
        ipc/
        application/
        domain/
        infrastructure/

    renderer/
        features/
            leads/
            customers/
            memberships/
            plans/
            offers/
            billing/
            finance/
        components/
        routes/
```

Do not create a separate file for every trivial concept.

The goal is domain clarity, not maximum file count.

---

# 58. Dashboard

The first dashboard should represent operational work rather than vanity statistics.

Recommended sections:

```text
Today's Follow-ups
New Leads
Overdue Follow-ups
Memberships Expiring Soon
Outstanding Dues
Today's Collections
Recent Payments
Recent Membership Sales
```

Management metrics can come later:

```text
Lead Conversion Rate
Revenue
Average Membership Value
Renewal Rate
Churn
Outstanding Receivables
Salesperson Conversion
Plan Performance
```

---

# 59. Sales Funnel

Recommended funnel:

```text
NEW
  ↓
CONTACTED
  ↓
INTERESTED
  ↓
VISIT
  ↓
TRIAL
  ↓
NEGOTIATION
  ↓
WON / LOST
```

Do not force every lead through every stage.

A walk-in who immediately buys could legitimately go:

```text
NEW → WON
```

Stage history should preserve what actually happened.

---

# 60. Sales Metrics

The domain should support:

```text
Lead count
Contact rate
Visit rate
Trial rate
Conversion rate
Lost rate
Average conversion time
Revenue from converted leads
Revenue by lead source
Revenue by salesperson
```

A lead source should therefore survive conversion.

For example:

```text
Instagram
    → 100 leads
    → 30 members
    → ₹450,000 revenue
```

This is more useful than simply knowing the member's current status.

---

# 61. Membership Metrics

The system should eventually support:

```text
Active memberships
Frozen memberships
Expiring memberships
Expired memberships
Cancelled memberships
Renewals
Non-renewals
New memberships
Upgrades
Downgrades
```

This supports retention analysis.

---

# 62. Finance Dashboard

Initial financial views:

```text
Today's Collections
This Month's Collections
Outstanding Dues
Paid Invoices
Partially Paid Invoices
Voided Invoices
Refunds
Credits
Payment Method Breakdown
Plan Revenue
Salesperson Revenue
```

Financial reports should derive their numbers from invoices/payment records, not from counters maintained by the frontend.

---

# 63. Daily Collection

For a gym manager, the daily collection report should answer:

```text
How much money was recorded today?

Cash:
    ₹X

UPI:
    ₹Y

Card:
    ₹Z

Bank Transfer:
    ₹A

Total:
    ₹B
```

This should be reconstructible from payment records.

Later, a `CashSession` / `RegisterClose` concept can be added:

```text
Opening Cash
+ Cash Payments
- Refunds
= Expected Closing Cash
```

This is especially useful for gyms handling significant cash.

---



---

## Search, Customer 360 View & Reporting Principle

*(Original spec sections 69-71.)*

# 69. Search

The application should provide global or context-aware search.

A receptionist should be able to search:

```text
Name
Phone
Email
Membership ID
Invoice Number
Lead
```

Phone number search is particularly important for gym workflows.

Search should lead to the person's operational workspace:

```text
Customer Profile
    ├── Overview
    ├── Leads
    ├── Memberships
    ├── Invoices
    ├── Payments
    ├── Activities
    └── Notes
```

---

# 70. Customer 360 View

The customer page should be the central operational page.

Conceptually:

```text
Customer
─────────────────────────────────

Rahul Sharma
Phone: ...
Email: ...

Membership
───────────
Premium Annual
Active
Expires: ...

Financial
─────────
Outstanding: ₹2,000

Sales History
─────────────
Converted from Referral

Activity
────────
Calls
Visits
Notes
Follow-ups

Invoices
────────
INV-1001
INV-1042

Payments
────────
₹20,000
₹2,000
```

The employee should not have to navigate through five separate modules to understand the current state of a customer.

---

# 71. Reporting Principle

Operational reports and domain writes should be separated.

For example:

```text
MembershipRepository
```

does not need a method:

```text
getRevenueByMonthAndPlanAndSalespersonAndLeadSource()
```

Reporting queries can use optimized SQL/read models.

This keeps the domain model comprehensible.

---

