# Module Implementation — Backbone: Audit, Settings, Domain Events (Module 06)

**Ties to:** `docs/backend-plan/06-backbone.md`, `docs/implementation-details/backend-foundation.md`,
`docs/implementation-details/catalog-plans-and-lead-fk.md` (transaction pattern reference).
**Depends on:** identity (actors/org context), and every other module that must record
audit/emit events (they call into this module's helpers).
**Feeds into:** ops (delete policy audit), read-models (audit trails, settings-driven
behavior), reference-transactions (events publish after commit).

## 1. Scope & dependencies

Today the app has identity (users, roles, permissions, organizations, org context) and the
transactional modules, but **no audit trail, no org settings, and no domain events**. The
other module plans already assume these exist (`audit_log` writes inside the same
transaction, freeze policies reference settings, events publish after a sale). This module
provides the shared infrastructure and the two new tables, then backfills audit writes
into the existing use cases.

Three responsibilities:

1. **Audit log** — an append-only record of every important operation, written *inside the
   same transaction* as the operation it describes, so an audit trail can never disagree
   with the data.
2. **Org settings** — a small key/value store (e.g. invoice numbering year range,
   gym name on invoices, notice periods) read by other modules.
3. **Domain events** — an in-process publish/subscribe bus for post-commit notifications
   (e.g. `MembershipSold`, `InvoicePaid`, `MembershipFrozen`) that lets read models and
   notifications react without coupling modules.

## 2. DB tables (`src/main/db/schema/backbone.ts`)

```text
audit_log
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  actor_id integer FK users NOT NULL
  action text NOT NULL            -- verb, e.g. 'membership.freeze', 'invoice.finalize',
                                  -- 'sale.convertAndSell', 'settings.update'
  entity_type text NOT NULL       -- table/aggregate, e.g. 'membership'
  entity_id integer NULL          -- the affected row id (or composite key JSON)
  summary text NULL               -- human-readable one-liner
  before_snapshot text NULL       -- JSON of pre-change state (for updates)
  after_snapshot text NULL        -- JSON of post-change state
  occurred_at text NOT NULL DEFAULT datetime('now')
  INDEX (organization_id, entity_type, entity_id), INDEX (organization_id, occurred_at),
  INDEX (organization_id, action)

settings
  organization_id integer FK organizations NOT NULL
  key text NOT NULL
  value text NOT NULL             -- JSON-encoded scalar/object
  updated_by integer FK users NULL
  updated_at text NOT NULL DEFAULT datetime('now')
  PRIMARY KEY (organization_id, key)
```

`audit_log` is written by a helper (`recordAudit(...)`) that the application use cases
call *inside their `withTransaction`* — it must share the connection so the write
commits/rolls back with the operation. `before_snapshot`/`after_snapshot` are captured via
the same row-mapping the repositories use.

## 3. Migrations

- Migration 1: `audit_log` + `settings`. Versions **18+** (17 reserved for finance).
  Register in `migrations.ts`.
- Seed a small default `settings` set per organization in `seed.ts` (gym display name,
  invoice footer, notice period defaults) with keys documented in `shared/contracts`.

## 4. Backend use cases & queries

Infrastructure (`src/main/application/backbone.ts` + `src/main/domain/backbone.ts`):

| Capability | Permission | Notes |
|---|---|---|
| `writeAudit(actor, action, entity, before?, after?, summary?)` | internal (called by every use case) | no permission of its own; must run in the caller's transaction |
| `listAuditPage(filter, page)` | `audit.view` | Paged trail; filters: actor, entity, action, date range |
| `getSettings()` | `settings.view` | returns the org's settings map |
| `updateSettings(entries)` | `settings.manage` | upsert per key; writes an audit entry |
| `getSetting(key)` | internal helper | cached read used by other modules |

Domain events (`src/main/domain/backbone.ts` or `src/main/events.ts`):

- `DomainEventBus` (in-process `EventEmitter`): `publish(event)` + typed subscribers.
- **Post-commit publication:** the bus is flushed only *after* `withTransaction` commits.
  Implementation choice: the `withTransaction` helper in
  `src/main/db/transaction.ts` accepts an optional `onCommit` callback that drains a
  per-transaction event queue; alternatively each use case publishes explicitly after the
  tx resolves. Decision in §11.
- Initial events: `MembershipSold`, `MembershipActivated`, `MembershipFrozen`,
  `MembershipUnfrozen`, `MembershipRenewed`, `MembershipCancelled`, `InvoiceFinalized`,
  `InvoicePaid`, `InvoiceVoided`, `PaymentRecorded`, `RefundIssued`, `CreditIssued`.

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `AUDIT_*` / `SETTINGS_*` namespace):

```text
audit:list     AuditPageQuery → Paged<AuditEntry>   (audit.view)
settings:get   {} → SettingsMap                     (settings.view)
settings:update { entries } → SettingsMap           (settings.manage)
```

Contracts in `src/shared/contracts/backbone.ts`: `auditEntrySchema` (action, entityType,
entityId, actorName, occurredAt, summary, before/after as `unknown`), `settingsMapSchema`
(string→JSON values), `updateSettingsInputSchema` (map of key→value). Errors: reuse
`VALIDATION_ERROR`, `NOT_FOUND`.

## 6. Preload API

Add `window.api.audit` (`list`) and `window.api.settings` (`get`, `update`) in
`src/preload/index.ts` + `index.d.ts`, unwrapping `data` or rejecting with the typed
error.

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/audit/
├── api/
│   ├── audit.api.ts          # list (window.api.audit.*)
│   └── index.ts
├── mappers.ts                # before/after snapshots → diff view model
└── queries.ts                # useAuditPage(query)

features/settings/
├── api/
│   ├── settings.api.ts       # get/update (window.api.settings.*)
│   └── index.ts
├── mappers.ts                # wire JSON values → typed settings map
└── queries.ts                # useSettings/useUpdateSettings
```

- New `features/audit/` + `features/settings/`: api files call `window.api.audit.list` /
  `window.api.settings.*` and return the `shared/contracts/backbone` wire types exactly;
  `queries.ts` `useAuditPage(query)`, `useSettings()`, `useUpdateSettings()` (invalidate
  `['settings']`; also invalidate any module keyed off a changed setting).
- Existing pages that will consume settings (invoice footer, notice periods) read them
  through the settings query once present — no mock replacement needed yet since these are
  new features, not mock swaps.

## 8. UI wiring

- **Audit viewer (new):** read-only register with entity/action/date filters; a drawer
  showing before/after JSON diffs. Entry point from Settings and from entity detail pages
  ("view audit history" per membership/customer/invoice).
- **Settings screen (new, minimal):** a small form over the settings map, gated by
  `settings.manage`; save calls `settings:update` and shows the audit entry.
- No change to existing mock-based pages.

## 9. Seed & permissions

- Permissions to add: `audit.view`, `settings.view`, `settings.manage`. Seed grants:
  Manager = all; Receptionist = `audit.view`? **no** — audit is admin-only by default
  (Manager + Admin). `settings.view` = Manager/Receptionist; `settings.manage` =
  Manager only. Super roles inherit.
- Backfill: once the helper exists, add `writeAudit` calls to the existing sale/catalog
  and the future membership/billing/finance use cases (each module plan lists the action
  strings). This is a per-module follow-up, not a one-time migration.

## 10. Tests

- **Audit-in-tx (core):** a use case that writes an audit entry then rolls back produces
  no audit row; a committed one produces exactly one; `before/after` snapshots reflect the
  pre/post state.
- **Settings:** get/update/upsert per key; update writes an audit entry; org isolation.
- **Event bus:** events publish only after commit (a failed tx publishes nothing);
  subscriber ordering; typed payloads; unhandled subscriber errors do not break the write.
- **Audit read:** filters (entity, action, actor, date range) and paging.
- **IPC:** handler tests (validation, permission, envelope).
- **Renderer:** audit register lists rows; settings form updates + invalidates.

## 11. Decisions & open items

1. **Where the post-commit hook lives:** prefer extending the existing `withTransaction`
   helper with an `onCommit` drain (single place, guarantees "no publish on rollback" for
   every use case) over per-use-case explicit publishing. Confirm the helper's current
   shape before coding; if it's a thin wrapper this is a small, high-leverage change.
2. **Audit volume:** a busy day can write many rows; the index on `(org, entity_type,
   entity_id)` keeps entity-scoped lookups cheap. No cleanup job in scope; ops owns backup
   and, if needed, archival (Module 08).
3. **Settings vs. permissions:** settings hold *preferences* (display, numbering, notice
   periods); anything that gates a business decision the docs model as policy data
   (Module 03) must live in the policy tables, not `settings`, to stay queryable and
   versioned.
4. **Audit for reads:** reads are not audited (only writes); sensitive-profile read
   auditing can be added later as a `security` setting without changing the schema.
5. **Event persistence:** in-process events are ephemeral (no outbox table). For a
   single-user desktop app this is acceptable; if a future feature needs guaranteed
   delivery, add an outbox in the same transaction — note this in ops/backbone docs.