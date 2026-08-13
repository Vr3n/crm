# Module 10 — Data Integrity, Delete Policy, Concurrency, Backup & Import/Export

**Bounded context:** operational safety net — the rules that keep a *local, offline, single-file* database trustworthy over years of daily use.
**Depends on:** all modules (these rules apply globally).

## Why this deserves its own module instead of being a footnote

This is an **offline desktop app with one SQLite file as the only copy of the gym's business and financial history.** There is no cloud backup happening automatically, no server-side redundancy. If this module is treated as an afterthought, the realistic failure mode is: a laptop's disk fails, or a staff member accidentally deletes a customer record, and the gym permanently loses membership/financial history. Every rule below exists to prevent that specific, high-consequence failure.

## Worked example: why "soft delete" instead of real delete matters

```text
Front-desk staff accidentally clicks "Delete Customer" on Priya's record.

If DELETE FROM customers WHERE id=42 actually runs:
  → Every invoice, payment, and membership referencing customer 42
    either cascades away (financial history destroyed) or becomes
    an orphaned foreign key (database now inconsistent).
  → There is no undo.

With a soft-delete policy instead:
  UPDATE customers SET deleted_at = '2026-08-13T10:22:00', deleted_by = staff_id
  WHERE id = 42
  → The record disappears from normal lists/search (filtered by
    "WHERE deleted_at IS NULL") but every invoice, payment, and
    membership still resolves correctly if looked up directly.
  → A manager can restore it by clearing deleted_at.
```

Financial and membership records specifically should almost never be *hard*-deletable at all from the UI — at most, voided/cancelled (which is itself a recorded event, not an erasure).

## Technical decision, explained intuitively

**Why does an offline single-writer app need a "concurrency model" at all — isn't it just one user?**
Even a single gym often has two front-desk terminals or a manager's laptop open simultaneously against a shared database file (if the SQLite file sits on a shared drive) — or, within one machine, the main process may have a background job (nightly expiry check) running while a staff member records a payment. SQLite's WAL mode plus routing all writes through one connection/queue (Module 08) handles this safely, but only if the app is explicit about it rather than assuming "it's local, so it's fine."

**Why is backup a domain-level concern and not just "ops will handle it"?**
Because for a single-location offline gym, there usually isn't a separate "ops team" — the backup strategy has to be built into the application itself (e.g., automatic timestamped copies of the SQLite file to a configurable folder, with a restore flow in the UI) or it simply won't happen. This is worth specifying now, before development starts, rather than bolting it on after the first data-loss incident.

---

# 64. Data Integrity Invariants

The following should be enforced.

### Customer

```text
customer_id is immutable
```

### Plan

```text
Used plans cannot be hard deleted.
```

Use:

```text
active = false
```

instead.

### Offer

```text
Used offers cannot rewrite historical sales.
```

### Membership

```text
membership.customer_id must exist
membership.plan reference must be valid
end_date >= start_date
```

unless the domain explicitly allows a different case.

### Invoice

```text
Finalized invoice cannot have zero lines.
Finalized invoice number is immutable.
Finalized line financial values are immutable.
```

### Payment

```text
Payment amount > 0
Payment cannot be silently deleted.
```

Corrections should use reversal/refund mechanisms.

### Allocation

```text
Allocated amount cannot exceed the applicable payment amount.
```

### Refund

```text
Refund cannot exceed refundable payment amount.
```

### Credit

```text
Credit applied cannot exceed available credit.
```

---

# 65. Delete Policy

Financial and membership history should almost never be physically deleted.

Prefer:

```text
Deactivate
Cancel
Void
Archive
Expire
```

rather than:

```text
DELETE
```

Examples:

```text
Plan used by a customer
    → deactivate

Offer already applied
    → deactivate

Invoice mistake
    → void

Membership ended
    → expire/cancel
```

Hard deletion should primarily be used for records that have never become part of business history.

---

# 66. Concurrency Model

The application is local, so the architecture can remain simple.

There may still be multiple database connections inside the Electron application.

Therefore write operations should be short and transactional.

Avoid:

```text
BEGIN
    wait for UI
    wait for user confirmation
    perform network operation
    query database
COMMIT
```

Transactions should contain database work only.

SQLite's `BEGIN IMMEDIATE` can be useful for operations that need to establish write access before performing multiple writes; SQLite documents that it starts the write transaction immediately and can return `SQLITE_BUSY` when another writer is active.

---

# 67. Backup

Because the application is offline and the database is valuable business data, backup is a first-class feature.

At minimum:

```text
Manual Backup
Restore Backup
Automatic Backup
Backup History
```

A backup should represent a consistent database state.

Recommended user experience:

```text
Settings
    → Database
        → Backup Now
        → Restore
        → Backup Location
        → Backup History
```

Do not depend solely on the user's operating-system backup.

---

# 68. Import / Export

Initial useful exports:

```text
Customers CSV
Leads CSV
Memberships CSV
Invoices CSV
Payments CSV
Outstanding Dues CSV
```

CSV export should be a read operation.

Import requires stronger validation.

For example:

```text
Import Customers
    ↓
validate rows
    ↓
show errors
    ↓
preview changes
    ↓
commit import transaction
```

Never blindly insert imported rows.

---

