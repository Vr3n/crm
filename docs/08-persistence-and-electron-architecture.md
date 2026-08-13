# Module 08 — Persistence & Electron/App Architecture

**Bounded context:** technical infrastructure, not business domain.
**Depends on:** nothing business-specific — this is the layered skeleton every other module's code sits inside.

## Why this is documented at all, if it's "just" tech architecture

Because the biggest risk in an Electron + SQLite app is letting the renderer (React UI) talk to SQLite directly "just this once for speed," which quietly breaks every guarantee the other modules assume (atomic transactions, validation before persistence, single-writer discipline). This module exists to draw the line firmly, once, so every developer on the team knows where business logic is allowed to live.

## Worked example: what "the React ↓ SQL" anti-pattern looks like, concretely

```text
Tempting shortcut in a renderer component:

  async function handlePayNow() {
    await db.run("UPDATE invoices SET status='PAID' WHERE id=?", [invoiceId]);
  }

Problems this creates immediately:
  1. No Payment row is created — Module 05's whole allocation model is bypassed.
  2. No validation that the amount actually covers the invoice.
  3. No audit trail of who did this or when.
  4. If the app crashes right after this line, there's no
     partial-transaction protection because there was only one
     single-table write with no surrounding business transaction.

Correct shape, going through the layers:

  React (button onClick)
    → invoke IPC channel "payments:record"
       → Application layer: RecordPaymentCommand handler
          → Domain layer: Payment.create(), Invoice.applyPayment() (validates amounts, statuses)
             → Repository layer: paymentRepo.save(), invoiceRepo.save() — inside one DB transaction
                → SQLite: BEGIN ... COMMIT
```

Every one of those layers is a thin function — this isn't asking for heavyweight enterprise ceremony, just a firm rule: **renderer code never imports the SQLite driver.** It only calls IPC channels exposed through Electron's preload/contextBridge.

## Technical decision, explained intuitively

**Why SQLite with WAL mode, and why does "single-writer" matter for an Electron app?**
SQLite is a perfect fit for a single-user local desktop app — no server to run, one file to back up, real ACID transactions. WAL (Write-Ahead Logging) mode lets reads happen concurrently with a write, which matters because Electron's main process may be writing (e.g., saving a payment) while a background query refreshes a dashboard. The one discipline this requires: all writes should go through the same main-process database connection/queue, never opened independently from multiple places, so you don't hit "database is locked" errors under concurrent access.

**Why keep the SQLite file itself outside the Electron app's install directory (e.g., in the OS's app-data folder)?**
Because the install directory can be wiped/overwritten on every app update. Business data must survive app upgrades, so it belongs in the platform's user-data location (`app.getPath('userData')` in Electron), which is exactly what the original spec's "SQLite Location" section formalizes below.

---

# 49. SQLite Rules

The application should treat SQLite as the authoritative local datastore.

At connection initialization:

```text
PRAGMA foreign_keys = ON;
```

Foreign key enforcement must be explicitly enabled for each connection.

WAL mode is appropriate for a local application when the database is stored on the same machine. SQLite's WAL mode allows readers and the writer to operate concurrently, although SQLite still permits only one writer at a time.

Recommended baseline:

```text
foreign_keys = ON
journal_mode = WAL
busy_timeout = configured
```

The exact pragma configuration should be tested against the selected SQLite driver.

---

# 50. SQLite Location

Do not store the production database beside the application executable.

Store it in the operating system's application-data directory.

Conceptually:

```text
<AppData>/<ApplicationName>/data.sqlite
```

The application should also have:

```text
backups/
exports/
logs/
```

under appropriate application-data locations.

---

# 51. Electron Architecture

The renderer should not directly access SQLite.

Recommended architecture:

```text
React Renderer
      │
      │ typed IPC
      ▼
Preload API
      │
      ▼
Electron Main Process
      │
      ▼
Application Services
      │
      ▼
Domain
      │
      ▼
Repositories
      │
      ▼
SQLite
```

The Electron IPC model is specifically designed for communication between renderer and main processes, with preload/context isolation forming the bridge.

---

# 52. Renderer Responsibilities

React should handle:

```text
Rendering
Forms
Client-side interaction
Navigation
Local UI state
Query presentation
Validation for user experience
```

React should not own:

```text
membership pricing rules
invoice calculations
payment allocation
membership state transitions
database transactions
financial invariants
```

Those belong outside the UI.

---

# 53. Application Layer

The application layer coordinates use cases.

Example:

```text
MembershipService.renew()
```

or:

```text
RenewMembershipHandler.execute(command)
```

The application layer should:

```text
load aggregate
validate authorization/business prerequisites
invoke domain behavior
persist changes
commit transaction
return result
```

---

# 54. Domain Layer

The domain contains:

```text
Entities
Value Objects
Domain Rules
State Transitions
Domain Services
Business Exceptions
```

Examples:

```text
Money
DateRange
MembershipStatus
LeadStage

Membership
Invoice
Payment

MembershipPricingService
```

The domain layer should not import React, Electron, SQL, or Shadcn.

---

# 55. Repository Layer

Repositories translate domain persistence operations into SQLite queries.

Example conceptual interfaces:

```text
LeadRepository
CustomerRepository
MembershipRepository
PlanRepository
InvoiceRepository
PaymentRepository
```

The repository should not contain business decisions such as:

```text
if invoice is late then suspend membership
```

That is a domain/application decision.

---

# 56. Database Layer

The database layer owns:

```text
SQLite connection
migrations
transactions
SQL statements
indexes
constraints
backups
database integrity checks
```

SQLite itself should enforce structural invariants where practical:

```text
PRIMARY KEY
UNIQUE
NOT NULL
FOREIGN KEY
CHECK
```

Application/domain code should enforce business invariants.

---

