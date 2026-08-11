import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

export const nowIso = (): string => new Date().toISOString();

/** Base columns for any table that inherits the BaseModel convention. */
export function baseColumns() {
  return {
    uuid: randomUUID(),
    created_at: nowIso(),
    updated_at: nowIso(),
    is_deleted: 0,
    deleted_at: null as string | null,
  };
}

/**
 * Soft-delete: set is_deleted + deleted_at (never a real DELETE).
 * `table` must be a compile-time literal — never interpolate user input here.
 */
export function softDelete(db: Database, table: string, id: string): void {
  db.prepare(
    `UPDATE ${table} SET is_deleted = 1, deleted_at = ? WHERE uuid = ?`,
  ).run(nowIso(), id);
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
