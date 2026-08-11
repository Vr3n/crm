import type { Database } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Before any pending migration is applied, copy the existing db with SQLite's
 * own backup API (safe on a live WAL db). Restore + reinstall the previous
 * installer is the documented rollback (master plan Module 14).
 * `db.backup()` is asynchronous — callers must await it before running migrations.
 */
export async function backupBeforeMigrationIfNeeded(
  db: Database,
  pending: string[],
  backupDir: string,
): Promise<void> {
  if (pending.length === 0) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const dest = path.join(backupDir, `pre-migration-${pending[0]}-${Date.now()}.db`);
  await db.backup(dest);
}
