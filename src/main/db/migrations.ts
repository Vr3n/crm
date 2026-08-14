import { DatabaseSync } from 'node:sqlite'
import { getDb } from './connection'

interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * Migrations are plain TS modules so they bundle cleanly with electron-vite
 * (no runtime .sql files to copy alongside the packaged app). Each runs once,
 * tracked by version in the schema_migrations table.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'identity_tenancy',
    sql: `
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        legal_name TEXT,
        billing_email TEXT,
        mobile_number TEXT NOT NULL,
        timezone TEXT,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        plan_tier TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        is_system_role INTEGER NOT NULL DEFAULT 0,
        is_super INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        UNIQUE (organization_id, name)
      );

      CREATE TABLE permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE role_permissions (
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE organization_staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        role_id INTEGER NOT NULL REFERENCES roles(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, user_id)
      );

      CREATE INDEX idx_staff_org ON organization_staff (organization_id);
      CREATE INDEX idx_staff_user ON organization_staff (user_id);
    `
  },
  {
    version: 2,
    name: 'app_meta',
    sql: `
      CREATE TABLE app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  }
]

export function runMigrations(): void {
  const db: DatabaseSync = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  )

  const insert = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    db.exec(migration.sql)
    insert.run(migration.version, migration.name)
  }
}
