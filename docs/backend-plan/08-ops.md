# 08 — Ops: Delete Policy, Concurrency, Backup/Restore & Import/Export

**Ties to:** Module 10.
**Depends on:** all modules (these rules apply globally).

This is an offline desktop app whose single SQLite file is the only copy of the gym's
business and financial history (Module 10 §why). Every rule here exists to keep that one
file trustworthy over years of use.

## 1. Delete policy (Module 10 §64–65, §31)

- **Never hard-delete** a row that has entered business history.
- Prefer, per entity: **Deactivate** (plans/offers), **Void** (invoices), **Cancel/**
  **Expire** (memberships), **Archive** (customers — future).
- Soft-delete pattern for records that must disappear from lists but stay resolvable:
  `deleted_at` + `deleted_by` columns, filtered by `WHERE deleted_at IS NULL` in every
  list query (Module 10 §worked example).
- **Hard delete only** for records that never became part of business history (e.g. an
  empty DRAFT invoice with no lines and no payments — and even then, prefer Void).
- DB-level integrity: `customer_id` immutable; `end_date >= start_date` for memberships
  (unless domain allows otherwise); payment `amount > 0` (CHECK); finalized invoice
  cannot have zero lines; allocation/refund/credit-overrun invariants (Module 10 §64)
  enforced as CHECKs where structural and in the domain layer where contextual.

## 2. Concurrency model (Module 10 §66)

- Single local file; WAL lets readers coexist with one writer.
- All writes route through the single main-process connection (already the shipped
  singleton). Do not open independent connections from multiple places.
- Write transactions are **short and contain database work only**:
  - no UI waits, no user confirmation, no network I/O inside a transaction
    (Module 10 §66).
  - `BEGIN IMMEDIATE` (the shipped `withTransaction` outer boundary) acquires the write
    lock up front and surfaces `SQLITE_BUSY` cleanly under contention.
- Repository/database tests cover the PRAGMA baseline under the `node:sqlite` driver.

## 3. Backup / restore (Module 10 §67)

Backup is a first-class feature with a UI (Settings → Database).

- **Manual backup:** timestamped copy of the SQLite file to the configured backup folder
  (default `app.getPath('userData')/backups/`), taken via the SQLite backup API or a
  consistent `VACUUM INTO` snapshot so it represents a consistent state.
- **Automatic backup:** configurable schedule (on-launch + daily interval); retention
  policy (keep last N).
- **Restore:** pick a backup → validate → stop writes → replace file → reopen → run
  migrations/verification → re-seed permissions. Requires the current session be an
  Owner/Admin (`backup.manage`).
- **Backup history:** list of backups with timestamp, size, source.
- Startup path (guidelines §21): before applying migrations, optionally back up the
  current file if it is about to be migrated (guards against a bad migration).
- Migration failure: abort startup, preserve the backup, report an actionable error
  (guidelines §22).

## 4. Import / export (Module 10 §68)

- **Export (read-only):** Customers, Leads, Memberships, Invoices, Payments, Outstanding
  Dues CSVs to `app.getPath('userData')/exports/`. Queries behind `report.view`.
- **Import (validated, staged):**

  ```text
  validate rows → show errors → preview changes → commit import transaction
  ```

  - Never blindly insert imported rows.
  - Validation at the boundary (Zod) + business validation in the domain.
  - The whole import commits in one `withTransaction`; a row-level failure is reported
    without partial commits.
  - Duplicate detection via existing unique keys (phone/person, invoice number, etc.).

## 5. Settings

`settings` (org-scoped key/value, typed where needed) stores: org display/legal name,
currency, timezone, invoice numbering format, tax code defaults, freeze/proration/
cancellation policy references, backup schedule/location, cash-session preferences
(reserved). Settings changes are audited.

## 6. Tests

- Delete policy: hard-delete attempts on used plans/offers/finalized invoices fail;
  soft-delete hides from lists but resolves by id; void/cancel records stay intact.
- Concurrency: two overlapping `withTransaction` writes behave correctly (one blocks
  with `busy_timeout`, then succeeds); nested savepoints still work.
- Backup: snapshot restores a consistent database; restore swaps the file and the app
  reopens cleanly.
- Import: invalid rows produce errors, nothing commits; valid preview → commit is atomic.
- Export: CSV reflects current read-model query results.