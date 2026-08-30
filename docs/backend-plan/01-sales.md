# 01 — Sales: People, Leads, Activities, Follow-ups & Stages

**Ties to:** Module 01.
**Depends on:** 00 (foundation: schema, connection, transactions, RBAC, contracts). 03 only at conversion time (Module 07).
**Feeds into:** 02 (a converted lead becomes a customer), 07 (conversion), 09 (funnel/dashboards).

Buildable and demoable before any money moves. The first vertical slice ("Create Lead")
is the architecture proof per guidelines §28 Phase 4. `ConvertLead` is deliberately
**out of scope** for this module — it belongs to Module 07.

This is the **locked** plan. Every decision below was settled by the design grilling;
the code snippets match the shipped foundation conventions (`drizzle-orm` rc.4,
`node:sqlite`, object-literal repositories, `withTransaction`, domain errors, Zod contracts).

---

## 1. Locked decisions

| #   | Decision                                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Person identity key = `UNIQUE (organization_id, phone)`**, phone normalized to bare 10-digit via `IndianMobileNumber`. Email duplicable.                                                                               | §Person "the same person must not be duplicated". Phone is the only reliable, mandatory contact key at walk-in time; email is optional.                                                                       |
| D2  | **WON is unreachable in this module.** `MarkLeadWon` lives inside `ConvertLead` (07). `MoveLeadStage` can never target a stage flagged `is_won`/`is_lost`.                                                               | §23 invariant: _WON must reference the resulting customer/sale_. Customers do not exist until 02/07.                                                                                                          |
| D3  | **No `leads.status` column.** `status` is derived in queries from `current_stage_id → is_won/is_lost`.                                                                                                                   | A stored mirror of stage flags drifts when flags change (ADR-0007). One source of truth.                                                                                                                      |
| D4  | **`is_initial` flag on `lead_stages`** (pattern-matched to `is_won`/`is_lost`). _Uncontacted_ = in an `is_initial` stage AND zero activities.                                                                            | §"Uncontacted Leads" must not depend on the literal name `NEW` (stage names are configurable). Flags, never names.                                                                                            |
| D5  | **Follow-ups: `due_at` stored ISO-8601 UTC**; "today"/"overdue" boundaries computed in the org's `timezone` at read time (fallback `Asia/Kolkata` when null).                                                            | `due_at` is a wall-clock concept for the gym; storing UTC keeps the column unambiguous and lets us honor the org timezone at the query boundary.                                                              |
| D6  | **Per-org reference data provisioned at org setup**: stages, sources, lost-reasons, activity types — mirroring `seedRolesForOrganization`.                                                                               | These are org-scoped; a migration can't seed them (no org exists yet). The first slice must work right after setup.                                                                                           |
| D7  | **`lead_activity_types` reference table + FK** (`lead_activities.type_id`), seeded.                                                                                                                                      | Types are "configurable, not enum-locked"; a FK + reference table enforces the vocabulary and permits per-org extension. NOTE is a seeded type (the ubiquitous language lists it as a Lead Activity example). |
| D8  | **`MarkLeadLost`**: mandatory `lost_reason` satisfies the "explicit reason" clause — no separate activity required. Writes history, `lost_at`, `lost_by`.                                                                | §26 wants `lost_reason/lost_at/lost_by`; the reason _is_ the explicit cause the stage-move rule demands.                                                                                                      |
| D9  | **`followup.*` codes added** (FOLLOWUP_VIEW/CREATE/COMPLETE); Manager + Sales + Front Desk each get all three.                                                                                                           | The shipped catalog has no follow-up permissions; the plan requires them.                                                                                                                                     |
| D10 | **`MoveLeadStage` is the only stage-mover.** `RecordLeadActivity` never touches `current_stage_id`.                                                                                                                      | Worked example: each stage change is its own step caused by a recorded activity; one mover keeps the invariant checkable in one place.                                                                        |
| D11 | **`lead_stage_history.activity_id` NULL only for the initial placement** (`from=NULL → to=initial`). Every other move requires `activity_id` (LOST substitutes the reason).                                              | "Every stage change is caused by a recorded activity, never the reverse"; the initial NEW placement is a CreateLead step, not a move.                                                                         |
| D12 | **`leads.customer_id` kept as the WON-invariant anchor** (plain integer until `customers` lands in 02; FK added then). `customers.person_id` will be UNIQUE in 02 so the person-join and the direct link can't disagree. | §23 WON invariant; no schema churn now (customers doesn't exist yet).                                                                                                                                         |
| D13 | **`CreateLead` rejects when the person already has an active (non-terminal) lead.**                                                                                                                                      | §"v1: one active lead per person is sufficient". `ConflictError`.                                                                                                                                             |
| D14 | **`MoveLeadStage` may target any active non-terminal stage** (forward or backward, e.g. NEGOTIATION→CONTACTED).                                                                                                          | Real gyms drag back; the worked example only shows forward. Requires `activity_id`.                                                                                                                           |
| D15 | **`AssignLead` writes an `OWNER_CHANGE` lead_activity** (seeded type) — no dependency on the 06 `audit_log`.                                                                                                             | Ownership reassignment is a recorded sales event, visible in the timeline; audit_log ships after 01.                                                                                                          |
| D16 | **Default `owner_user_id` = creator** on `CreateLead`.                                                                                                                                                                   | §25/§27 "Who owns this lead?" must always be answerable.                                                                                                                                                      |
| D17 | **Optimistic concurrency on `MoveLeadStage`**: caller passes `expectedStageId`; mismatch → `CONFLICT`.                                                                                                                   | Kanban drags race; reject stale moves cheaply.                                                                                                                                                                |
| D18 | **"Trials Ending" is derived from follow-ups** (TRIAL-stage leads with a due follow-up), not a stage-specific column.                                                                                                    | Keeps trial semantics inside the three-table model; no `trial_end_date` on the lead row.                                                                                                                      |
| D19 | **"New Leads" ≠ "Uncontacted"**: New = in an `is_initial` stage (any); Uncontacted = in an `is_initial` stage with zero activities. Two queries.                                                                         | §25 lists both dashboard cards separately.                                                                                                                                                                    |
| D20 | **Reference-data CRUD gated by `settings.manage`** (stages/sources/reasons/types are org configuration, not lead operations).                                                                                            | Matches the catalog's `settings.manage` intent; keeps `lead.*` codes for the workflow.                                                                                                                        |

---

## 2. Domain vocabulary (what)

Ubiquitous language, reconciled with the glossary (`plans/CONTEXT.md`):

- **Person** — a human known to the business; never duplicated because the lifecycle changed. Identity: `(org, phone)`.
- **Lead** — a sales opportunity for a person. One active lead per person (v1). Not the customer.
- **Lead Source** — where the enquiry came from (org-scoped reference data).
- **Lead Stage** — the current sales-process position (org-scoped reference data). Logic reads only `is_initial`/`is_won`/`is_lost`.
- **Lead Activity** — a record of an interaction or sales event that happened (immutable). Includes the `NOTE` type (a note is a _kind of_ activity record; it is still not a follow-up). Seeded types: PHONE_CALL, WALK_IN, WHATSAPP, GYM_TOUR, TRIAL, NOTE, PRICE_DISCUSSION, MEMBERSHIP_PROPOSAL, OWNER_CHANGE.
- **Follow-up** — future work with a `due_at`, marked done when performed.
- **Lead Stage History** — every stage change, appended, never overwritten.

**Invariants (from Module 01, §worked example/§23/§24):**

> 1. Every stage change is caused by a recorded activity (or, for LOST, an explicit reason). Never the reverse.
> 2. No transition out of a terminal (WON/LOST) stage.
> 3. WON must reference the resulting customer/sale (§23). Enforced in 07.
> 4. One active (non-terminal) lead per person, v1.
> 5. A lead's discussion history is a timeline, not one overwritten notes field.

---

## 3. Schema (what + why + how) — `src/main/db/schema/sales.ts`

Follows the identity schema conventions exactly: `integer` autoincrement PKs, `text`
timestamps with `datetime('now')` defaults, `unique().on(...)` and `index(...)` in the
table-level array, snake_case columns.

**Why this shape:** structural rules (uniqueness, FKs, NOT NULL) go in the database
(guidelines §9); workflow rules (transition legality, "one active lead", ownership
default) stay in the domain/application layer.

```ts
// src/main/db/schema/sales.ts
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'

/** People anchor (ADR-0009). Phone is normalized to bare 10-digit by the caller. */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    full_name: text('full_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.phone),
    index('idx_people_org_phone').on(table.organization_id, table.phone)
  ]
)

/** Org-scoped reference data. Stages drive the funnel; logic reads only the flags. */
export const leadStages = sqliteTable(
  'lead_stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    is_initial: integer('is_initial', { mode: 'boolean' }).notNull().default(false),
    is_won: integer('is_won', { mode: 'boolean' }).notNull().default(false),
    is_lost: integer('is_lost', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.organization_id, table.name)]
)

export const leadSources = sqliteTable(
  'lead_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.organization_id, table.name)]
)

export const leadLostReasons = sqliteTable(
  'lead_lost_reasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.organization_id, table.name)]
)

/** Activity types are configurable, not enum-locked; NOTE and OWNER_CHANGE are seeded types. */
export const leadActivityTypes = sqliteTable(
  'lead_activity_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.organization_id, table.name)]
)

/**
 * A sales opportunity. No status column: the status is derived from
 * current_stage_id's is_won/is_lost flags (D3). customer_id is a plain
 * integer until Module 02 lands; its FK is added in the 02 migration.
 */
export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    person_id: integer('person_id')
      .notNull()
      .references(() => people.id),
    source_id: integer('source_id')
      .notNull()
      .references(() => leadSources.id),
    current_stage_id: integer('current_stage_id')
      .notNull()
      .references(() => leadStages.id),
    owner_user_id: integer('owner_user_id').references(() => users.id),
    customer_id: integer('customer_id'),
    lost_reason_id: integer('lost_reason_id').references(() => leadLostReasons.id),
    lost_at: text('lost_at'),
    lost_by: integer('lost_by').references(() => users.id),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_leads_org_stage').on(table.organization_id, table.current_stage_id),
    index('idx_leads_org_owner').on(table.organization_id, table.owner_user_id),
    index('idx_leads_person').on(table.person_id)
  ]
)

/** Immutable record of an interaction/sales event. created_by is mandatory. */
export const leadActivities = sqliteTable(
  'lead_activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    type_id: integer('type_id')
      .notNull()
      .references(() => leadActivityTypes.id),
    note: text('note'),
    occurred_at: text('occurred_at').notNull(),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_lead_activities_lead').on(table.lead_id)]
)

/** Future work: a due action that can be marked done (idempotently). */
export const leadFollowups = sqliteTable(
  'lead_followups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    title: text('title').notNull(),
    due_at: text('due_at').notNull(),
    completed_at: text('completed_at'),
    completed_by: integer('completed_by').references(() => users.id),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_followups_due').on(table.organization_id, table.due_at, table.completed_at)
  ]
)

/**
 * Append-only stage history. activity_id is NULL only for the initial placement;
 * LOST moves use reason instead of activity_id (D8, D11).
 */
export const leadStageHistory = sqliteTable(
  'lead_stage_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    from_stage_id: integer('from_stage_id').references(() => leadStages.id),
    to_stage_id: integer('to_stage_id')
      .notNull()
      .references(() => leadStages.id),
    activity_id: integer('activity_id').references(() => leadActivities.id),
    reason: text('reason'),
    changed_by: integer('changed_by')
      .notNull()
      .references(() => users.id),
    changed_at: text('changed_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_stage_history_lead').on(table.lead_id)]
)
```

Register in `src/main/db/schema/index.ts` — add the tables to the `schema` object and
declarations to `relations` (following the identity relations style). Relations are
declared for schema completeness; repositories still query with explicit joins.

```ts
// src/main/db/schema/index.ts (additions)
import {
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leads,
  leadSources,
  leadStages,
  leadStageHistory,
  people
} from './sales'
// ...schema = { ..., people, leads, leadStages, leadSources, leadLostReasons,
//              leadActivityTypes, leadActivities, leadFollowups, leadStageHistory }
// ...relations: leads.one.person / one.currentStage / many.activities / many.followups /
//               many.stageHistory, etc.
```

**Why explicit `unique()` + `index()` on `people`:** the UNIQUE is the identity key
(D1); the index is redundant-but-free in SQLite for the covered `(org, phone)` lookup.

---

## 4. Stage machine (domain) — `src/main/domain/lead.ts`

**What:** a pure, flag-driven validator. **Why:** "make the rare case configurable" —
gyms edit stage names, so logic must never see a literal name. **How:** every rule reads
`is_initial`/`is_won`/`is_lost`/`active` only.

```ts
// src/main/domain/lead.ts
import { InvalidStateTransitionError } from './errors'

export type LeadStatus = 'OPEN' | 'WON' | 'LOST'

export interface LeadStage {
  id: number
  name: string
  sortOrder: number
  isInitial: boolean
  isWon: boolean
  isLost: boolean
  active: boolean
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

/** Derived, never stored (D3). */
export function deriveLeadStatus(stage: LeadStage): LeadStatus {
  if (stage.isWon) return 'WON'
  if (stage.isLost) return 'LOST'
  return 'OPEN'
}

/**
 * The only place that decides whether a stage change may happen. Pure: no I/O.
 * Terminal stages are the state machine's absorbing states; WON/LOST cannot be
 * entered or left via MoveLeadStage in this module (D2, D10).
 */
export class LeadStageMachine {
  constructor(private readonly stages: LeadStage[]) {}

  /** The stage a new lead is placed on. Throws if the org has no initial stage. */
  initialStage(): LeadStage {
    const initial = this.stages.find((s) => s.active && s.isInitial)
    if (!initial) {
      throw new InvalidStateTransitionError('No initial lead stage is configured')
    }
    return initial
  }

  /**
   * Validates a normal MoveLeadStage. `hasActivity` is true when the caller
   * supplied a valid activity_id. WON/LOST targets are rejected here.
   */
  assertMoveAllowed(current: LeadStage, target: LeadStage, hasActivity: boolean): void {
    if (!current.active) {
      throw new InvalidStateTransitionError('The current stage is inactive')
    }
    if (current.isWon || current.isLost) {
      throw new InvalidStateTransitionError('A terminal lead cannot change stage')
    }
    if (!target.active) {
      throw new InvalidStateTransitionError('The target stage is inactive')
    }
    if (target.isWon || target.isLost) {
      throw new InvalidStateTransitionError('WON/LOST are terminal and unreachable here')
    }
    if (!hasActivity) {
      throw new InvalidStateTransitionError('Every stage change requires a recorded activity')
    }
  }

  /**
   * Validates the LOST move. No activity required — a mandatory lost_reason is the
   * explicit cause (D8). The reason is the caller's job to supply.
   */
  assertCanMarkLost(current: LeadStage): void {
    if (!current.active) {
      throw new InvalidStateTransitionError('The current stage is inactive')
    }
    if (current.isWon || current.isLost) {
      throw new InvalidStateTransitionError('This lead is already terminal')
    }
  }
}
```

**Why `assertCanMarkLost` exists separately:** LOST is terminal, entered only through
`MarkLeadLost`; the target is the org's lost stage, found by flag — never a hard-coded
name. Terminal flags make the lost stage discoverable even when the gym renames it.

---

## 5. Permissions (what) — `src/main/db/permissions.ts` + `seed.ts`

**Why:** the catalog is additive; super roles inherit new codes with no code change.

```ts
// additions to PERMISSIONS
  // Follow-ups (Module 01)
  FOLLOWUP_VIEW: 'followup.view',
  FOLLOWUP_CREATE: 'followup.create',
  FOLLOWUP_COMPLETE: 'followup.complete',
```

Grants (D9): Manager + Sales + Front Desk each gain all three codes in `SEED_ROLES`
(`'followup.view', 'followup.create', 'followup.complete'`). Reference-data CRUD uses
`settings.manage` (D20) — already granted to Manager/Admin super roles only.

**Note:** `lead.convert` remains in the catalog but is unused until Module 07.

---

## 6. Provisioning & seeding (what + how) — `src/main/db/seed.ts`

**Why:** stages/sources/reasons/types are org-scoped; a migration can't seed rows for an
org that doesn't exist yet. **How:** `seedSalesReferenceData(orgId)` is called inside
`setupOrganization`'s transaction, exactly like `seedRolesForOrganization`. Idempotency
is not required — it runs once for a brand-new org; the `UNIQUE(org, name)` constraint
guards against double-calls.

```ts
// src/main/db/seed.ts (additions)
export const SEED_STAGES: Array<{
  name: string
  isInitial?: boolean
  isWon?: boolean
  isLost?: boolean
}> = [
  { name: 'NEW', isInitial: true },
  { name: 'CONTACTED' },
  { name: 'INTERESTED' },
  { name: 'VISIT_SCHEDULED' },
  { name: 'VISITED' },
  { name: 'TRIAL' },
  { name: 'NEGOTIATION' },
  { name: 'WON', isWon: true },
  { name: 'LOST', isLost: true }
]

export const SEED_SOURCES = [
  'Walk-in',
  'Phone',
  'Referral',
  'Instagram',
  'Website',
  'Advertisement',
  'Existing Member Referral',
  'Other'
]

export const SEED_ACTIVITY_TYPES = [
  'PHONE_CALL',
  'WALK_IN',
  'WHATSAPP',
  'GYM_TOUR',
  'TRIAL',
  'NOTE',
  'PRICE_DISCUSSION',
  'MEMBERSHIP_PROPOSAL',
  'OWNER_CHANGE'
]

export const SEED_LOST_REASONS = [
  'Too Expensive',
  'Joined Competitor',
  'Not Interested',
  'No Response',
  'Moved Away',
  'Medical Reason',
  'Wrong Contact',
  'Other'
]

/** Provisions the org's sales reference data. Called from org setup. */
export function seedSalesReferenceData(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()
    SEED_STAGES.forEach((s, i) => {
      db.insert(leadStages)
        .values({
          organization_id: organizationId,
          name: s.name,
          sort_order: i,
          is_initial: Boolean(s.isInitial),
          is_won: Boolean(s.isWon),
          is_lost: Boolean(s.isLost)
        })
        .run()
    })
    SEED_SOURCES.forEach((name, i) => {
      db.insert(leadSources).values({ organization_id: organizationId, name, sort_order: i }).run()
    })
    SEED_ACTIVITY_TYPES.forEach((name) => {
      db.insert(leadActivityTypes).values({ organization_id: organizationId, name }).run()
    })
    SEED_LOST_REASONS.forEach((name, i) => {
      db.insert(leadLostReasons)
        .values({ organization_id: organizationId, name, sort_order: i })
        .run()
    })
  })
}
```

Wired into `setupOrganization` in `src/main/application/identity.ts`, next to the
existing role seeding:

```ts
seedRolesForOrganization(org.id)
seedSalesReferenceData(org.id) // ← new
```

**Why this order:** roles then sales reference data, both inside the same
`withTransaction`; the org can't exist half-seeded.

---

## 7. Repositories (what) — `src/main/repositories/sales.ts`

Object-literal repos, org-scoped, explicit joins, `getDrizzle()` — mirroring
`src/main/repositories/identity.ts`. Repositories never decide transaction boundaries;
use cases own them (§5).

```ts
export const personRepo = {
  /** Identity key: (org, normalized phone). Returns null when unknown. */
  findByPhone(organizationId: number, phone: string): Person | null { /* select ... where org & phone */ },
  create(input: { organizationId: number; fullName: string; phone: string; email: string | null }): Person { /* insert returning */ }
}

export const leadRepo = {
  getById(organizationId: number, id: number): Lead | null,
  /** Active = current stage is not terminal (D13). Joined against lead_stages. */
  findActiveByPersonId(organizationId: number, personId: number): Lead | null,
  create(input): Lead,
  updateCurrentStage(organizationId: number, id: number, stageId: number): Lead, // optimistic guard lives in the use case
  markLost(input: { organizationId: number; id: number; reasonId: number; lostBy: number }): Lead
}

export const stageRepo = {
  findAll(organizationId: number): LeadStage[],       // ordered by sort_order
  findInitial(organizationId: number): LeadStage | null,
  findById(organizationId: number, id: number): LeadStage | null
}

export const activityRepo = {
  create(input): LeadActivity,
  /** Scoped: the activity must belong to the lead AND the org (guards against cross-org ids). */
  getById(organizationId: number, id: number): LeadActivity | null
}

export const followupRepo = {
  create(input): LeadFollowup,
  getById(organizationId: number, id: number): LeadFollowup | null,
  complete(organizationId: number, id: number, by: number): void,
  /** Boundaries are precomputed UTC instants by the caller (D5). */
  listDueBetween(organizationId: number, startUtc: string, endUtc: string): LeadFollowup[],
  listOverdueBefore(organizationId: number, nowUtc: string): LeadFollowup[]
}

export const stageHistoryRepo = {
  record(input: { organizationId: number; leadId: number; fromStageId: number | null;
                  toStageId: number; activityId: number | null; reason: string | null;
                  changedBy: number }): void
}
```

**Why these specific methods, not generic CRUD:** each name is a persistence need of a
use case. No `updateRow`, no generic `Database` interface (guidelines §6).

---

## 8. Application use cases (what + how) — `src/main/application/leads.ts`

Every command: `requirePermission` → org/user context → validate → one `withTransaction`
→ side effects inside it. Errors are typed domain errors.

### 8.1 `CreateLead` — the first vertical slice

**Why it is the slice:** exercises React → IPC → validation → use case → domain → repo →
Drizzle → SQLite end-to-end (§28 Phase 4). **How:**

```ts
import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { personRepo, leadRepo, stageRepo, stageHistoryRepo } from '../repositories/sales'
import { IndianMobileNumber } from '../domain/phone'
import { LeadStageMachine } from '../domain/lead'
import { ConflictError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'

export function createLead(input: CreateLeadInput): CreatedLead {
  requirePermission(PERMISSIONS.LEAD_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const phone = IndianMobileNumber.parse(input.phone) // normalized 10-digit (D1)
  const machine = new LeadStageMachine(stageRepo.findAll(organizationId))
  const initialStage = machine.initialStage() // throws if none configured

  return withTransaction(() => {
    let person = personRepo.findByPhone(organizationId, phone.value)
    if (!person) {
      person = personRepo.create({
        organizationId,
        fullName: input.fullName.trim(),
        phone: phone.value,
        email: input.email?.trim().toLowerCase() ?? null
      })
    }

    if (leadRepo.findActiveByPersonId(organizationId, person.id)) {
      throw new ConflictError('This person already has an active lead') // D13
    }

    const lead = leadRepo.create({
      organizationId,
      personId: person.id,
      sourceId: input.sourceId,
      currentStageId: initialStage.id,
      ownerUserId: userId, // default owner = creator (D16)
      createdBy: userId
    })

    stageHistoryRepo.record({
      // initial placement: from/activity = null (D11)
      organizationId,
      leadId: lead.id,
      fromStageId: null,
      toStageId: initialStage.id,
      activityId: null,
      reason: null,
      changedBy: userId
    })

    return { leadId: lead.id, personId: person.id }
  })
}
```

**What it guarantees atomically:** person found-or-created, one-active-lead rule, lead at
the initial stage, and the initial history row — or nothing at all.

### 8.2 `MoveLeadStage`

```ts
export function moveLeadStage(input: MoveLeadStageInput): void {
  requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = new LeadStageMachine(stageRepo.findAll(organizationId))
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  const current = stageRepo.findById(organizationId, lead.currentStageId)
  const target = stageRepo.findById(organizationId, input.targetStageId)
  if (!current || !target) throw new NotFoundError('Stage not found')

  if (lead.currentStageId !== input.expectedStageId) {
    throw new ConflictError('Lead changed concurrently; refresh and retry') // D17
  }

  const activity = activityRepo.getById(organizationId, input.activityId) // scoped to org
  if (!activity || activity.leadId !== lead.id) {
    throw new NotFoundError('Activity not found')
  }

  machine.assertMoveAllowed(current, target, true) // D10, D14

  withTransaction(() => {
    leadRepo.updateCurrentStage(organizationId, lead.id, target.id)
    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: current.id,
      toStageId: target.id,
      activityId: activity.id,
      reason: null,
      changedBy: userId
    })
  })
}
```

**Why the optimistic check + scoped activity load:** a Kanban drag raced against another
drag must fail cleanly (D17), and an `activityId` from another org/lead must never be
accepted (org isolation).

### 8.3 `MarkLeadLost`

```ts
export function markLeadLost(input: MarkLeadLostInput): void {
  requirePermission(PERMISSIONS.LEAD_MARK_LOST)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = new LeadStageMachine(stageRepo.findAll(organizationId))
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  const current = stageRepo.findById(organizationId, lead.currentStageId)
  if (!current) throw new NotFoundError('Stage not found')

  const lostStage = stageRepo.findAll(organizationId).find((s) => s.isLost && s.active)
  if (!lostStage) throw new InvalidStateTransitionError('No lost stage is configured')
  const reason = reasonRepo.findById(organizationId, input.lostReasonId)
  if (!reason) throw new NotFoundError('Lost reason not found')

  machine.assertCanMarkLost(current) // D8

  withTransaction(() => {
    leadRepo.markLost({ organizationId, id: lead.id, reasonId: reason.id, lostBy: userId })
    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: current.id,
      toStageId: lostStage.id,
      activityId: null,
      reason: reason.name,
      changedBy: userId // reason = cause
    })
  })
}
```

### 8.4 `ScheduleFollowUp` / `CompleteFollowUp`

`ScheduleFollowUp` requires `FOLLOWUP_CREATE`; validates `dueAt` is a future ISO string;
stores as-is (UTC). `CompleteFollowUp` requires `FOLLOWUP_COMPLETE`; **idempotent** —
completing an already-completed follow-up is a no-op success, not an error (§ plan
decision; the follow-up exists and is done).

```ts
export function completeFollowUp(input: CompleteFollowUpInput): void {
  requirePermission(PERMISSIONS.FOLLOWUP_COMPLETE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const followup = followupRepo.getById(organizationId, input.followupId)
  if (!followup) throw new NotFoundError('Follow-up not found')
  if (followup.completedAt) return // idempotent
  followupRepo.complete(organizationId, followup.id, userId)
}
```

### 8.5 `AssignLead`

```ts
export function assignLead(input: AssignLeadInput): void {
  requirePermission(PERMISSIONS.LEAD_ASSIGN)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  if (lead.ownerUserId === input.ownerUserId) return // no-op

  const ownerChangeType = activityTypeRepo.findByName(organizationId, 'OWNER_CHANGE')
  if (!ownerChangeType) throw new NotFoundError('OWNER_CHANGE activity type is not configured')

  withTransaction(() => {
    leadRepo.updateOwner(organizationId, lead.id, input.ownerUserId)
    activityRepo.create({
      // D15
      organizationId,
      leadId: lead.id,
      typeId: ownerChangeType.id,
      note: `Ownership changed from user ${lead.ownerUserId ?? 'none'} to ${input.ownerUserId}`,
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
  })
}
```

**Why an activity, not audit:** ownership reassignment is a recorded sales event that
must appear on the lead timeline; `audit_log` doesn't exist until 06 (D15).

---

## 9. Queries (what + how)

All read-only, gated by `lead.view` (or `followup.view` for follow-up lists), org-scoped.
Return shapes come from `src/shared/contracts/sales.ts` (Zod). Representative ones:

### 9.1 `GetUncontactedLeads` (D4, D19)

```ts
const rows = db
  .select({
    leadId: leads.id,
    personName: people.full_name,
    phone: people.phone,
    stageName: leadStages.name
  })
  .from(leads)
  .innerJoin(people, eq(people.id, leads.person_id))
  .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
  .leftJoin(leadActivities, eq(leadActivities.lead_id, leads.id))
  .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_initial, true)))
  .groupBy(leads.id)
  .having(isNull(leadActivities.id)) // zero activities
  .all()
```

**Why `is_initial` not `name = 'NEW'`:** the stage name is configurable; the flag is the
only stable signal (D4).

### 9.2 `GetFunnelCounts`

```ts
const rows = db
  .select({
    stageId: leadStages.id,
    stageName: leadStages.name,
    isWon: leadStages.is_won,
    isLost: leadStages.is_lost,
    count: count()
  })
  .from(leads)
  .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
  .where(eq(leads.organization_id, organizationId))
  .groupBy(leads.current_stage_id)
  .orderBy(leadStages.sort_order)
  .all()
```

`status` per bucket is derived from `isWon`/`isLost` (D3).

### 9.3 `GetTodaysFollowups` / `GetOverdueFollowups` (D5)

```ts
const org = organizationRepo.findById(organizationId) // for timezone
const tz = org?.timezone ?? DEFAULT_TIMEZONE
const { start, end } = localDayUtcRange(tz, new Date()) // helper below
const today = followupRepo.listDueBetween(organizationId, start, end) // completed_at IS NULL inside repo
const overdue = followupRepo.listOverdueBefore(organizationId, new Date().toISOString())
```

**Why the helper:** `due_at` is UTC; "today" is a wall-clock concept in the gym's
timezone. The helper converts the org-local midnight/midnight window to UTC instants:

```ts
/** Returns the org-local day window for `date` as UTC ISO instants. */
function localDayUtcRange(tz: string, date: Date): { start: string; end: string } {
  const offsetMin = tzOffsetMinutes(tz, date)
  const start = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - offsetMin * 60_000
  )
  const end = new Date(start.getTime() + 86_400_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function tzOffsetMinutes(tz: string, date: Date): number {
  const part =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}
```

**Unit-tested edge:** UTC-midnight rollovers in IST so "11:00 PM IST" stays on the right
calendar day.

### 9.4 `GetLeadTimeline` (D15, §24)

Composite of three typed groups, merged in the application layer (no SQL UNION needed):

```ts
const activities = activityRepo.listForLead(organizationId, leadId) // → kind: 'activity', at: occurred_at
const history = stageHistoryRepo.listForLead(organizationId, leadId) // → kind: 'stage', at: changed_at
const followups = followupRepo.listForLead(organizationId, leadId) // → kind: 'followup', at: created_at (or due_at)
// merge by `at`, newest first, plus a synthetic "Lead created" entry from leads.created_at
```

### 9.5 Other queries

`GetLeadDetails` (lead + person + stage + source + owner, joined), `GetNewLeads`
(is_initial, any), `GetRecentlyWon` / `GetRecentlyLost` (current stage is_won/is_lost,
ordered by updated_at, limited), `GetTrialsEnding` (current stage `name = 'TRIAL'`
is fragile — use **stage-flag-free heuristic**: current stage sort_order > initial AND a
due follow-up exists; the recommended default seed marks TRIAL at a fixed sort_order
position, so the query is `current_stage_id IN (trial-stage ids configured)` — **resolved
as: TRIAL-stage leads with a due, uncompleted follow-up**, where the TRIAL stage is
matched by name seed + active + not terminal. This is the one place the plan accepts a
seeded-name dependency, and it degrades to "no results" if the gym renames TRIAL),
`SearchPeople` (name/phone `LIKE`), `GetOverdueFollowups`.

---

## 10. IPC surface + contracts (what + how)

### 10.1 Channels — `src/shared/contracts/ipc.channels.ts`

```ts
export const IPC_CHANNELS = {
  ...,
  LEADS_CREATE: 'leads:create',
  LEADS_MOVE_STAGE: 'leads:moveStage',
  LEADS_RECORD_ACTIVITY: 'leads:recordActivity',
  LEADS_ASSIGN: 'leads:assign',
  LEADS_MARK_LOST: 'leads:markLost',
  LEADS_SCHEDULE_FOLLOWUP: 'leads:scheduleFollowup',
  LEADS_COMPLETE_FOLLOWUP: 'leads:completeFollowup',
  LEADS_GET_DETAILS: 'leads:getDetails',
  LEADS_GET_TIMELINE: 'leads:getTimeline',
  LEADS_GET_NEW: 'leads:getNew',
  LEADS_GET_UNCONTACTED: 'leads:getUncontacted',
  LEADS_GET_TODAYS_FOLLOWUPS: 'leads:getTodaysFollowups',
  LEADS_GET_OVERDUE_FOLLOWUPS: 'leads:getOverdueFollowups',
  LEADS_GET_TRIALS_ENDING: 'leads:getTrialsEnding',
  LEADS_GET_RECENT_WON: 'leads:getRecentlyWon',
  LEADS_GET_RECENT_LOST: 'leads:getRecentlyLost',
  LEADS_GET_FUNNEL_COUNTS: 'leads:getFunnelCounts',
  LEADS_SEARCH_PEOPLE: 'leads:searchPeople',
  LEADS_GET_REFERENCE: 'leads:getReferenceData'      // stages/sources/reasons/types for forms
} as const
```

### 10.2 Contracts — `src/shared/contracts/sales.ts`

Boundary schemas validate shape; domain rules stay in the application layer.

```ts
import { z } from 'zod'

export const createLeadInputSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(1).max(24), // format validated in application (IndianMobileNumber)
  email: z.string().max(254).optional(),
  sourceId: z.number().int().positive()
})
export type CreateLeadInput = z.infer<typeof createLeadInputSchema>

export const createdLeadSchema = z.object({
  leadId: z.number().int().positive(),
  personId: z.number().int().positive()
})
export type CreatedLead = z.infer<typeof createdLeadSchema>

export const moveLeadStageInputSchema = z.object({
  leadId: z.number().int().positive(),
  targetStageId: z.number().int().positive(),
  expectedStageId: z.number().int().positive(), // optimistic concurrency (D17)
  activityId: z.number().int().positive()
})
export type MoveLeadStageInput = z.infer<typeof moveLeadStageInputSchema>

export const markLeadLostInputSchema = z.object({
  leadId: z.number().int().positive(),
  lostReasonId: z.number().int().positive()
})
export type MarkLeadLostInput = z.infer<typeof markLeadLostInputSchema>

export const scheduleFollowUpInputSchema = z.object({
  leadId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  dueAt: z.string() // ISO-8601; future-checked in application
})
export type ScheduleFollowUpInput = z.infer<typeof scheduleFollowUpInputSchema>

export const completeFollowUpInputSchema = z.object({ followupId: z.number().int().positive() })
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpInputSchema>

export const assignLeadInputSchema = z.object({
  leadId: z.number().int().positive(),
  ownerUserId: z.number().int().positive()
})
export type AssignLeadInput = z.infer<typeof assignLeadInputSchema>

export const recordLeadActivityInputSchema = z.object({
  leadId: z.number().int().positive(),
  typeId: z.number().int().positive(),
  note: z.string().max(2000).optional(),
  occurredAt: z.string() // ISO-8601
})
export type RecordLeadActivityInput = z.infer<typeof recordLeadActivityInputSchema>

// pageRequestSchema (paging.ts) composes into list-query inputs, e.g.:
export const funnelCountsSchema = z.array(
  z.object({
    stageId: z.number().int().positive(),
    stageName: z.string(),
    isWon: z.boolean(),
    isLost: z.boolean(),
    count: z.number().int()
  })
)
export type FunnelCounts = z.infer<typeof funnelCountsSchema>
```

### 10.3 Registration — `src/main/ipc/sales.ts`

```ts
import { handle } from './handle'
import { createLead, moveLeadStage, markLeadLost, ... } from '../application/leads'

export function registerSalesIpc(): void {
  handle(IPC_CHANNELS.LEADS_CREATE, createLeadInputSchema, createLead)
  handle(IPC_CHANNELS.LEADS_MOVE_STAGE, moveLeadStageInputSchema, moveLeadStage)
  handle(IPC_CHANNELS.LEADS_MARK_LOST, markLeadLostInputSchema, markLeadLost)
  handle(IPC_CHANNELS.LEADS_SCHEDULE_FOLLOWUP, scheduleFollowUpInputSchema, scheduleFollowUp)
  handle(IPC_CHANNELS.LEADS_COMPLETE_FOLLOWUP, completeFollowUpInputSchema, completeFollowUp)
  handle(IPC_CHANNELS.LEADS_ASSIGN, assignLeadInputSchema, assignLead)
  handle(IPC_CHANNELS.LEADS_RECORD_ACTIVITY, recordLeadActivityInputSchema, recordLeadActivity)
  // queries: handle(channel, schema, fn)
}
```

Registered in `src/main/ipc` alongside the identity handlers. Preload exposes
`window.api.leads` and the renderer feature talks to it **only through
`src/renderer/src/api/client.ts`** (guidelines §14).

---

## 11. Tests (what) — `tests/`

Mirrors the foundation test layout (domain/application/repository/integration).

- `tests/domain/lead-stage-machine.test.ts` — legal moves, WON/LOST target rejected,
  terminal source rejected, no-activity rejected, `deriveLeadStatus`, `initialStage` when
  none configured. No SQLite.
- `tests/main/application/leads.test.ts` — `CreateLead` (find-or-create, reject-on-active,
  default owner, initial history row), `MoveLeadStage` (optimistic conflict, cross-org
  activity rejected, atomicity rollback), `MarkLeadLost` (reason required, terminal once),
  `CompleteFollowUp` idempotency, `AssignLead` writes OWNER_CHANGE.
- `tests/main/repositories/sales.test.ts` — `UNIQUE(org, phone)`, `UNIQUE(org, name)`,
  org scoping, uncontacted query, funnel grouping, follow-up due-window query (real
  `:memory:` SQLite).
- `tests/main/ipc/sales.test.ts` — CreateLead end-to-end via `handle()` envelope; bad
  input → `VALIDATION_ERROR`; missing permission → `PERMISSION_DENIED`.
- `tests/domain/timezone.test.ts` — `localDayUtcRange` around UTC-midnight rollover
  (IST +05:30), a null-timezone fallback to `Asia/Kolkata`.

---

## 12. Build order

1. **Docs** — rewrite this plan (done); amend ADR-0007 (add `is_initial`, single mover,
   terminal-unreachable, any-intermediate); amend ADR-0009 (phone identity key, one-active
   lead); add ADR-0010 (per-org reference provisioning + activity-type reference table);
   reconcile `CONTEXT.md` (Note as a Lead Activity type; add _Uncontacted Lead_ term).
2. **Schema** — `sales.ts`, schema/index.ts wiring, `drizzle-kit generate` → new versioned
   migration (existing `?raw` runner applies it; legacy reconciliation untouched).
3. **Permissions + seed** — `followup.*` codes, SEED_ROLES grants, `seedSalesReferenceData`
   wired into `setupOrganization`.
4. **Domain** — `lead.ts` stage machine + `deriveLeadStatus` + timezone helper.
5. **Repositories** — `sales.ts` repo object-literal, org-scoped, explicit joins.
6. **Application** — use cases + queries. Vertical slice: `CreateLead`.
7. **IPC + contracts** — channels, Zod schemas, handler registration, preload, renderer
   `client.ts` + feature queries.
8. **Tests** — per §11; full suite + lint + typecheck green.

---

## 13. Definition of done (guidelines §30)

- [ ] CreateLead is a business use case owning one transaction.
- [ ] Inputs validated at the IPC boundary (Zod); domain rules in the application layer.
- [ ] Authorization checked in the backend (`lead.*`, `followup.*`, `settings.manage`).
- [ ] Stage transitions enforced by the domain machine, not the UI.
- [ ] WON unreachable in this module; LOST requires a reason.
- [ ] No stored `leads.status`; status derived from stage flags.
- [ ] `people` uniqueness = `(org, phone)`; one active lead per person enforced.
- [ ] Follow-up "today/overdue" computed in the org timezone from UTC `due_at`.
- [ ] All related writes atomic (person+lead+history; move+history; lost+history).
- [ ] Persistence isolated behind repositories; Drizzle stays in infrastructure.
- [ ] `followup.*` codes seeded and granted (Manager/Sales/Front Desk).
- [ ] Reference data provisioned at org setup; activity types FK-backed.
- [ ] Domain/application errors typed; renderer branches on error codes.
- [ ] Stage-machine, repository, timezone, and end-to-end tests green.
