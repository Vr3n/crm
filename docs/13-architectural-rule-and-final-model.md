# Module 13 — The One Architectural Rule & Final Domain Model

**Purpose:** the single page to pin above every developer's desk. If everything else in this spec is forgotten, this page alone should be enough to keep the system from degrading into an unmaintainable CRUD app.

---

# 80. Architectural Rule

The strongest architectural rule for the entire application is:

```text
UI describes what the user wants to do.
Application layer performs the use case.
Domain decides whether it is valid.
Repository persists the result.
SQLite guarantees structural consistency.
```

In other words:

```text
React
  ↓
Command / Query
  ↓
Application Service
  ↓
Domain
  ↓
Repository
  ↓
SQLite
```

not:

```text
React
  ↓
SQL
```

and not:

```text
React
  ↓
Generic CRUD API
  ↓
20 unrelated tables
```

That distinction will matter much more as billing and membership rules become complicated.

---

# 81. Final Domain Model

The first stable conceptual model can therefore be summarized as:

```text
                         ┌──────────────┐
                         │    Person    │
                         └──────┬───────┘
                                │
               ┌────────────────┴────────────────┐
               │                                 │
               ▼                                 ▼
           ┌────────┐                        ┌──────────┐
           │  Lead  │                        │ Customer │
           └───┬────┘                        └────┬─────┘
               │                                  │
        activities/followups                      │
               │                                  │
               └──────────────┐        ┌─────────┴─────────┐
                              │        │                   │
                              ▼        ▼                   ▼
                           Conversion Membership       Invoices
                                         │                  │
                                         │                  │
                                  ┌──────┴──────┐           │
                                  ▼             ▼           ▼
                               Plan           Offers      Payments
                                  │                         │
                                  │                         ▼
                                  │                   Allocations
                                  │                         │
                                  ▼                         ▼
                              Commercial                Refunds
                               Terms                    Credits
```

The most important conceptual boundary is:

```text
CATALOG
    Plan
    Offer
       ↓
SALES
    Lead
    Conversion
       ↓
CUSTOMER
    Membership
       ↓
BILLING
    Invoice
    Payment
    Credit
    Refund
       ↓
FINANCE / REPORTING
```

This gives the developers a domain model that can remain understandable while the application grows.

The system should first become correct at the level of these business concepts. Database tables, React components, routes, dialogs, and IPC handlers should then be derived from this model rather than becoming the model themselves.

### Research basis

Current fitness-management products consistently combine lead pipelines, follow-ups, membership management, billing, payments, reporting, and retention into one operational workflow.

Gym-specific implementations also show that membership freezing, cancellation, renewal, billing suspension, prorating, credits, and extension are policy-driven behaviors rather than one universal state transition.

For the local persistence layer, SQLite's documented transaction model and WAL mode fit the offline application well, provided write operations are kept transactional and the application respects SQLite's single-writer behavior.

Electron's current architecture supports isolating renderer code from privileged main-process/database operations through IPC and preload/context isolation.