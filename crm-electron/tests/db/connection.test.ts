import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "@main/db/migrations";
import { leadRepo } from "@main/db/repositories/leads";

let db: Database.Database;
let backupDir: string;

beforeEach(async () => {
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-mig-"));
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  await runMigrations(db, backupDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("applies 0001_init and records it in schema_migrations", () => {
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as {
        c: number;
      }
    ).c;
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("creates a pre-migration backup on the first run", async () => {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^pre-migration-0001_init-/);
  });

  it("is idempotent — a second run is a no-op", async () => {
    const before = (
      db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as {
        c: number;
      }
    ).c;
    await runMigrations(db, backupDir);
    const after = (
      db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as {
        c: number;
      }
    ).c;
    expect(after).toBe(before);
  });

  it("creates all core tables", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      "admin_user",
      "audit_log",
      "app_settings",
      "leads",
      "lead_mobile_numbers",
      "lead_email_addresses",
      "memberships",
      "receipts",
      "clients",
      "services",
      "products",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("creates the receipt sale+date index (Django receipt_sale_date_idx)", () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get("idx_receipts_sale_date");
    expect(idx).toBeTruthy();
  });
});

describe("leadRepo", () => {
  it("creates a lead with mobiles and emails atomically", () => {
    const lead = leadRepo.create(db, {
      first_name: "Amit",
      last_name: "Shah",
      gender: "M",
      mobileNumbers: ["9876543210"],
      emails: ["amit@example.com"],
    });
    expect(lead.uuid).toBeTruthy();
    expect(lead.status).toBe("NEW");
    const mobiles = db
      .prepare("SELECT * FROM lead_mobile_numbers WHERE lead_id = ?")
      .all(lead.uuid);
    const emails = db
      .prepare("SELECT * FROM lead_email_addresses WHERE lead_id = ?")
      .all(lead.uuid);
    expect(mobiles).toHaveLength(1);
    expect(emails).toHaveLength(1);
  });

  it("rolls back the whole transaction if a child insert fails", () => {
    expect(() =>
      leadRepo.create(db, {
        first_name: "Amit",
        last_name: "Shah",
        mobileNumbers: ["123"], // violates the 10-digit CHECK constraint
      }),
    ).toThrow();
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM leads").get() as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it("lists leads with pagination and search", () => {
    leadRepo.create(db, { first_name: "Ravi", last_name: "Kumar" });
    leadRepo.create(db, { first_name: "Priya", last_name: "Sharma" });
    leadRepo.create(db, { first_name: "Ravi", last_name: "Verma" });

    const all = leadRepo.list(db, { page: 1, pageSize: 10 });
    expect(all.total).toBe(3);

    const search = leadRepo.list(db, { search: "Ravi", page: 1, pageSize: 10 });
    expect(search.total).toBe(2);

    const paged = leadRepo.list(db, { page: 1, pageSize: 2 });
    expect(paged.rows).toHaveLength(2);
    expect(paged.total).toBe(3);
  });

  it("updates a lead", () => {
    const lead = leadRepo.create(db, { first_name: "Amit", last_name: "Shah" });
    const updated = leadRepo.update(db, lead.uuid, {
      status: "INTERESTED",
      first_name: "Amitabh",
    });
    expect(updated.first_name).toBe("Amitabh");
    expect(updated.status).toBe("INTERESTED");
  });

  it("soft-deletes a lead and cascades to memberships and receipts", () => {
    const lead = leadRepo.create(db, { first_name: "Amit", last_name: "Shah" });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memberships (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, duration)
       VALUES ('sale-1', ?, ?, 0, NULL, ?, 'monthly')`,
    ).run(now, now, lead.uuid);
    db.prepare(
      `INSERT INTO receipts (uuid, created_at, updated_at, is_deleted, deleted_at, sale_id, amount_cents, date)
       VALUES ('r-1', ?, ?, 0, NULL, 'sale-1', 10000, ?)`,
    ).run(now, now, now);

    leadRepo.softDelete(db, lead.uuid);

    expect(leadRepo.get(db, lead.uuid)).toBeUndefined();
    expect(
      (db.prepare("SELECT is_deleted FROM memberships WHERE uuid = 'sale-1'").get() as { is_deleted: number })
        .is_deleted,
    ).toBe(1);
    expect(
      (db.prepare("SELECT is_deleted FROM receipts WHERE uuid = 'r-1'").get() as { is_deleted: number })
        .is_deleted,
    ).toBe(1);
  });
});
