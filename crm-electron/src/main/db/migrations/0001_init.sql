-- ============ 0001_init.sql ============
-- Crown CRM Electron — initial schema (port of the Django models, flattened tenancy).

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
CREATE INDEX idx_leads_status     ON leads (status) WHERE is_deleted = 0;
CREATE INDEX idx_leads_created_at ON leads (created_at) WHERE is_deleted = 0;
CREATE INDEX idx_leads_deleted    ON leads (is_deleted);

CREATE TABLE lead_mobile_numbers (
  uuid          TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  lead_id       TEXT NOT NULL REFERENCES leads(uuid),
  mobile_number TEXT NOT NULL CHECK (length(mobile_number) = 10)  -- regex in zod too
);
CREATE INDEX idx_lead_mobiles_lead ON lead_mobile_numbers (lead_id);

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
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(uuid),
  email     TEXT NOT NULL UNIQUE
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
  uuid                   TEXT PRIMARY KEY,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  deleted_at             TEXT,
  client_id              TEXT NOT NULL REFERENCES clients(uuid),
  body_measurements_id   TEXT REFERENCES client_body_measurements(uuid),
  ideal_body_weight      REAL,
  over_under_weight      REAL,
  fat_percentage         REAL,
  lbm_percentage         REAL,
  lbm_kg                 REAL,
  protein_required       REAL,
  total_protein_required REAL,
  medical_conditions     TEXT,
  activity_level         TEXT,
  dietary_restrictions   TEXT,
  extra_comments         TEXT
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
  uuid                   TEXT PRIMARY KEY,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  deleted_at             TEXT,
  lead_id                TEXT NOT NULL REFERENCES leads(uuid),
  duration               TEXT NOT NULL CHECK (duration IN ('monthly','quarterly','6months','yearly','custom')),
  base_price_cents       INTEGER,      -- nullable, like Django
  price_cents            INTEGER,      -- nullable, like Django
  discount_percentage_bp INTEGER,      -- basis points; 1050 == 10.50% (display only)
  notes                  TEXT,
  membership_start_date  TEXT,         -- ISO date (YYYY-MM-DD)
  membership_end_date    TEXT
);
CREATE INDEX idx_memberships_lead ON memberships (lead_id) WHERE is_deleted = 0;
CREATE INDEX idx_memberships_end  ON memberships (membership_end_date) WHERE is_deleted = 0;

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
  uuid              TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  deleted_at        TEXT,
  product_id        TEXT NOT NULL UNIQUE REFERENCES products(uuid),
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  location          TEXT,
  last_stock_update TEXT
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
