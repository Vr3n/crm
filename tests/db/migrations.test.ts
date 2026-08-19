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
  'users',
  'people',
  'lead_stages',
  'lead_sources',
  'lead_lost_reasons',
  'lead_activity_types',
  'leads',
  'lead_activities',
  'lead_followups',
  'lead_stage_history'
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
  it('creates every identity and sales table on a fresh database', () => {
    runMigrations()
    const tables = tableNames()
    for (const table of ALL_TABLES) {
      expect(tables.has(table)).toBe(true)
    }
  })

  it('records versions 0 (identity), 3 (sales), 4 (sales index), 5 (leads extra fields), 6 (seed sales reference data)', () => {
    runMigrations()
    const rows = getDb()
      .prepare('SELECT version, name FROM schema_migrations')
      .all() as { version: number; name: string }[]
    expect(rows).toEqual([
      { version: 0, name: 'identity' },
      { version: 3, name: 'sales' },
      { version: 4, name: 'sales_list_index' },
      { version: 5, name: 'leads_extra_fields' },
      { version: 6, name: 'seed_sales_reference_data' }
    ])
  })

  it('is idempotent — a second run applies nothing', () => {
    runMigrations()
    runMigrations()
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM schema_migrations')
      .get() as { n: number }
    expect(row.n).toBe(5)
  })

  it('reconciles a legacy database and still applies the new sales migration', () => {
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

    // Legacy versions 1 & 2 are left as-is; 0 is marked applied (no re-run);
    // the sales migrations (3, 4) must still run — they would be lost on a legacy
    // database if they reused a legacy version number.
    expect(appliedVersions()).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(tableNames().has('organizations')).toBe(true)
    expect(tableNames().has('users')).toBe(false)
    expect(tableNames().has('leads')).toBe(true)
    expect(tableNames().has('people')).toBe(true)
  })

  it('applies versions 0 and 3 when schema_migrations exists but the legacy tables do not', () => {
    getDb().exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'identity_tenancy');
    `)

    runMigrations()

    expect(appliedVersions()).toEqual([0, 1, 3, 4, 5, 6])
    expect(tableNames().has('users')).toBe(true)
    expect(tableNames().has('leads')).toBe(true)
  })

  it('seeds sales reference data for an organization that predates the org-setup seeding', () => {
    // Simulates a database created before org-setup provisioned sales reference
    // data: the schema (and migration record) exist, but the org has no stages,
    // so lead creation would fail with "No initial lead stage is configured".
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
      INSERT INTO organizations (slug, name, mobile_number) VALUES ('old-gym', 'Old Gym', '9999999999');
      CREATE TABLE lead_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_initial INTEGER NOT NULL DEFAULT 0,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_activity_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      CREATE TABLE lead_lost_reasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (organization_id, name)
      );
      INSERT INTO schema_migrations (version, name) VALUES (0, 'identity'), (3, 'sales'), (4, 'sales_list_index'), (5, 'leads_extra_fields');
    `)

    runMigrations()

    const stages = getDb()
      .prepare('SELECT name, is_initial, is_won, is_lost FROM lead_stages ORDER BY sort_order')
      .all() as { name: string; is_initial: number; is_won: number; is_lost: number }[]
    expect(stages).toHaveLength(9)
    expect(stages[0]).toEqual({ name: 'NEW', is_initial: 1, is_won: 0, is_lost: 0 })
    expect(stages).toContainEqual({ name: 'WON', is_initial: 0, is_won: 1, is_lost: 0 })
    expect(stages).toContainEqual({ name: 'LOST', is_initial: 0, is_won: 0, is_lost: 1 })

    const sourceCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_sources')
      .get() as { n: number }
    expect(sourceCount.n).toBe(8)
    const activityTypeCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_activity_types')
      .get() as { n: number }
    expect(activityTypeCount.n).toBe(9)
    const lostReasonCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_lost_reasons')
      .get() as { n: number }
    expect(lostReasonCount.n).toBe(8)

    // A second migration run must not duplicate the seed rows (unique constraint).
    runMigrations()
    const stageCountAfter = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_stages')
      .get() as { n: number }
    expect(stageCountAfter.n).toBe(9)
  })
})
