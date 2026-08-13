# Gym CRM — Domain-Driven Software Specification (v0.2, Modular)

This is a restructured, modularized version of the original v0.1 specification. Content and rules are unchanged where they were already correct — this pass reorganizes everything into independently implementable modules, adds worked examples for the concepts that most commonly get built wrong (freeze, payment allocation, refund vs. credit, invoice snapshotting, transaction atomicity), and explains the reasoning behind each major technical decision so the team understands *why*, not just *what*.

See `REVIEW.md` for a summary of what changed and why, plus a short gap analysis against how current gym-management products handle this domain.

## How to read this

Each file in `modules/` is a **bounded context** — a self-contained slice of the business that a developer (or pair) can implement, test, and reason about mostly on its own, with clearly stated dependencies on other modules. Build them roughly in the numbered order; that order also matches the recommended development sequence (Module 12).

| # | Module | Bounded Context | Depends On | One-line summary |
|---|--------|------------------|------------|-------------------|
| 01 | [People, Leads & Sales Pipeline](modules/01-people-leads-sales.md) | Sales / CRM | — | Enquiry → activities → follow-ups → stages → conversion |
| 02 | [Customers & Memberships](modules/02-customers-and-memberships.md) | Customer | 01, 03 | Customer identity, membership lifecycle, freeze, renewal, cancellation |
| 03 | [Catalog & Offers](modules/03-catalog-and-offers.md) | Catalog | — | Plans, offers/discounts, pricing rules (not stock inventory) |
| 04 | [Billing & Invoicing](modules/04-billing-and-invoicing.md) | Billing | 02, 03 | Invoices, invoice lines, tax, money representation, snapshotting |
| 05 | [Payments & Finance](modules/05-payments-and-finance.md) | Finance | 04 | Payments, allocations, refunds, credits, outstanding balance |
| 06 | [Domain Model Backbone](modules/06-domain-model-backbone.md) | Cross-cutting | 01–05 (conceptually) | Audit, aggregate boundaries, domain services, commands/queries |
| 07 | [Reference Transactions](modules/07-reference-transactions.md) | Cross-cutting | 02, 04, 05 | Worked, atomic, copy-paste-ready sale/payment/freeze transactions |
| 08 | [Persistence & Electron Architecture](modules/08-persistence-and-electron-architecture.md) | Technical | — | SQLite rules, layering, Electron main/renderer split |
| 09 | [UI, Dashboards & Reporting](modules/09-ui-dashboards-and-reporting.md) | Read-model | all | Dashboards, funnel, finance views, search, customer 360 |
| 10 | [Data Integrity, Concurrency & Ops](modules/10-integrity-concurrency-and-ops.md) | Cross-cutting | all | Delete policy, concurrency, backup, import/export |
| 11 | [State Machines & Domain Events](modules/11-state-machines-and-domain-events.md) | Cross-cutting reference | 01, 02, 04 | Canonical lifecycle diagrams and event list |
| 12 | [Scope, Roadmap & Acceptance](modules/12-scope-roadmap-workflows-acceptance.md) | Project management | all | What not to build yet, build order, workflows, acceptance criteria |
| 13 | [The One Architectural Rule](modules/13-architectural-rule-and-final-model.md) | Summary | all | The single page to keep the whole system honest |
| 14 | [Organization & Multi-Tenancy Readiness](modules/14-organization-and-multi-tenancy.md) | Root / cross-cutting | — | Every table scoped by `organization_id`, even with 1 org today |
| 15 | [Users, Roles & Access Control](modules/15-users-roles-and-access-control.md) | Cross-cutting | 14 | RBAC: Users hold Roles, Roles hold Permissions, code checks Permissions |

## The four non-negotiable rules (repeated everywhere on purpose)

1. **Historical truth is never rewritten.** A price change, offer change, or catalog edit must never alter a past invoice, membership, or payment. Every module snapshots the commercial numbers that matter at the moment they're locked in.
2. **Every multi-table business operation is one atomic transaction.** A sale, a payment, a freeze — if the app crashes mid-way, the database contains either the whole thing or none of it. Never half of one. (See Module 07.)
3. **UI never talks to SQLite directly.** React → Command/Query → Application Service → Domain → Repository → SQLite. This is what keeps the other two rules enforceable as the team grows. (See Module 08 & 13.)
4. **Every row belongs to exactly one Organization, and every action is checked against a Permission, not a role name.** Even with one gym and one Owner login today, this keeps the door open to multiple gyms and multiple staff roles without a schema rewrite. (See Modules 14 & 15.)

## Suggested build order

Modules 14 → 15 (identity/tenancy scaffolding, needed by everything else) → 01 → 03 → 02 → 04 → 05 → 06/07/08 (in parallel, as scaffolding) → 09 → 10 → 11 (reference throughout) → 12 (guides scope at every step).

## Note on Modules 14 & 15 (added after initial review, then revised)

These two modules were added in a second pass, at the requester's direction, to establish **Organization** as the tenancy root that every other module's tables hang off (`organization_id` on every row, even though v1 ships with exactly one organization created during first-run setup), and a standard **RBAC** model (Users → Roles → Permissions) so different staff — e.g. a Sales person vs. a Front Desk/caller — can log in with genuinely different access to different domain actions, enforced at the Command layer (Module 06), not just hidden in the UI.

Module 15 was then revised a second time to reflect **slug-based tenancy with global User identity**: a User is no longer pinned to exactly one Organization via a plain `organization_id` column. Instead, `Organization` gets a unique `slug` (Module 14), `User` becomes a global identity, and the two are connected through an `OrganizationMembership` join table that also carries the per-organization Role. Login is identified by `(organization slug, email)` rather than by a globally unique email column, and the session/auth context now explicitly carries an "active organization" that every Command reads from — not a fixed value baked into the user row. This makes one login capable of spanning multiple organizations (e.g. an owner running two locations) without weakening per-organization data isolation, which is still enforced unconditionally by the active `organization_id` in the session, per Module 14. v1's UI and setup flow are unaffected — one org, one membership per user, no switcher — the schema is simply no longer a barrier to more.
