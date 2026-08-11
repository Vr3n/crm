import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import { runMigrations } from "./migrations";

let db: Database.Database | null = null;

export interface DbPaths {
  dbFile: string;
  backupDir: string;
}

export function getDbPaths(): DbPaths {
  const userData = app.getPath("userData");
  return {
    dbFile: path.join(userData, "crm.db"),
    backupDir: path.join(userData, "backups"),
  };
}

/** Open the db, set pragmas and apply pending migrations. Await before use. */
export async function initDb(): Promise<Database.Database> {
  if (db) return db;
  const { dbFile, backupDir } = getDbPaths();
  const instance = new Database(dbFile);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("synchronous = NORMAL");
  instance.pragma("busy_timeout = 5000");
  await runMigrations(instance, backupDir);
  db = instance;
  return instance;
}

/** Synchronous accessor — only valid after initDb() has resolved. */
export function getDb(): Database.Database {
  if (!db) throw new Error("DB not initialized — call initDb() first");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
