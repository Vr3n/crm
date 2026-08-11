import type { Database } from "better-sqlite3";
import initSql from "./0001_init.sql?raw";
import { backupBeforeMigrationIfNeeded } from "./backup";

export interface Migration {
  name: string;
  up: string; // SQL executed inside one transaction
}

/**
 * Migration list. FORWARD-ONLY: never edit an applied migration — append a new
 * numbered entry with its own `.sql` file. Each `up` runs inside one SQLite
 * transaction, so a failure rolls back completely and can be retried safely.
 */
const migrations: Migration[] = [{ name: "0001_init", up: initSql }];

export function pendingMigrations(db: Database): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  return migrations.filter((m) => !applied.has(m.name)).map((m) => m.name);
}

export async function runMigrations(db: Database, backupDir: string): Promise<void> {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  const pending = migrations.filter((m) => !applied.has(m.name));

  if (pending.length > 0) {
    await backupBeforeMigrationIfNeeded(db, pending.map((m) => m.name), backupDir);
  }

  for (const m of pending) {
    const tx = db.transaction(() => {
      db.exec(m.up);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        m.name,
        new Date().toISOString(),
      );
    });
    tx();
  }
}
