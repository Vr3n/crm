import { DatabaseSync } from 'node:sqlite'

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

/**
 * Opens (or replaces) the shared database connection. `path` may be a file path
 * or `':memory:'`. Electron is intentionally NOT imported here so the connection
 * layer can be unit-tested in a plain Node environment; the Electron-specific
 * userData path is resolved by the caller in the main process.
 */
export function openDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA busy_timeout = 5000;')
  db = database
  return database
}

/** Closes and clears the shared connection (used by tests for isolation). */
export function closeDatabase(): void {
  if (db) {
    db.close()
  }
  db = null
}

/** Overrides the shared connection reference (used by tests). */
export function setDatabase(database: DatabaseSync | null): void {
  db = database
}

/**
 * Runs fn inside a write transaction. Nested calls are supported via SAVEPOINTs,
 * so a domain/repository function can safely wrap its own work even when it is
 * already running inside a caller's transaction (e.g. seedRolesForOrganization
 * called from setupOrganization). Only the outermost call issues BEGIN/COMMIT.
 *
 * If fn throws, the current (outermost or savepoint) transaction is rolled back
 * and the error re-thrown. This is the enforcement point for rule #2 (every
 * multi-table business operation is one atomic transaction).
 */
let txDepth = 0
let savepointSeq = 0

export function withTransaction<T>(fn: () => T): T {
  const database = getDb()
  const isOuter = txDepth === 0

  const marker = isOuter ? null : `sp_${++savepointSeq}`
  database.exec(isOuter ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${marker}`)
  txDepth++

  try {
    const result = fn()
    database.exec(isOuter ? 'COMMIT' : `RELEASE SAVEPOINT ${marker}`)
    txDepth--
    return result
  } catch (error) {
    database.exec(isOuter ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${marker}`)
    if (!isOuter) database.exec(`RELEASE SAVEPOINT ${marker}`)
    txDepth--
    throw error
  }
}
