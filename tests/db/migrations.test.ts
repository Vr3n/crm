import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { openDatabase, closeDatabase, getDb } from '../../src/main/db/connection'
import { runMigrations } from '../../src/main/db/migrations'

/**
 * Focused tests for the drizzle-kit migration runner (ADR-0005): the `?raw`
 * bundled SQL, statement-breakpoint splitting, schema_migrations bookkeeping,
 * idempotency, and the legacy (pre-Drizzle) reconciliation path.
 */
beforeEach(() => {
  closeDatabase()
  openDatabase(':memory:')
})

afterAll(() => {
  closeDatabase()
})

const ALL_TABLES = [
  'app_meta',
  'organization_staff',
  'organizations',
  'permissions',
  'role_permissions',
  'roles',
  'users'
]

function tableNames(): Set<string> {
  const rows = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

function appliedVersions(): number[] {
  const rows = getDb()
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as { version: number }[]
  return rows.map((r) => r.version)
}

describe('runMigrations', () => {
  it('creates every identity table on a fresh database', () => {
    runMigrations()
    const tables = tableNames()
    for (const table of ALL_TABLES) {
      expect(tables.has(table)).toBe(true)
    }
  })

  it('records version 0 with the migration name', () => {
    runMigrations()
    const rows = getDb()
      .prepare('SELECT version, name FROM schema_migrations')
      .all() as { version: number; name: string }[]
    expect(rows).toEqual([{ version: 0, name: 'identity' }])
  })

  it('is idempotent — a second run applies nothing', () => {
    runMigrations()
    runMigrations()
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM schema_migrations')
      .get() as { n: number }
    expect(row.n).toBe(1)
  })

  it('reconciles a legacy database by marking version 0 applied without re-executing it', () => {
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        currency TEXT DEFAULT 'INR' NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'identity_tenancy'), (2, 'app_meta');
    `)

    runMigrations()

    expect(appliedVersions()).toEqual([0, 1, 2])
    expect(tableNames().has('organizations')).toBe(true)
    expect(tableNames().has('users')).toBe(false)
  })

  it('applies version 0 when schema_migrations exists but the legacy tables do not', () => {
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'identity_tenancy');
    `)

    runMigrations()

    expect(appliedVersions()).toEqual([0, 1])
    expect(tableNames().has('users')).toBe(true)
  })
})
