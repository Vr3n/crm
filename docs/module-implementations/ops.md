# Module Implementation — Operations: Backup, Import/Export, Delete Policy (Module 08)

**Ties to:** `docs/backend-plan/08-ops.md`, `docs/backend-plan/06-backbone.md` (audit),
`docs/implementation-details/backend-foundation.md` (DB bootstrap / file locations).
**Depends on:** all transactional modules + backbone (audit trail + delete policy).
**Feeds into:** nothing downstream — this is the last module in the dependency order.

## 1. Scope & dependencies

The application is a single-user Electron desktop app backed by a SQLite file (`node:sqlite`).
This module owns the operational surface that keeps that file safe and movable:

1. **Backup & restore** — take a consistent snapshot and restore it safely.
2. **Import/export** — CSV exchange of reference data (people, leads, plans) and report
   results.
3. **Delete policy** — a consistent rule for when hard-delete is allowed vs. when records
   must be deactivated/voided/cancelled, enforced as an audit-preserving convention.

No new business tables. May add a `settings` key recording last backup info (backbone
settings table). Everything is permission-gated and audited.

## 2. DB tables

- `audit_log` (from backbone) records backup/restore/import/export/delete events.
- `settings` (from backbone) stores `last_backup_at`, `backup_count`.
- **Delete policy does not add tables** — it adds nullable `deactivated_at`,
  `deactivated_by`, `deactivation_reason` soft-delete columns **only** on tables whose rows
  enter business history (see §4). Currently that is none of the shipped tables except
  `membership_plans` (which uses `active` already) and `offers` (planned `active`); this
  section lists the exact columns each future module adds, so implementation is uniform.

## 3. Migrations

- No schema beyond the two backbone tables and any soft-delete columns required by §4.
  If soft-delete columns are added, they arrive with their module's migration (versions
  listed per module), not here — this module only *enforces* the convention.

## 4. Backend use cases

### 4.1 Backup & restore

| Use case | Permission | Behavior |
|---|---|---|
| `backupNow()` | `ops.backup` | Runs `VACUUM INTO '<backup-path>'` on the main DB connection (blocking, safe against a live single connection); writes `last_backup_at`/`backup_count` in settings; audit entry `ops.backup`. Backup path: default `%APPDATA%/<app>/backups/<timestamp>.db` or user-chosen via save dialog. |
| `restoreBackup(path)` | `ops.restore` | **Two-step, gated:** (1) validate the target file is a SQLite DB and runs the expected schema (migration version check); (2) close the live connection, copy the file over the current DB, reopen, run `PRAGMA foreign_keys = ON`, re-run the idempotent migration/seeding guard, then require an app restart. Restore is audited with the pre/post backup fingerprints. |
| `listBackups()` | `ops.backup` | Files in the backups dir + settings metadata. |
| `deleteBackup(path)` | `ops.backup` | Removes an old backup file; audited. |

Backups are whole-file (never logical dumps) — simplest correct approach for a
single-user app and keeps relational integrity by construction.

### 4.2 Import / export

| Use case | Permission | Behavior |
|---|---|---|
| `exportCsv(kind, query)` | `report.export` | kinds: `people`, `leads`, `plans`, `invoices`, `payments`, `memberships`, or a report result; writes a CSV (UTF-8 with BOM for Excel) via save dialog; audited `ops.export`. |
| `importCsv(kind, path)` | `ops.import` | kinds: `people` (→ create people), `leads`, `plans` (reference data only). **Atomic + dry-run:** parse + Zod-validate every row first (no partial writes); report per-row errors; on success run the inserts inside one `withTransaction`; audited `ops.import` with accepted/rejected counts. |

Import never touches financial/membership history (payments/invoices/memberships are
never imported) — those are created through their own flows so snapshots and invariants
hold.

### 4.3 Delete policy

Convention enforced in code review + a shared helper `assertDeletable(record)`:

- **Hard-delete allowed** only for records that never entered business history:
  - an empty `DRAFT` invoice (no lines, no allocations),
  - an unreferenced plan (no memberships, no versions, no offer links),
  - a never-used offer,
  - a mis-typed person/lead (no customer, no activities worth keeping).
- **Soft-lifecycle required** for anything else: deactivate offer/plan,
  void invoice, cancel/terminate membership, refund/credit money. The word "delete" never
  appears in a UI for these.
- Every hard delete writes an audit entry (`ops.delete` / `{module}.delete`) capturing the
  `before_snapshot` — even though the row goes away, the audit trail preserves the fact.

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `OPS_*` namespace):

```text
ops:backup          {} → BackupResult          (ops.backup)
ops:restore         { path } → RestoreResult   (ops.restore)   -- returns "needs restart"
ops:listBackups     {} → BackupInfo[]          (ops.backup)
ops:deleteBackup    { path } → void            (ops.backup)
ops:exportCsv       { kind, query } → ExportResult (report.export)
ops:importCsv       { kind, path } → ImportResult (ops.import)
```

Contracts in `src/shared/contracts/ops.ts`: `backupResultSchema` (path, sizeBytes,
createdAt), `restoreResultSchema` (requiresRestart, migrationVersion), `importResultSchema`
(accepted, rejected, errors: {row, message}[]), `exportResultSchema` (path, rowCount).
Errors: reuse `VALIDATION_ERROR`; new `BACKUP_IN_PROGRESS`, `RESTORE_REQUIRES_RESTART`
(informational), `IMPORT_VALIDATION_FAILED` (carries the per-row errors).

## 6. Preload API

Add `window.api.ops` in `src/preload/index.ts` + `index.d.ts` with one method per channel
above, unwrapping `data` or rejecting with the typed error. `restore` triggers a
renderer-mediated restart prompt (main process handles the actual restart).

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/ops/
├── api/
│   ├── backup.api.ts         # backupNow/listBackups/restoreBackup/deleteBackup
│   ├── transfer.api.ts       # exportCsv/importCsv
│   └── index.ts
├── mappers.ts                # byte sizes, timestamps, import result → dry-run view model
└── queries.ts                # useListBackups/useBackupNow/useRestoreBackup/useDeleteBackup/
                              # useExportCsv/useImportCsv
```

- New `features/ops/` (or extend `features/settings/` with the ops panel): api files call
  `window.api.ops.*` and return the `shared/contracts/ops` wire types exactly; `queries.ts`
  mutations invalidate `['settings']` and, after restore, force a full app reload.
- No existing mock to replace (these are new surfaces).

## 8. UI wiring

- **Backup section (new):** a "Backups" panel listing files with size/date, a "Back up
  now" button, per-file Restore (with a confirm warning + restart notice) and Delete.
- **Import/Export section (new):** export pickers per kind + CSV export; import file picker
  with a dry-run result table (accepted/rejected rows with messages) before committing.
- **Delete confirmation copy:** the shared "deactivate/void/cancel" language replaces any
  remaining "delete" phrasing in existing UIs (catalog offers, plans).

## 9. Seed & permissions

- Permissions to add: `ops.backup`, `ops.restore`, `ops.import`, plus `report.export`
  (from read-models). Seed grants: Manager = all; `ops.restore` = Manager only;
  `ops.import` = Manager only; `ops.backup` = Manager + Receptionist (daily habit);
  `report.export` = Manager. Super roles inherit.

## 10. Tests

- **Backup:** `VACUUM INTO` produces a file whose `PRAGMA integrity_check` passes; contents
  match the source (row counts per table); settings + audit updated; concurrent second
  backup rejected with `BACKUP_IN_PROGRESS`.
- **Restore:** a corrupt/non-SQLite file rejected before touching the live DB; a valid
  older-version backup is refused (migration-version guard); successful restore sets
  `RESTORE_REQUIRES_RESTART` and the app refuses normal queries until restart.
- **Import:** happy path inserts all rows in one tx; a single invalid row → zero writes +
  per-row error report (`IMPORT_VALIDATION_FAILED`); financial kinds are rejected as
  unsupported.
- **Export:** CSV content matches the read model; BOM present; audited.
- **Delete policy helper:** unit tests that `assertDeletable` permits the allowed cases
  and rejects the protected ones (non-empty DRAFT invoice, referenced plan, used offer).
- **IPC:** handler tests (validation, permission, envelope).
- **Renderer:** backups list renders; import dry-run table shows errors before commit;
  restore triggers the restart prompt.

## 11. Decisions & open items

1. **Whole-file backup (VACUUM INTO) vs. logical dump:** whole-file. It is correct by
   construction, fast, and the app already holds a single open connection. Logical dumps
   are only worth it if cross-version migrations need to rewrite data (they don't here).
2. **Restore mechanics:** the main process must own file replacement + restart; the
   renderer only mediates. Guard with a "restoring" flag so no IPC handler runs mid-swap.
3. **Import scope:** reference data + people/leads only. Financial/membership imports are
   out of scope because they would let CSV bypass the snapshot/invariant rules the
   transactional flows enforce.
4. **Soft-delete columns:** adopt them per-module (only where history must survive) rather
   than globally — most tables already have the right lifecycle verbs (void, cancel,
   deactivate, expire). The convention helper + audit write is what makes this uniform.
5. **Encryption:** no sensitive-at-rest data beyond PII; OS-level disk encryption is
   assumed. If compliance later demands it, encrypt backups with the app's keychain-stored
   key — noted here so the backup format leaves room.