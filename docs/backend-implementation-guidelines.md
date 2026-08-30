# Crown CRM — Backend Implementation Guidelines

## 1. Purpose

This document is the implementation standard for the Crown CRM backend.

The current product is a standalone desktop application:

```text
Vite + React
      ↓
Electron Renderer
      ↓
Preload / IPC
      ↓
Application Backend
      ↓
Drizzle ORM
      ↓
SQLite
```

The backend must be designed so that the business/application layer does not depend on Electron, React, IPC, or SQLite-specific APIs.

A future hosted version may replace the transport and persistence infrastructure:

```text
Next.js
   ↓
HTTP/API
   ↓
Application Backend
   ↓
Drizzle ORM
   ↓
PostgreSQL
```

However, **future hosting must not introduce unnecessary infrastructure into the current standalone application**.

The current application does not need a local HTTP server, REST API, cloud synchronization, authentication infrastructure, multi-tenancy, payment gateways, or other hosted-only functionality.

This follows the existing project scope and architecture rules.

---

# 2. Authoritative architecture

The backend must follow:

```text
Renderer
   ↓
IPC Adapter
   ↓
Application
   ↓
Domain
   ↓
Repository Interface
   ↓
SQLite / Drizzle
```

The existing project specification describes this as:

```text
UI → Command/Query → Application Service → Domain → Repository → SQLite
```

and explicitly prohibits UI-to-SQL access and generic CRUD API thinking.

The dependency direction is:

```text
UI
 ↓
Transport
 ↓
Application
 ↓
Domain
 ↓
Persistence abstraction

Infrastructure implements the persistence abstraction.
```

Infrastructure dependencies must never leak upward.

In particular:

```text
Domain ❌ → Drizzle
Domain ❌ → SQLite
Domain ❌ → Electron
Domain ❌ → React

Application ❌ → Electron
Application ❌ → ipcMain
Application ❌ → React

Renderer ❌ → Drizzle
Renderer ❌ → SQLite
Renderer ❌ → ipcRenderer
```

The renderer only talks to the API exposed through preload.

---

# 3. What each layer means

## Domain

The domain contains business concepts and invariants.

Examples:

```text
Lead
Customer
Plan
Offer
Membership
Invoice
Payment
Credit
Refund
```

and their associated:

```text
Entities
Value Objects
State Machines
Domain Rules
Domain Services
Domain Errors
```

The existing specification explicitly defines these responsibilities.

The domain must not know how objects are persisted.

For example:

```ts
class Membership {
    renew(...);
    freeze(...);
    cancel(...);
}
```

is appropriate.

This is not:

```ts
class Membership {
    async save() {
        await db.update(...);
    }
}
```

The latter couples business logic to persistence.

---

# 4. Application layer

The application layer represents **what the business wants to do**.

Do not organize the application primarily around CRUD operations.

Avoid:

```text
createMembership()
updateMembership()
deleteMembership()
```

Prefer business use cases:

```text
SellMembership
RenewMembership
FreezeMembership
CancelMembership

ConvertLead
ChangeLeadStage
RecordLeadActivity

CreateInvoice
FinalizeInvoice
RecordPayment
IssueCredit
ProcessRefund
```

This follows the existing requirement that business workflows, rather than UI screens or database tables, determine implementation boundaries.

A use case should answer:

> What business operation is being performed?

It should coordinate the domain and repositories necessary to perform that operation.

---

# 5. Transaction ownership

This is a mandatory rule.

**The application use case owns the transaction boundary.**

A repository must never independently commit a business operation.

For example, `SellMembership` may perform:

```text
BEGIN

validate customer
validate plan/offer
calculate commercial terms

create membership
snapshot commercial terms

create invoice
create invoice lines

record initial payment
allocate payment

record audit information

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

The existing transaction specification explicitly requires this atomicity.

Drizzle provides transaction APIs for grouping multiple statements into one commit/rollback unit. ([Drizzle ORM][1])

The implementation should therefore provide a small transaction abstraction around Drizzle rather than allowing individual repositories to decide transaction boundaries.

Conceptually:

```ts
transaction.run(async (tx) => {
  // repositories operate using tx
})
```

Repositories receive the transaction context when participating in a business transaction.

---

# 6. Repository layer

Repositories represent persistence needs of the application/domain.

Examples:

```text
LeadRepository
CustomerRepository
MembershipRepository
PlanRepository
OfferRepository
InvoiceRepository
PaymentRepository
CreditRepository
RefundRepository
```

A repository interface should describe meaningful persistence operations.

Prefer:

```ts
interface InvoiceRepository {
  getById(id: InvoiceId): Promise<Invoice | null>
  save(invoice: Invoice): Promise<void>
}
```

Avoid generic database abstractions such as:

```ts
interface Database {
  insert(table, data)
  update(table, data)
  delete(table, where)
}
```

The repository abstraction exists to keep persistence details out of the application/domain layers.

It is **not** an excuse to create an abstraction over Drizzle itself.

---

# 7. Drizzle ORM

Use Drizzle as the current SQLite persistence implementation.

Drizzle belongs under infrastructure.

```text
infrastructure/
└── sqlite/
    ├── db.ts
    ├── schema/
    ├── migrations/
    └── repositories/
```

Drizzle should be responsible for:

```text
SQLite schema definitions
Queries
Inserts
Updates
Relations/joins where appropriate
Transactions
Migration generation/application
Database constraints
Indexes
```

Drizzle currently supports SQLite through `better-sqlite3`, `node:sqlite`, and libSQL drivers. ([Drizzle ORM][2])

The project should deliberately choose the driver based on the Electron-bundled Node version and packaging requirements.

Do not choose `node:sqlite` merely because it removes a native third-party dependency. Current Drizzle documentation requires Node 22.5+ for its `node:sqlite` setup. ([Drizzle ORM][3])

For the current implementation, verify the actual Electron Node runtime first.

---

# 8. Database schema

The database schema must be derived from the established domain model.

The database is not the domain model.

The domain specification defines:

```text
Person
 ├── Lead
 └── Customer

Catalog
 ├── Plan
 └── Offer

Sales
 ├── Lead
 └── Conversion

Customer
 └── Membership

Billing
 ├── Invoice
 ├── Payment
 ├── Credit
 └── Refund
```

Database tables should therefore represent the required persistence model without forcing the application layer to mirror table CRUD.

---

# 9. Database invariants

Use SQLite constraints wherever the rule is fundamentally structural.

Examples:

```text
PRIMARY KEY
FOREIGN KEY
UNIQUE
NOT NULL
CHECK
INDEX
```

Business rules that require application context belong in the domain/application layers.

For example:

```text
UNIQUE invoice number
```

is appropriate for the database.

But:

```text
"An invoice can only be finalized when all required commercial information exists"
```

belongs to the application/domain layer.

The project rules explicitly distinguish structural database invariants from business invariants.

---

# 10. Money

Never use floating-point numbers for monetary values.

Use integer minor units:

```text
₹1,250.50 → 125050 paise
```

The domain may expose a `Money` value object, while SQLite stores an integer.

Conceptually:

```ts
Money {
    amount: bigint/integer;
    currency: string;
}
```

The exact representation should follow the existing project convention rather than introducing multiple money representations.

The accounting specification explicitly requires integer minor units and prohibits floating-point monetary storage.

---

# 11. Immutable financial history

Financial records must not be casually overwritten.

The following are historical facts:

```text
Invoice
Payment
Credit
Refund
InvoiceLine
PaymentAllocation
```

Corrections should use explicit business operations:

```text
Void
Refund
Credit
Adjustment
```

rather than:

```text
UPDATE payment SET amount = ...
```

The existing accounting rules explicitly establish this principle.

---

# 12. State transitions

State fields must not be changed arbitrarily from the UI.

For example:

```text
Lead:
NEW → CONTACTED → INTERESTED → WON/LOST

Membership:
PENDING → ACTIVE → FROZEN → EXPIRED
                   ↓
                CANCELLED

Invoice:
DRAFT → OPEN → PARTIALLY_PAID → PAID
          ↓
        VOID
```

Do not expose generic operations such as:

```ts
updateMembership({
  status: 'FROZEN'
})
```

Instead expose business operations:

```ts
freezeMembership(...)
renewMembership(...)
cancelMembership(...)
```

The operation determines whether the transition is valid and what side effects are required.

---

# 13. IPC architecture

IPC is a transport adapter.

It must not become the application layer.

The flow is:

```text
React
 ↓
renderer/api/client.ts
 ↓
preload API
 ↓
ipcRenderer.invoke
 ↓
ipcMain.handle
 ↓
application command/query
```

Electron recommends context isolation, sandboxing, narrow contextBridge APIs, and validation of IPC senders. ([Electron][4])

Electron's IPC documentation should be treated as the primary reference for the implementation. ([Electron][5])

---

# 14. Renderer API boundary

This is a strict rule.

React feature code must never directly access:

```ts
window.api
```

except through the designated renderer API client.

Correct:

```text
React feature
    ↓
queries.ts
    ↓
api/client.ts
    ↓
window.api
```

Incorrect:

```text
React component
    ↓
window.api
```

This preserves the future transport seam.

Today:

```text
client.ts → Electron IPC
```

Future:

```text
client.ts → HTTP API
```

The application/domain layers do not change.

---

# 15. IPC contracts

Every IPC operation must have an explicit contract.

For example:

```text
membership.create
membership.renew
membership.freeze

invoice.create
invoice.finalize

payment.record
refund.create
```

Contracts should define:

```text
Input
Output
Errors
```

Use Zod for runtime validation at the transport boundary. Zod provides runtime parsing and TypeScript-compatible schema inference. ([Zod][6])

The IPC layer should reject malformed input before invoking application logic.

Do not rely solely on TypeScript types because renderer input crosses a process boundary.

---

# 16. IPC errors

Use a stable application error contract.

The preferred shape is:

```ts
{
    ok: true,
    data: ...
}
```

or:

```ts
{
    ok: false,
    error: {
        code: "...",
        message: "...",
        details: ...
    }
}
```

Business errors should have stable machine-readable codes.

Examples:

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
INVALID_STATE_TRANSITION
PERMISSION_DENIED
PAYMENT_ALREADY_ALLOCATED
INVOICE_ALREADY_FINALIZED
MEMBERSHIP_CANNOT_BE_FROZEN
```

The renderer must branch on error codes, not human-readable messages.

---

# 17. IPC security

The following are mandatory:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

and the renderer should receive only narrowly scoped APIs.

Electron's current security checklist explicitly recommends context isolation, process sandboxing, sender validation, restrictive content security policy, and avoiding exposure of Electron APIs to untrusted content. ([Electron][4])

Do not expose:

```ts
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer
})
```

Expose individual application capabilities instead.

For example:

```ts
contextBridge.exposeInMainWorld("api", {
    memberships: {
        create: ...
        renew: ...
        freeze: ...
    }
});
```

---

# 18. RBAC

Permission checks belong in the backend/application layer.

React hiding a button is UX, not authorization.

The flow should be:

```text
IPC
 ↓
authenticated/current application user
 ↓
permission check
 ↓
application command
 ↓
domain
```

Use permission codes:

```text
lead.view
lead.create
membership.create
membership.freeze
invoice.finalize
payment.record
refund.create
```

Do not hard-code business authorization as:

```ts
if (user.role === "Finance") ...
```

The existing RBAC specification explicitly requires permission-based checks.

---

# 19. Domain events

Use lightweight in-process domain/application events.

Do not introduce:

```text
Kafka
RabbitMQ
Redis Streams
event sourcing
```

for the standalone application.

The current specification explicitly calls for lightweight in-process events rather than full event sourcing.

Important rule:

```text
Business transaction
       ↓
COMMIT
       ↓
publish event
```

Do not publish externally observable events before the transaction successfully commits.

---

# 20. Audit logging

Important business operations should produce audit information.

Examples:

```text
Lead stage changed
Membership frozen
Membership renewed
Invoice finalized
Payment recorded
Refund issued
Credit issued
```

Audit records should answer:

```text
Who?
What?
When?
Which entity?
What changed?
Why?
```

Audit logging must not replace the actual business transaction. Where audit history is required as part of the operation, it should participate in the same transaction.

---

# 21. Database lifecycle

Application startup should follow this sequence:

```text
Electron startup
      ↓
Determine database path
      ↓
Open SQLite
      ↓
Configure SQLite PRAGMAs
      ↓
Verify database
      ↓
Backup if required
      ↓
Apply pending migrations
      ↓
Verify schema
      ↓
Construct repositories
      ↓
Construct application services
      ↓
Register IPC handlers
      ↓
Create application window
```

Do not allow the renderer to start making backend requests before the database initialization process has completed.

Drizzle supports versioned migration workflows through `drizzle-kit generate` and migration application mechanisms. ([Drizzle ORM][7])

For the packaged Electron application, however, migration execution must be treated as an application startup responsibility rather than assuming a developer CLI is available.

---

# 22. Migration rules

Never modify an already-applied migration.

Instead:

```text
0001_initial.sql
0002_add_membership_status.sql
0003_add_invoice_index.sql
```

If `0002` has shipped, don't edit `0002`.

Create `0003`.

For destructive migrations:

```text
backup
 ↓
migration
 ↓
verification
```

If migration fails:

```text
abort startup
preserve backup
report actionable error
```

The application must not silently continue against a partially migrated schema.

---

# 23. Testing standard

Backend tests should exist at multiple levels.

### Domain tests

Test business rules without SQLite or Electron.

Examples:

```text
Membership cannot transition from CANCELLED → ACTIVE
Invoice cannot become PAID when balance remains
Payment cannot exceed allowed allocation
Lead cannot perform invalid stage transition
```

### Application tests

Use cases should be tested with isolated repositories/test doubles or an isolated database where appropriate.

Focus on:

```text
transaction boundaries
business workflows
authorization
side effects
error handling
```

### Repository tests

Test real Drizzle + SQLite behavior.

Test:

```text
constraints
queries
joins
indexes where relevant
persistence mapping
transactions
migrations
```

### Integration tests

Test:

```text
IPC → application → repository → SQLite
```

for critical flows.

### Electron tests

Only test Electron-specific wiring where necessary.

Do not make every business test boot Electron.

---

# 24. Test the business workflows, not only CRUD

The critical tests should look like:

```text
ConvertLead
SellMembership
RenewMembership
FreezeMembership
CancelMembership
FinalizeInvoice
RecordPayment
IssueCredit
ProcessRefund
```

For a transactional operation, deliberately create failure conditions in the middle and verify:

```text
nothing partially committed
```

Your existing development specification explicitly defines transaction atomicity as part of the acceptance criteria.

Vitest is appropriate for the TypeScript test suite, and it also provides type-testing capabilities when those are useful. ([Vitest][8])

---

# 25. Directory convention

Use this as the default structure:

```text
src/
├── domain/
│   ├── lead/
│   ├── customer/
│   ├── plan/
│   ├── offer/
│   ├── membership/
│   └── billing/
│       ├── invoice/
│       ├── payment/
│       ├── credit/
│       └── refund/
│
├── application/
│   ├── leads/
│   ├── customers/
│   ├── memberships/
│   └── billing/
│
├── infrastructure/
│   └── sqlite/
│       ├── db.ts
│       ├── schema/
│       ├── migrations/
│       └── repositories/
│
├── main/
│   ├── main.ts
│   └── ipc/
│
├── preload/
│   └── preload.ts
│
├── renderer/
│   └── api/
│       └── client.ts
│
└── shared/
    └── contracts/
```

Do not treat this structure as absolute if an implementation detail warrants a different arrangement. The dependency rules are more important than folder names.

---

# 26. Dependency rules for the Developer Agent

Before adding a dependency between modules, ask:

> Which layer owns this responsibility?

The following should never happen:

```text
domain → infrastructure
domain → Electron
domain → Drizzle

application → Electron
application → React
application → ipcMain

renderer → database
renderer → Drizzle
renderer → repository
```

The following is expected:

```text
main → application
main → infrastructure
main → Electron

infrastructure → repository interfaces
infrastructure → Drizzle

application → domain
application → repository interfaces

renderer → shared contracts
renderer → client
```

Infrastructure is allowed to depend on application/domain abstractions because it implements them.

---

# 27. Don't over-engineer the future

Do not introduce abstractions simply because:

> "We might host this someday."

Do introduce abstractions when they protect a real architectural boundary.

Good:

```text
InvoiceRepository
PaymentRepository
MembershipRepository
```

Bad:

```text
IDatabaseAdapter
ISqlAdapter
IOrmAdapter
ISqliteAdapter
```

The application should be persistence-independent, but Drizzle does not need to be replaceable at every individual query.

The future migration is:

```text
Electron IPC → Next.js API
SQLite → PostgreSQL
```

not:

```text
rewrite the application architecture.
```

---

# 28. Implementation order

The developer should implement the backend in this order.

### Phase 1 — Database foundation

Implement:

```text
SQLite connection
Drizzle
schema
PRAGMAs
migration runner
database backup
migration failure handling
transaction infrastructure
```

Do not implement business features yet.

### Phase 2 — Domain foundation

Implement common value objects and domain primitives:

```text
IDs
Money
DateRange
state transition mechanisms
domain errors
```

Then implement the domain entities as required by the business specification.

### Phase 3 — Repository contracts

Define repository interfaces based on domain/application requirements.

Then implement:

```text
Drizzle + SQLite repositories
```

and test them against a real isolated SQLite database.

### Phase 4 — First vertical slice

Do not implement every repository and service before testing the architecture.

Implement one complete workflow end-to-end.

A good first slice is:

```text
Create Lead
```

because it exercises:

```text
React client
→ IPC
→ validation
→ application use case
→ domain
→ repository
→ Drizzle
→ SQLite
```

Then implement a transactional workflow such as:

```text
Sell Membership
```

because that proves the transaction architecture.

### Phase 5 — Expand business workflows

Implement in dependency order:

```text
Lead
 ↓
Conversion
 ↓
Customer
 ↓
Catalog
 ↓
Membership
 ↓
Billing
```

This corresponds to the dependency order already established in the project documentation.

### Phase 6 — IPC surface

Expose only the application operations that the renderer actually requires.

Do not create IPC handlers for every repository method.

For example:

```text
membership.renew
```

is appropriate.

```text
membership.updateRow
```

is not.

---

# 29. Resources the Developer Agent should use

The developer should treat the **project's attached specifications as the primary authority**. External documentation is for understanding technology, not for overriding the project's domain decisions.

The important project references are:

1. **Crown CRM Domain Model** — authoritative business/domain structure.
2. **Module 07 — Transaction & Consistency Rules** — authoritative transaction and atomicity requirements.
3. **Module 08 — Application & Domain Architecture** — authoritative layering, repositories, domain/application responsibilities.
4. **Module 10 — Accounting Rules** — authoritative money, invoices, payments, credits, refunds, and financial-history rules.
5. **Module 12 — State Machines & Domain Events** — authoritative state-transition and event rules.
6. **Module 13 — Development Specification** — implementation order, acceptance criteria, and non-negotiable engineering constraints.
7. **Module 14 — RBAC & Permissions** — permission model and authorization rules.

For technology catch-up, use the official documentation:

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security?utm_source=chatgpt.com) — security checklist, IPC sender validation, sandboxing, context isolation, CSP, and renderer security. ([Electron][4])
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation?utm_source=chatgpt.com) — preload/contextBridge design and why raw IPC exposure is unsafe. ([Electron][9])
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc?utm_source=chatgpt.com) — main/renderer IPC implementation patterns. ([Electron][5])
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox?utm_source=chatgpt.com) — renderer sandbox behavior and Node integration implications. ([Electron][10])
- [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite?utm_source=chatgpt.com) — SQLite drivers and Drizzle integration. ([Drizzle ORM][2])
- [Drizzle Transactions](https://orm.drizzle.team/docs/transactions?utm_source=chatgpt.com) — transaction and savepoint APIs. ([Drizzle ORM][1])
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations?utm_source=chatgpt.com) — migration concepts and workflows. ([Drizzle ORM][7])
- [Drizzle Node SQLite setup](https://orm.drizzle.team/docs/get-started/node-sqlite-existing?utm_source=chatgpt.com) — use this specifically if evaluating `node:sqlite`; note the documented Node 22.5+ requirement. ([Drizzle ORM][3])
- [Zod documentation](https://zod.dev/?utm_source=chatgpt.com) — runtime schemas and validation. ([Zod][6])
- [Vitest documentation](https://vitest.dev/?utm_source=chatgpt.com) — backend/domain/application testing and type testing. ([Vitest][8])

---

# 30. Definition of done for a backend feature

A backend feature is not complete merely because the database query works.

For a new business operation, the developer should be able to answer "yes" to all of these:

```text
[ ] Is the operation represented as a business use case?
[ ] Are its inputs validated at the IPC boundary?
[ ] Is authorization checked in the backend?
[ ] Are business invariants enforced outside the UI?
[ ] Are state transitions explicit?
[ ] Is the transaction boundary correct?
[ ] Are all related writes atomic?
[ ] Is persistence isolated behind repositories?
[ ] Does Drizzle remain inside infrastructure?
[ ] Are financial records immutable where required?
[ ] Is an audit event/record required?
[ ] Are domain/application errors typed?
[ ] Are domain rules unit tested?
[ ] Is the repository behavior tested?
[ ] Is the complete critical workflow tested?
[ ] Can the renderer access the feature only through client.ts?
```

If the answer to one of these is no, the implementation should be considered incomplete where that criterion applies.

The central standard for the Developer Agent should therefore be:

> **Implement business operations, not database CRUD. Keep business rules independent of Electron and Drizzle. Let application use cases own transactions. Let repositories persist state. Let IPC transport commands and results.**

That is consistent with the architecture and domain rules you established before implementation, rather than replacing them with a generic "clean architecture" template.

[1]: https://orm.drizzle.team/docs/transactions?utm_source=chatgpt.com 'Drizzle ORM - Transactions'
[2]: https://orm.drizzle.team/docs/sqlite/get-started-sqlite?utm_source=chatgpt.com 'Drizzle ORM - SQLite'
[3]: https://orm.drizzle.team/docs/get-started/node-sqlite-existing?utm_source=chatgpt.com 'Drizzle ORM - SQLite'
[4]: https://www.electronjs.org/docs/latest/tutorial/security?utm_source=chatgpt.com 'Security | Electron'
[5]: https://www.electronjs.org/docs/latest/tutorial/ipc?utm_source=chatgpt.com 'Inter-Process Communication | Electron'
[6]: https://zod.dev/packages/zod?utm_source=chatgpt.com 'Zod | Zod'
[7]: https://orm.drizzle.team/docs/migrations?utm_source=chatgpt.com 'Drizzle ORM - Migrations'
[8]: https://main.vitest.dev/guide/testing-types.html?utm_source=chatgpt.com 'Testing Types | Guide | Vitest'
[9]: https://www.electronjs.org/docs/latest/tutorial/context-isolation?utm_source=chatgpt.com 'Context Isolation | Electron'
[10]: https://www.electronjs.org/docs/latest/tutorial/sandbox?utm_source=chatgpt.com 'Process Sandboxing | Electron'
