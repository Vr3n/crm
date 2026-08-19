import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  or,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { getDrizzle } from '../db/connection'
import {
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  people,
  users
} from '../db/schema'
import {
  Lead,
  LeadActivity,
  LeadFollowup,
  LeadStage,
  LeadStageHistoryEntry,
  Person
} from '../domain/lead'

/**
 * Module 01 repositories. Object-literal repos (matching identity.ts), org-scoped
 * on every query, explicit joins, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary (§5).
 */

interface PersonRow {
  id: number
  organization_id: number
  full_name: string
  phone: string
  email: string | null
  created_at: string
  updated_at: string
}

interface LeadRow {
  id: number
  organization_id: number
  person_id: number
  source_id: number
  current_stage_id: number
  owner_user_id: number | null
  customer_id: number | null
  plan_interest: string | null
  goal: string | null
  notes: string | null
  lost_reason_id: number | null
  lost_at: string | null
  lost_by: number | null
  created_by: number
  created_at: string
  updated_at: string
}

interface LeadStageRow {
  id: number
  organization_id: number
  name: string
  sort_order: number
  is_initial: boolean
  is_won: boolean
  is_lost: boolean
  active: boolean
  created_at: string
}

interface ActivityRow {
  id: number
  organization_id: number
  lead_id: number
  type_id: number
  note: string | null
  occurred_at: string
  created_by: number
  created_at: string
}

interface FollowupRow {
  id: number
  organization_id: number
  lead_id: number
  title: string
  due_at: string
  completed_at: string | null
  completed_by: number | null
  created_by: number
  created_at: string
}

interface StageHistoryRow {
  id: number
  organization_id: number
  lead_id: number
  from_stage_id: number | null
  to_stage_id: number
  activity_id: number | null
  reason: string | null
  changed_by: number
  changed_at: string
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    sourceId: row.source_id,
    currentStageId: row.current_stage_id,
    ownerUserId: row.owner_user_id,
    customerId: row.customer_id,
    planInterest: row.plan_interest,
    goal: row.goal,
    notes: row.notes,
    lostReasonId: row.lost_reason_id,
    lostAt: row.lost_at,
    lostBy: row.lost_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapStage(row: LeadStageRow): LeadStage {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isInitial: row.is_initial,
    isWon: row.is_won,
    isLost: row.is_lost,
    active: row.active
  }
}

function mapActivity(row: ActivityRow): LeadActivity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    typeId: row.type_id,
    note: row.note,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapFollowup(row: FollowupRow): LeadFollowup {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    title: row.title,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapStageHistory(row: StageHistoryRow): LeadStageHistoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    fromStageId: row.from_stage_id,
    toStageId: row.to_stage_id,
    activityId: row.activity_id,
    reason: row.reason,
    changedBy: row.changed_by,
    changedAt: row.changed_at
  }
}

export const personRepo = {
  /** Identity key: (organization, normalized phone). Returns null when unknown. */
  findByPhone(organizationId: number, phone: string): Person | null {
    const row = getDrizzle()
      .select()
      .from(people)
      .where(and(eq(people.organization_id, organizationId), eq(people.phone, phone)))
      .get() as PersonRow | undefined
    return row ? mapPerson(row) : null
  },

  findById(organizationId: number, id: number): Person | null {
    const row = getDrizzle()
      .select()
      .from(people)
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .get() as PersonRow | undefined
    return row ? mapPerson(row) : null
  },

  /** Basic name/phone search over the org's people, newest first. */
  search(
    organizationId: number,
    query: string,
    limit: number,
    offset: number
  ): { id: number; fullName: string; phone: string; email: string | null }[] {
    const term = `%${query}%`
    return getDrizzle()
      .select({
        id: people.id,
        fullName: people.full_name,
        phone: people.phone,
        email: people.email
      })
      .from(people)
      .where(
        and(
          eq(people.organization_id, organizationId),
          or(like(people.full_name, term), like(people.phone, term))
        )
      )
      .orderBy(people.created_at)
      .limit(limit)
      .offset(offset)
      .all()
  },

  create(input: {
    organizationId: number
    fullName: string
    phone: string
    email: string | null
  }): Person {
    const row = getDrizzle()
      .insert(people)
      .values({
        organization_id: input.organizationId,
        full_name: input.fullName,
        phone: input.phone,
        email: input.email
      })
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  }
}

export const sourceRepo = {
  findById(organizationId: number, id: number): LeadStage | null {
    const row = getDrizzle()
      .select({
        id: leadSources.id,
        organization_id: leadSources.organization_id,
        name: leadSources.name,
        sort_order: leadSources.sort_order,
        active: leadSources.active,
        is_initial: sql`0`.as('is_initial'),
        is_won: sql`0`.as('is_won'),
        is_lost: sql`0`.as('is_lost'),
        created_at: leadSources.created_at
      })
      .from(leadSources)
      .where(and(eq(leadSources.organization_id, organizationId), eq(leadSources.id, id)))
      .get() as LeadStageRow | undefined
    return row ? mapStage(row) : null
  }
}

export const lostReasonRepo = {
  findById(organizationId: number, id: number): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadLostReasons.id, name: leadLostReasons.name })
      .from(leadLostReasons)
      .where(and(eq(leadLostReasons.organization_id, organizationId), eq(leadLostReasons.id, id)))
      .get()
    return row ?? null
  },

  findAll(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({
        id: leadLostReasons.id,
        name: leadLostReasons.name,
        active: leadLostReasons.active
      })
      .from(leadLostReasons)
      .where(eq(leadLostReasons.organization_id, organizationId))
      .orderBy(leadLostReasons.sort_order)
      .all()
  }
}

export const activityTypeRepo = {
  findById(organizationId: number, id: number): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadActivityTypes.id, name: leadActivityTypes.name })
      .from(leadActivityTypes)
      .where(
        and(eq(leadActivityTypes.organization_id, organizationId), eq(leadActivityTypes.id, id))
      )
      .get()
    return row ?? null
  },

  findByName(organizationId: number, name: string): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadActivityTypes.id, name: leadActivityTypes.name })
      .from(leadActivityTypes)
      .where(
        and(eq(leadActivityTypes.organization_id, organizationId), eq(leadActivityTypes.name, name))
      )
      .get()
    return row ?? null
  },

  findAll(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({
        id: leadActivityTypes.id,
        name: leadActivityTypes.name,
        active: leadActivityTypes.active
      })
      .from(leadActivityTypes)
      .where(eq(leadActivityTypes.organization_id, organizationId))
      .orderBy(leadActivityTypes.name)
      .all()
  }
}

export const stageRepo = {
  findAll(organizationId: number): LeadStage[] {
    const rows = getDrizzle()
      .select()
      .from(leadStages)
      .where(eq(leadStages.organization_id, organizationId))
      .orderBy(leadStages.sort_order)
      .all() as unknown as LeadStageRow[]
    return rows.map(mapStage)
  },

  findById(organizationId: number, id: number): LeadStage | null {
    const row = getDrizzle()
      .select()
      .from(leadStages)
      .where(and(eq(leadStages.organization_id, organizationId), eq(leadStages.id, id)))
      .get() as LeadStageRow | undefined
    return row ? mapStage(row) : null
  },

  /** Sources list for the create form — id/name/active only. */
  findAllSources(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({ id: leadSources.id, name: leadSources.name, active: leadSources.active })
      .from(leadSources)
      .where(eq(leadSources.organization_id, organizationId))
      .orderBy(leadSources.sort_order)
      .all()
  }
}

export const leadRepo = {
  getById(organizationId: number, id: number): Lead | null {
    const row = getDrizzle()
      .select()
      .from(leads)
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .get() as LeadRow | undefined
    return row ? mapLead(row) : null
  },

  /**
   * The lead currently open for a person. "Active" means its current stage is not
   * terminal (is_won/is_lost). Enforces the v1 "one active lead per person" rule.
   */
  findActiveByPersonId(organizationId: number, personId: number): Lead | null {
    const row = getDrizzle()
      .select({ l: leads })
      .from(leads)
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(
        and(
          eq(leads.organization_id, organizationId),
          eq(leads.person_id, personId),
          eq(leadStages.is_won, false),
          eq(leadStages.is_lost, false)
        )
      )
      .limit(1)
      .get()
    if (!row) return null
    const leadRow = row.l as unknown as LeadRow
    return mapLead(leadRow)
  },

  create(input: {
    organizationId: number
    personId: number
    sourceId: number
    currentStageId: number
    ownerUserId: number | null
    createdBy: number
    planInterest?: string | null
    goal?: string | null
    notes?: string | null
  }): Lead {
    const row = getDrizzle()
      .insert(leads)
      .values({
        organization_id: input.organizationId,
        person_id: input.personId,
        source_id: input.sourceId,
        current_stage_id: input.currentStageId,
        owner_user_id: input.ownerUserId,
        created_by: input.createdBy,
        plan_interest: input.planInterest ?? null,
        goal: input.goal ?? null,
        notes: input.notes ?? null
      })
      .returning()
      .get()
    return mapLead(row as unknown as LeadRow)
  },

  updateCurrentStage(organizationId: number, id: number, stageId: number): void {
    getDrizzle()
      .update(leads)
      .set({ current_stage_id: stageId, updated_at: sql`(datetime('now'))` })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  updateOwner(organizationId: number, id: number, ownerUserId: number): void {
    getDrizzle()
      .update(leads)
      .set({ owner_user_id: ownerUserId, updated_at: sql`(datetime('now'))` })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  markLost(input: {
    organizationId: number
    id: number
    stageId: number
    reasonId: number
    lostBy: number
  }): void {
    getDrizzle()
      .update(leads)
      .set({
        current_stage_id: input.stageId,
        lost_reason_id: input.reasonId,
        lost_at: sql`(datetime('now'))`,
        lost_by: input.lostBy,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(leads.organization_id, input.organizationId), eq(leads.id, input.id)))
      .run()
  },

  /** Leans in an `is_initial` stage — the dashboard "New Leads" card. */
  listNew(organizationId: number): { id: number; personName: string; phone: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        phone: people.phone
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_initial, true)))
      .orderBy(leads.created_at)
      .all()
  },

  /**
   * `leads:list` base rows — leads joined with person/stage/source/owner/lost
   * reason plus a filtered `COUNT(*)`. Nested arrays (activities, follow-ups,
   * stage history) are batched separately in the application layer so the list
   * stays O(1) round-trips per entity set. Filters map to indexed columns; the
   * `range` cutoff is resolved to `createdAfter` (org timezone) by the app layer.
   */
  list(input: {
    organizationId: number
    search?: string
    stageId?: number
    sourceId?: number
    ownerUserId?: number
    createdAfter?: string
    page: number
    limit: number
  }): {
    items: Array<{
      id: number
      personId: number
      personName: string
      phone: string
      email: string | null
      sourceId: number
      sourceName: string
      stageId: number
      stageName: string
      isWon: boolean
      isLost: boolean
      ownerUserId: number | null
      ownerName: string | null
      planInterest: string | null
      goal: string | null
      notes: string | null
      createdAt: string
      lostReasonId: number | null
      lostReasonName: string | null
      lostAt: string | null
    }>
    total: number
  } {
    const { organizationId, search, stageId, sourceId, ownerUserId, createdAfter } = input
    const where = and(
      eq(leads.organization_id, organizationId),
      ...(stageId !== undefined ? [eq(leads.current_stage_id, stageId)] : []),
      ...(sourceId !== undefined ? [eq(leads.source_id, sourceId)] : []),
      ...(ownerUserId !== undefined ? [eq(leads.owner_user_id, ownerUserId)] : []),
      ...(createdAfter !== undefined ? [gte(leads.created_at, createdAfter)] : []),
      ...(search ? [or(like(people.full_name, `%${search}%`), like(people.phone, `%${search}%`))] : [])
    )

    const base = getDrizzle()
      .select({
        id: leads.id,
        personId: leads.person_id,
        personName: people.full_name,
        phone: people.phone,
        email: people.email,
        sourceId: leads.source_id,
        sourceName: leadSources.name,
        stageId: leads.current_stage_id,
        stageName: leadStages.name,
        isWon: leadStages.is_won,
        isLost: leadStages.is_lost,
        ownerUserId: leads.owner_user_id,
        ownerName: users.full_name,
        planInterest: leads.plan_interest,
        goal: leads.goal,
        notes: leads.notes,
        createdAt: leads.created_at,
        lostReasonId: leads.lost_reason_id,
        lostReasonName: leadLostReasons.name,
        lostAt: leads.lost_at
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadSources, eq(leadSources.id, leads.source_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .leftJoin(users, eq(users.id, leads.owner_user_id))
      .leftJoin(leadLostReasons, eq(leadLostReasons.id, leads.lost_reason_id))
      .where(where)
      .orderBy(desc(leads.created_at))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit)
      .all()

    const totalRow = getDrizzle()
      .select({ value: count() })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .where(where)
      .get()

    return { items: base, total: totalRow?.value ?? 0 }
  },

  /** In an `is_initial` stage AND zero activities — "Uncontacted Leads" (D4). */
  listUncontacted(organizationId: number): { id: number; personName: string; phone: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        phone: people.phone
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .leftJoin(leadActivities, eq(leadActivities.lead_id, leads.id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_initial, true)))
      .groupBy(leads.id)
      .having(isNull(leadActivities.id))
      .orderBy(leads.created_at)
      .all()
  },

  /** Per-stage counts for the funnel (status derived from flags, D3). */
  getFunnelCounts(organizationId: number): {
    stageId: number
    stageName: string
    isWon: boolean
    isLost: boolean
    count: number
  }[] {
    return getDrizzle()
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
  },

  /** Leads currently in an `is_won` stage, newest activity first. */
  listRecentlyWon(organizationId: number, limit = 10): { id: number; personName: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_won, true)))
      .orderBy(leads.updated_at)
      .limit(limit)
      .all()
  },

  /** Leads currently in an `is_lost` stage, most recently lost first. */
  listRecentlyLost(organizationId: number, limit = 10): { id: number; personName: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_lost, true)))
      .orderBy(leads.updated_at)
      .limit(limit)
      .all()
  },

  /**
   * TRIAL-stage leads with a due, uncompleted follow-up — the "Trials Ending"
   * card (D18). Matches the seeded TRIAL stage by name as a pragmatic heuristic
   * (degrades to empty when the gym renames TRIAL).
   */
  listTrialsEnding(
    organizationId: number,
    withinHours = 48
  ): { id: number; personName: string; dueAt: string }[] {
    const deadline = new Date(Date.now() + withinHours * 3_600_000).toISOString()
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        dueAt: leadFollowups.due_at
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .innerJoin(leadFollowups, eq(leadFollowups.lead_id, leads.id))
      .where(
        and(
          eq(leads.organization_id, organizationId),
          eq(leadStages.name, 'TRIAL'),
          eq(leadStages.active, true),
          isNull(leadFollowups.completed_at),
          lte(leadFollowups.due_at, deadline)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all()
  }
}

export const activityRepo = {
  create(input: {
    organizationId: number
    leadId: number
    typeId: number
    note: string | null
    occurredAt: string
    createdBy: number
  }): LeadActivity {
    const row = getDrizzle()
      .insert(leadActivities)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        type_id: input.typeId,
        note: input.note,
        occurred_at: input.occurredAt,
        created_by: input.createdBy
      })
      .returning()
      .get()
    return mapActivity(row as unknown as ActivityRow)
  },

  /** Org-scoped: the activity must belong to the org (guards cross-org ids). */
  getById(organizationId: number, id: number): LeadActivity | null {
    const row = getDrizzle()
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.organization_id, organizationId), eq(leadActivities.id, id)))
      .get() as ActivityRow | undefined
    return row ? mapActivity(row) : null
  },

  listForLead(organizationId: number, leadId: number): LeadActivity[] {
    const rows = getDrizzle()
      .select()
      .from(leadActivities)
      .where(
        and(eq(leadActivities.organization_id, organizationId), eq(leadActivities.lead_id, leadId))
      )
      .orderBy(leadActivities.occurred_at)
      .all() as unknown as ActivityRow[]
    return rows.map(mapActivity)
  },

  /** Batch read for `leads:list`: one IN query resolves type + actor names. */
  listForLeadIds(organizationId: number, leadIds: number[]): Array<{
    leadId: number
    id: number
    typeId: number
    typeName: string
    note: string | null
    occurredAt: string
    createdByName: string | null
  }> {
    if (leadIds.length === 0) return []
    return getDrizzle()
      .select({
        leadId: leadActivities.lead_id,
        id: leadActivities.id,
        typeId: leadActivities.type_id,
        typeName: leadActivityTypes.name,
        note: leadActivities.note,
        occurredAt: leadActivities.occurred_at,
        createdByName: users.full_name
      })
      .from(leadActivities)
      .innerJoin(leadActivityTypes, eq(leadActivityTypes.id, leadActivities.type_id))
      .leftJoin(users, eq(users.id, leadActivities.created_by))
      .where(
        and(
          eq(leadActivities.organization_id, organizationId),
          inArray(leadActivities.lead_id, leadIds)
        )
      )
      .orderBy(leadActivities.occurred_at)
      .all()
  }
}

export const followupRepo = {
  create(input: {
    organizationId: number
    leadId: number
    title: string
    dueAt: string
    createdBy: number
  }): LeadFollowup {
    const row = getDrizzle()
      .insert(leadFollowups)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        title: input.title,
        due_at: input.dueAt,
        created_by: input.createdBy
      })
      .returning()
      .get()
    return mapFollowup(row as unknown as FollowupRow)
  },

  getById(organizationId: number, id: number): LeadFollowup | null {
    const row = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .get() as FollowupRow | undefined
    return row ? mapFollowup(row) : null
  },

  complete(organizationId: number, id: number, by: number): void {
    getDrizzle()
      .update(leadFollowups)
      .set({ completed_at: sql`(datetime('now'))`, completed_by: by })
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .run()
  },

  /** Open follow-ups due within the given UTC window (boundary precomputed, D5). */
  listDueBetween(organizationId: number, startUtc: string, endUtc: string): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          isNull(leadFollowups.completed_at),
          gte(leadFollowups.due_at, startUtc),
          lt(leadFollowups.due_at, endUtc)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Open follow-ups due strictly before `nowUtc` — overdue. */
  listOverdueBefore(organizationId: number, nowUtc: string): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          isNull(leadFollowups.completed_at),
          lt(leadFollowups.due_at, nowUtc)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  listForLead(organizationId: number, leadId: number): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.lead_id, leadId))
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Batch read for `leads:list`: one IN query returns the follow-up cards. */
  listForLeadIds(organizationId: number, leadIds: number[]): Array<{
    leadId: number
    id: number
    title: string
    dueAt: string
    completedAt: string | null
  }> {
    if (leadIds.length === 0) return []
    return getDrizzle()
      .select({
        leadId: leadFollowups.lead_id,
        id: leadFollowups.id,
        title: leadFollowups.title,
        dueAt: leadFollowups.due_at,
        completedAt: leadFollowups.completed_at
      })
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          inArray(leadFollowups.lead_id, leadIds)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all()
  }
}

export const stageHistoryRepo = {
  record(input: {
    organizationId: number
    leadId: number
    fromStageId: number | null
    toStageId: number
    activityId: number | null
    reason: string | null
    changedBy: number
  }): void {
    getDrizzle()
      .insert(leadStageHistory)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        from_stage_id: input.fromStageId,
        to_stage_id: input.toStageId,
        activity_id: input.activityId,
        reason: input.reason,
        changed_by: input.changedBy
      })
      .run()
  },

  listForLead(organizationId: number, leadId: number): LeadStageHistoryEntry[] {
    const rows = getDrizzle()
      .select()
      .from(leadStageHistory)
      .where(
        and(
          eq(leadStageHistory.organization_id, organizationId),
          eq(leadStageHistory.lead_id, leadId)
        )
      )
      .orderBy(leadStageHistory.changed_at)
      .all() as unknown as StageHistoryRow[]
    return rows.map(mapStageHistory)
  },

  /** Batch read for `leads:list`: one IN query resolves stage names via aliases. */
  listForLeadIds(organizationId: number, leadIds: number[]): Array<{
    leadId: number
    fromStageName: string | null
    toStageName: string
    changedAt: string
  }> {
    if (leadIds.length === 0) return []
    const fromStage = alias(leadStages, 'from_stage')
    const toStage = alias(leadStages, 'to_stage')
    return getDrizzle()
      .select({
        leadId: leadStageHistory.lead_id,
        fromStageName: fromStage.name,
        toStageName: toStage.name,
        changedAt: leadStageHistory.changed_at
      })
      .from(leadStageHistory)
      .leftJoin(fromStage, eq(fromStage.id, leadStageHistory.from_stage_id))
      .innerJoin(toStage, eq(toStage.id, leadStageHistory.to_stage_id))
      .where(
        and(
          eq(leadStageHistory.organization_id, organizationId),
          inArray(leadStageHistory.lead_id, leadIds)
        )
      )
      .orderBy(leadStageHistory.changed_at)
      .all()
  }
}
