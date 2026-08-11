# Module 1 — Database layer (main process)

- **Effort:** 3 days
- **Depends on:** M0 (scaffold, `better-sqlite3` ABI wiring)
- **Delivers:** the SQLite connection with pragmas, the migration runner with
  pre-migration backup, the **full schema** (`0001_init.sql`) ported from the Django
  models, and the base repository helpers + `leadRepo` (the first vertical repository).
  The remaining feature repositories are thin and are created in their feature modules
  (M5 dashboard, M6 leads search/detail, M7 clients, M8 accounting).

## 1. Goal

The database is the single source of truth. By the end of this module:

- `src/main/db/connection.ts` opens `crm.db` in `userData`, WAL mode, FK enforcement,
  and runs all pending migrations transactionally — with an automatic pre-migration
  backup of the previous `crm.db`.
- Every table from the Django models exists with **integer-cents** money columns,
  TEXT uuid PKs mirroring `BaseModel`, and the required indexes for the M1 performance
  ceiling (≤100k leads, ≤500k receipts, <50 ms/query).
- Repository helpers (`createRow`, `softDelete`, pagination) and a working `leadRepo`
  are covered by vitest against a temp SQLite file.

## 2. Inputs / sources (Django → port)

| Django source                               | Ports to                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| `crown_crm/utils/models.py` (`BaseModel`)   | Column convention on every table (`uuid`, `created_at`, `updated_at`, `is_deleted`, `deleted_at`) |
| `crown_crm/users/models.py`                 | `admin_user` table (email-unique admin; `name`; no username)    |
| `crown_crm/organizations/models.py`         | `app_settings` singleton (flattened org); org mobile/email merge |
| `crown_crm/leads/models.py`                 | `leads` + mobiles/emails/addresses/discussions/sources/followups |
| `crown_crm/clients/models.py`               | `clients` + mobiles/emails/measurements/statuses/addresses       |
| `crown_crm/accounting/models.py`            | `memberships`, `receipts` (money → cents)                        |
| `crown_crm/logistics/models.py`             | `categories`, `services`, `products`, `inventory` + M2M junction tables |

## 3. Design decisions (pinned)

1. **Flattened tenancy:** single gym → **no `organization` column anywhere**, and no
   slug routing. Org-identity fields (name, logo, address, mobile, email) collapse into
   the `app_settings` singleton row (`id = 1`). See master plan §2.
2. **Fresh start:** existing `db.sqlite3` is discarded; no data migration (master plan
   §2). M1 still builds the pre-migration-backup machinery because future app-version
   migrations will need it (master plan Module 14).
3. **Money = integer cents:** `price_cents`, `amount_cents`, `opening_balance_cents`,
   `closing_balance_cents`. The only non-money number stored as an integer with a
   documented scale is `discount_percentage_bp` (basis points; `1050` = `10.50%`) — it
   is display-only, derived from price, and never used in arithmetic.
4. **Soft-delete convention:** `is_deleted INTEGER NOT NULL DEFAULT 0` +
   `deleted_at TEXT`. The Django port adds this to tables that inherit `BaseModel`
   (`leads`, `clients`, `memberships`, `receipts`, …). A few plain Django models
   (`ClientMobileNumberMaster`, `ClientEmailMaster`, `LeadFollowUp`) are **not** soft-
   deletable in Django — port them verbatim (see schema notes), do **not** invent soft-
   delete for them.
5. **WAL + FK:** `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`,
   `busy_timeout = 5000`.
6. **No ORM:** raw prepared SQL in repositories. Simple, reviewable, and one layer —
   the exact opposite of the Django ORM stack we are replacing.

## 4. Implementation steps

### 4.1 Connection (`src/main/db/connection.ts`)

```ts
import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import { runMigrations } from "./migrations";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = path.join(app.getPath("userData"), "crm.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}
```

Notes:

- Lazy singleton: created once in `src/main/index.ts` at startup (before any window),
  so the renderer never sees a half-initialized db.
- `better-sqlite3` is **synchronous** on the main-process thread. That is deliberate —
  see the performance contract in §6.

### 4.2 Migration runner (`src/main/db/migrations/index.ts`)

```ts
import Database from "better-sqlite3";

export interface Migration {
  name: string;
  up: string; // SQL executed inside one transaction
}

const migrations: Migration[] = [
  { name: "0001_init", up: /* read from migrations/0001_init.sql */ },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name),
  );

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const tx = db.transaction(() => {
      db.exec(m.up);
      db.prepare(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      ).run(m.name, new Date().toISOString());
    });
    tx();
  }
}
```

Rules (from master plan Module 1 + Module 14):

- **Forward-only** — never edit an applied migration; append a new numbered file.
- Each `up` runs inside one transaction → a failed migration rolls back completely and
  `schema_migrations` is not updated, so a retry is safe.
- To add a later migration, append `{ name: "0002_...", up: sql }` — nothing else changes.

### 4.3 Pre-migration backup

Before any pending migration is applied, copy the existing db with SQLite's own backup
API (safe on a live WAL db):

```ts
// src/main/db/migrations/backup.ts
import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";

export function backupBeforeMigrationIfNeeded(db: Database.Database, pending: string[]): void {
  if (pending.length === 0) return;
  const dir = path.join(app.getPath("userData"), "backups");
  const dest = path.join(dir, `pre-migration-${pending[0]}-${Date.now()}.db`);
  db.backup(dest);
}
```

Call it from `runMigrations` when `pending.length > 0`. The master plan's rollback story
(M14) restores this file + reinstalls the previous installer; there is no schema-downgrade
path.

### 4.4 Schema — `0001_init.sql`

The complete DDL. Money columns are `_cents`; timestamps are ISO-8601 TEXT (UTC);
uuiud PKs are TEXT (Django's `UUIDField` is a 32-hex string).

```sql
-- ============ 0001_init.sql ============

-- ---------- auth ----------
CREATE TABLE admin_user (
  uuid          TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,          -- 32 hex chars (16 bytes)
  password_hash TEXT NOT NULL           -- 128 hex chars (64 bytes, scrypt KEYLEN=64)
);

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id TEXT REFERENCES admin_user(uuid),
  action        TEXT NOT NULL,          -- e.g. 'lead.create', 'receipt.amount_edit'
  entity        TEXT NOT NULL,          -- e.g. 'lead', 'receipt'
  entity_id     TEXT NOT NULL,
  detail        TEXT,                   -- short JSON string for context
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_audit_log_entity ON audit_log (entity, entity_id);

-- ---------- settings (single gym) ----------
CREATE TABLE app_settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),   -- singleton
  name                TEXT NOT NULL DEFAULT 'Crown Gym',
  logo_path           TEXT,             -- absolute path copied into userData (M10)
  address_line_1      TEXT,
  address_line_2      TEXT,
  city                TEXT,
  state               TEXT,
  pincode             TEXT,
  mobile_number       TEXT,
  email               TEXT,
  auto_lock_minutes   INTEGER NOT NULL DEFAULT 0,   -- 0 = disabled (M3)
  expiry_notification_days INTEGER NOT NULL DEFAULT 30, -- M5/M10
  updated_at          TEXT NOT NULL
);

-- ---------- leads ----------
CREATE TABLE leads (
  uuid        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  first_name  TEXT NOT NULL,
  middle_name TEXT,
  last_name   TEXT NOT NULL,
  gender      TEXT CHECK (gender IN ('M','F','O')),
  status      TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','INTERESTED','CONVERTED','DROPPED'))
);
CREATE INDEX idx_leads_status       ON leads (status) WHERE is_deleted = 0;
CREATE INDEX idx_leads_created_at   ON leads (created_at) WHERE is_deleted = 0;
CREATE INDEX idx_leads_deleted      ON leads (is_deleted);

CREATE TABLE lead_mobile_numbers (
  uuid          TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  lead_id       TEXT NOT NULL REFERENCES leads(uuid),
  mobile_number TEXT NOT NULL CHECK (length(mobile_number) = 10)  -- regex in zod too
);
CREATE INDEX idx_lead_mobiles_lead   ON lead_mobile_numbers (lead_id);

CREATE TABLE lead_email_addresses (
  uuid       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  lead_id    TEXT NOT NULL REFERENCES leads(uuid),
  email      TEXT NOT NULL
);
CREATE INDEX idx_lead_emails_lead ON lead_email_addresses (lead_id);

CREATE TABLE lead_addresses (
  uuid          TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  lead_id       TEXT NOT NULL REFERENCES leads(uuid),
  flat_building TEXT NOT NULL,
  street        TEXT NOT NULL,
  area          TEXT NOT NULL,
  landmark      TEXT,
  state         TEXT,
  city          TEXT,
  pincode       TEXT NOT NULL CHECK (length(pincode) = 6)
);
CREATE INDEX idx_lead_addresses_lead ON lead_addresses (lead_id);

CREATE TABLE lead_discussion_history (
  uuid              TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  deleted_at        TEXT,
  lead_id           TEXT NOT NULL REFERENCES leads(uuid),
  discussion_notes  TEXT NOT NULL
);
CREATE INDEX idx_lead_discussions_lead ON lead_discussion_history (lead_id);

CREATE TABLE lead_sources (
  uuid        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  lead_id     TEXT NOT NULL REFERENCES leads(uuid),
  source      TEXT NOT NULL,
  description TEXT
);
CREATE INDEX idx_lead_sources_lead ON lead_sources (lead_id);

-- plain Django model (NOT soft-deletable in Django) — port verbatim
CREATE TABLE lead_followups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id       TEXT NOT NULL REFERENCES leads(uuid),
  scheduled_for TEXT NOT NULL,
  completed_at  TEXT,
  channel       TEXT NOT NULL CHECK (channel IN ('phone','whatsapp','sms','email','social','in_person')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','failed')),
  outcome       TEXT,
  notes         TEXT,
  created_by    TEXT REFERENCES admin_user(uuid)
);
CREATE INDEX idx_lead_followups_lead   ON lead_followups (lead_id);
CREATE INDEX idx_lead_followups_status ON lead_followups (status) WHERE status = 'pending';

-- ---------- clients ----------
CREATE TABLE clients (
  uuid           TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  deleted_at     TEXT,
  first_name     TEXT NOT NULL,
  middle_name    TEXT,
  last_name      TEXT NOT NULL,
  is_lead        INTEGER NOT NULL DEFAULT 0,
  date_of_birth  TEXT,
  gender         TEXT CHECK (gender IN ('M','F','O'))
);
CREATE INDEX idx_clients_deleted ON clients (is_deleted);

-- plain Django models (unique on the value) — port verbatim
CREATE TABLE client_mobile_numbers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id     TEXT NOT NULL REFERENCES clients(uuid),
  mobile_number TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_client_mobiles_client ON client_mobile_numbers (client_id);

CREATE TABLE client_email_addresses (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(uuid),
  email  TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_client_emails_client ON client_email_addresses (client_id);

CREATE TABLE client_body_measurements (
  uuid                 TEXT PRIMARY KEY,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  deleted_at           TEXT,
  client_id            TEXT NOT NULL REFERENCES clients(uuid),
  height               REAL NOT NULL,
  weight               REAL NOT NULL,
  activity_level       TEXT,
  dietary_restrictions TEXT,
  extra_comments       TEXT,
  description          TEXT
);
CREATE INDEX idx_client_meas_client ON client_body_measurements (client_id);

CREATE TABLE client_body_statuses (
  uuid                  TEXT PRIMARY KEY,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  is_deleted            INTEGER NOT NULL DEFAULT 0,
  deleted_at            TEXT,
  client_id             TEXT NOT NULL REFERENCES clients(uuid),
  body_measurements_id  TEXT REFERENCES client_body_measurements(uuid),
  ideal_body_weight     REAL,
  over_under_weight     REAL,
  fat_percentage        REAL,
  lbm_percentage        REAL,
  lbm_kg                REAL,
  protein_required      REAL,
  total_protein_required REAL,
  medical_conditions    TEXT,
  activity_level        TEXT,
  dietary_restrictions  TEXT,
  extra_comments        TEXT
);
CREATE INDEX idx_client_status_client ON client_body_statuses (client_id);

CREATE TABLE client_addresses (
  uuid          TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  client_id     TEXT NOT NULL REFERENCES clients(uuid),
  flat_building TEXT,
  street        TEXT,
  area          TEXT,
  landmark      TEXT,
  state         TEXT,
  city          TEXT,
  pincode       TEXT
);
CREATE INDEX idx_client_addresses_client ON client_addresses (client_id);

-- ---------- accounting (money in cents) ----------
CREATE TABLE memberships (
  uuid                     TEXT PRIMARY KEY,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  is_deleted               INTEGER NOT NULL DEFAULT 0,
  deleted_at               TEXT,
  lead_id                  TEXT NOT NULL REFERENCES leads(uuid),
  duration                 TEXT NOT NULL CHECK (duration IN ('monthly','quarterly','6months','yearly','custom')),
  base_price_cents         INTEGER,      -- nullable, like Django
  price_cents              INTEGER,      -- nullable, like Django
  discount_percentage_bp   INTEGER,      -- basis points; 1050 == 10.50% (display only)
  notes                    TEXT,
  membership_start_date    TEXT,         -- ISO date (YYYY-MM-DD)
  membership_end_date      TEXT
);
CREATE INDEX idx_memberships_lead    ON memberships (lead_id) WHERE is_deleted = 0;
CREATE INDEX idx_memberships_end     ON memberships (membership_end_date) WHERE is_deleted = 0;

CREATE TABLE receipts (
  uuid                  TEXT PRIMARY KEY,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  is_deleted            INTEGER NOT NULL DEFAULT 0,
  deleted_at            TEXT,
  sale_id               TEXT NOT NULL REFERENCES memberships(uuid),
  amount_cents          INTEGER NOT NULL,
  date                  TEXT NOT NULL,   -- ISO datetime; read-only once numbered (M8)
  method                TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','upi','bank','other')),
  receipt_number        TEXT,            -- YY/MM/DD-duration_code-count (M8)
  reference             TEXT NOT NULL DEFAULT '',
  notes                 TEXT,
  opening_balance_cents INTEGER,
  closing_balance_cents INTEGER,
  pdf_path              TEXT,            -- NULL until generated (M8)
  pdf_generated_at      TEXT
);
-- mirrors Django's PaymentReceipt.Meta.indexes (receipt_sale_date_idx)
CREATE INDEX idx_receipts_sale_date ON receipts (sale_id, date) WHERE is_deleted = 0;
CREATE INDEX idx_receipts_date      ON receipts (date) WHERE is_deleted = 0;
CREATE INDEX idx_receipts_deleted   ON receipts (is_deleted);

-- ---------- logistics ----------
CREATE TABLE categories (
  uuid       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  category   TEXT NOT NULL
);

CREATE TABLE services (
  uuid              TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  deleted_at        TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  price_cents       INTEGER NOT NULL,
  type              TEXT NOT NULL DEFAULT 'sessions' CHECK (type IN ('sessions','subscription')),
  sessions_count    INTEGER,
  subscription_type TEXT CHECK (subscription_type IN ('monthly','quarterly','6_months','yearly')),
  code              TEXT NOT NULL UNIQUE,
  is_active         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_services_deleted ON services (is_deleted);

CREATE TABLE products (
  uuid        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  sku         TEXT NOT NULL UNIQUE,
  hsn         TEXT
);
CREATE INDEX idx_products_deleted ON products (is_deleted);

CREATE TABLE inventory (
  uuid                TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  is_deleted          INTEGER NOT NULL DEFAULT 0,
  deleted_at          TEXT,
  product_id          TEXT NOT NULL UNIQUE REFERENCES products(uuid),
  quantity_in_stock   INTEGER NOT NULL DEFAULT 0,
  location            TEXT,
  last_stock_update   TEXT
);

-- Django M2M: ServiceProductAbstract.category → junction tables
CREATE TABLE service_categories (
  service_id  TEXT NOT NULL REFERENCES services(uuid),
  category_id TEXT NOT NULL REFERENCES categories(uuid),
  PRIMARY KEY (service_id, category_id)
);
CREATE TABLE product_categories (
  product_id  TEXT NOT NULL REFERENCES products(uuid),
  category_id TEXT NOT NULL REFERENCES categories(uuid),
  PRIMARY KEY (product_id, category_id)
);
```

**Schema-porting notes (why some tables differ from Django):**

- `receipts` drops Django's `pdf_status` enum (`none/pending/generating/ready/failed`) —
  PDF generation is synchronous in main (M8), so a status is redundant; `pdf_path`
  NULL/non-NULL is the state.
- `app_settings` merges `OrganizationMaster` + `OrganizationMobileNumberMaster` +
  `OrganizationEmailMaster` + `OrganizationAddressMaster` into one singleton. M10's
  settings screen reads/writes this row.
- `LeadFollowUp`/`ClientMobileNumberMaster`/`ClientEmailMaster` were plain
  `models.Model` (no `is_deleted`) — preserved as-is. Repository queries that list them
  do not filter soft-delete.
- `admin_user.password_salt`/`password_hash` are hex strings; scrypt `KEYLEN = 64`
  (M3) ⇒ hash length 128 hex chars.

### 4.5 Repository helpers (`src/main/db/repositories/helpers.ts`)

```ts
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

export const nowIso = () => new Date().toISOString();

/** Base columns for any table that inherits the BaseModel convention. */
export function baseColumns() {
  return {
    uuid: randomUUID(),
    created_at: nowIso(),
    updated_at: nowIso(),
    is_deleted: 0,
    deleted_at: null,
  };
}

/** Soft-delete: set is_deleted + deleted_at (never a real DELETE). */
export function softDelete(db: Database, table: string, id: string): void {
  db.prepare(
    `UPDATE ${table} SET is_deleted = 1, deleted_at = ? WHERE uuid = ?`,
  ).run(nowIso(), id);
}
```

**Important:** `table` is never interpolated with user input — it is a compile-time
literal in each repository call site. FKs + `ON DELETE` are not relied on; cascade
soft-deletes are explicit repository logic (see §4.6 and M8).

### 4.6 `leadRepo` (`src/main/db/repositories/leads.ts`)

```ts
import type { Database } from "better-sqlite3";
import { baseColumns, nowIso, softDelete } from "./helpers";

export interface LeadRow {
  uuid: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
  deleted_at: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: "M" | "F" | "O" | null;
  status: "NEW" | "INTERESTED" | "CONVERTED" | "DROPPED";
}

export interface CreateLeadInput {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  gender?: "M" | "F" | "O" | null;
  status?: LeadRow["status"];
  mobileNumbers?: string[];
  emails?: string[];
}

export const leadRepo = {
  list(
    db: Database,
    opts: { search?: string; status?: LeadRow["status"]; page: number; pageSize: number },
  ): { rows: LeadRow[]; total: number } {
    const where: string[] = ["is_deleted = 0"];
    const params: Record<string, unknown> = {};
    if (opts.status) { where.push("status = @status"); params.status = opts.status; }
    if (opts.search) {
      where.push(
        "(first_name LIKE @q OR middle_name LIKE @q OR last_name LIKE @q OR uuid IN " +
        "(SELECT lead_id FROM lead_mobile_numbers WHERE mobile_number = @exact))",
      );
      params.q = `%${opts.search}%`;
      params.exact = opts.search;
    }
    const whereSql = where.join(" AND ");
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE ${whereSql}`).get(params) as any).c;
    const rows = db.prepare(
      `SELECT * FROM leads WHERE ${whereSql} ORDER BY created_at DESC LIMIT @pageSize OFFSET @offset`,
    ).all({ ...params, pageSize: opts.pageSize, offset: (opts.page - 1) * opts.pageSize }) as LeadRow[];
    return { rows, total };
  },

  get(db: Database, id: string): LeadRow | undefined {
    return db.prepare("SELECT * FROM leads WHERE uuid = ? AND is_deleted = 0").get(id) as LeadRow | undefined;
  },

  /** Insert lead + mobile/email rows in ONE transaction (Django inlineformsets). */
  create(db: Database, input: CreateLeadInput): LeadRow {
    return db.transaction(() => {
      const base = baseColumns();
      db.prepare(
        `INSERT INTO leads (uuid, created_at, updated_at, is_deleted, deleted_at,
           first_name, middle_name, last_name, gender, status)
         VALUES (@uuid, @created_at, @updated_at, @is_deleted, @deleted_at,
           @first_name, @middle_name, @last_name, @gender, @status)`,
      ).run({
        ...base,
        first_name: input.first_name,
        middle_name: input.middle_name ?? null,
        last_name: input.last_name,
        gender: input.gender ?? null,
        status: input.status ?? "NEW",
      });

      const insMobile = db.prepare(
        `INSERT INTO lead_mobile_numbers (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, mobile_number)
         VALUES (@uuid, @created_at, @updated_at, 0, NULL, @lead_id, @mobile_number)`,
      );
      for (const m of input.mobileNumbers ?? []) {
        insMobile.run({ ...baseColumns(), lead_id: base.uuid, mobile_number: m });
      }
      const insEmail = db.prepare(
        `INSERT INTO lead_email_addresses (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, email)
         VALUES (@uuid, @created_at, @updated_at, 0, NULL, @lead_id, @email)`,
      );
      for (const e of input.emails ?? []) {
        insEmail.run({ ...baseColumns(), lead_id: base.uuid, email: e });
      }
      return leadRepo.get(db, base.uuid)!;
    })();
  },

  /** Port of LeadMaster.delete(): soft-delete lead, cascade to memberships + receipts. */
  softDelete(db: Database, id: string): void {
    db.transaction(() => {
      softDelete(db, "leads", id);
      const sales = db.prepare("SELECT uuid FROM memberships WHERE lead_id = ? AND is_deleted = 0").all(id) as { uuid: string }[];
      for (const s of sales) {
        db.prepare("UPDATE receipts SET is_deleted = 1, deleted_at = ? WHERE sale_id = ?").run(nowIso(), s.uuid);
        softDelete(db, "memberships", s.uuid);
      }
    })();
  },
};
```

Cascade mirrors `LeadMaster.delete()` → `MembershipSale.delete()` → `PaymentReceipt.delete()`
(Django source: `leads/models.py:95`, `accounting/models.py:165`). This is the
`leads ← memberships ← receipts` FK chain resolved in master plan Module 1. The balance
recompute on cascade is M8 work; M1 just marks rows.

### 4.7 Renderer money util (`src/renderer/src/lib/money.ts`)

```ts
/** cents → "₹1,234.50" (Indian grouping). Single place formatting money. */
export function formatINR(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(cents / 100);
}
```

`Intl.NumberFormat` is available in the renderer (full ICU). Main never formats money;
it sends integer cents over IPC.

### 4.8 Tests (`tests/db/`)

Use a temp file per test; recreate migrations each time.

```ts
// tests/db/connection.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/main/db/migrations";
import { leadRepo } from "../../src/main/db/repositories/leads";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

describe("migrations", () => {
  it("runs idempotently", () => {
    runMigrations(db); // second run must be a no-op
    const count = (db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as any).c;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("leadRepo", () => {
  it("creates a lead with mobiles and emails atomically", () => {
    const lead = leadRepo.create(db, {
      first_name: "Amit", last_name: "Shah",
      mobileNumbers: ["9876543210"], emails: ["amit@example.com"],
    });
    expect(lead.uuid).toBeTruthy();
    const mobiles = db.prepare("SELECT * FROM lead_mobile_numbers WHERE lead_id = ?").all(lead.uuid);
    expect(mobiles).toHaveLength(1);
  });

  it("soft-deletes a lead and cascades to memberships and receipts", () => {
    const lead = leadRepo.create(db, { first_name: "Amit", last_name: "Shah" });
    const sale = db.prepare(
      `INSERT INTO memberships (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, duration)
       VALUES (?, ?, ?, 0, NULL, ?, 'monthly')`,
    ).run("sale-1", new Date().toISOString(), new Date().toISOString(), lead.uuid);
    db.prepare(
      `INSERT INTO receipts (uuid, created_at, updated_at, is_deleted, deleted_at, sale_id, amount_cents, date)
       VALUES (?, ?, ?, 0, NULL, 'sale-1', 10000, ?)`,
    ).run("r-1", new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    leadRepo.softDelete(db, lead.uuid);

    expect(leadRepo.get(db, lead.uuid)).toBeUndefined();
    expect(db.prepare("SELECT is_deleted FROM memberships WHERE uuid = 'sale-1'").get()).toEqual({ is_deleted: 1 });
    expect(db.prepare("SELECT is_deleted FROM receipts WHERE uuid = 'r-1'").get()).toEqual({ is_deleted: 1 });
  });
});
```

## 5. Acceptance criteria (definition of done)

1. On launch, `getDb()` creates `crm.db` in `userData` with WAL + FK on; `schema_migrations`
   lists `0001_init`.
2. `0001_init.sql` contains every table from §4.4 with all columns above.
3. Re-running migrations is idempotent (test).
4. A second launch with a pending migration backs up the prior db to `userData/backups/`.
5. `leadRepo.create` writes lead + children atomically (one `db.transaction()`).
6. `leadRepo.softDelete` cascades lead → memberships → receipts (tested).
7. All money columns end in `_cents`; `formatINR` renders "₹1,234.50" for `123450`.
8. `npm test` green (connection + migration + repo tests). `npm run lint` green.

## 6. Performance contract (from master plan Module 1)

- `better-sqlite3` is synchronous → any slow query freezes the window. Design for
  **< 50 ms/query**, ceilings **≤100k leads / ≤500k receipts**.
- Indexes in the schema cover every FK and hot filter: `(sale_id, date)` for receipt
  chains (M8 recompute), `membership_end_date` for M5 expirations, `leads.status` +
  `leads.created_at` for M5/M6 list + trend queries.
- If real data outgrows the ceiling, the escape hatch is a `worker_threads` pool for
  heavy reads — repository signatures stay the same (out of scope for v1).

## 7. Edge cases / gotchas

- **FK cascade vs soft-delete:** SQLite `ON DELETE CASCADE` would hard-delete. The schema
  deliberately uses plain `REFERENCES` + explicit repo soft-deletes so history is never
  physically removed.
- **`journal_mode = WAL` on `:memory:`** is a no-op in better-sqlite3; tests still pass.
- **Migrations must be idempotent** — never `CREATE TABLE` without `IF NOT EXISTS` in a
  re-run scenario; the runner guards by name, so plain `CREATE TABLE` is fine, but keep
  the guard structure consistent.
- **UUIDs as TEXT:** keep them lowercase hex, 36-char canonical form (`randomUUID()`).
  Do not store hyphenless forms, or comparisons break.
- **Nullable price:** `memberships.price_cents` is nullable to mirror Django; the M8
  algorithm assumes it is non-null for the recompute and throws otherwise.
- **`discount_percentage_bp`** is display-only. Never divide by it in money math.

## 8. Files touched

Created (in `crm-electron/`): `src/main/db/connection.ts`, `src/main/db/migrations/index.ts`,
`src/main/db/migrations/backup.ts`, `src/main/db/migrations/0001_init.sql`,
`src/main/db/repositories/helpers.ts`, `src/main/db/repositories/leads.ts`,
`src/renderer/src/lib/money.ts`, `tests/db/connection.test.ts`.

Django files read (no writes): `utils/models.py`, `users/models.py`,
`organizations/models.py`, `leads/models.py`, `clients/models.py`,
`accounting/models.py`, `logistics/models.py`.
