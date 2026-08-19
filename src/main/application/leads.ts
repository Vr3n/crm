import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import {
  activityRepo,
  activityTypeRepo,
  followupRepo,
  leadRepo,
  lostReasonRepo,
  personRepo,
  sourceRepo,
  stageHistoryRepo,
  stageRepo
} from '../repositories/sales'
import { organizationRepo, userRepo } from '../repositories/identity'
import { logger } from '../lib/logger'
import { IndianMobileNumber } from '../domain/phone'
import {
  DEFAULT_TIMEZONE,
  LeadStageMachine,
  localDayUtcRange,
  deriveLeadStatus
} from '../domain/lead'
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type {
  AssignLeadInput,
  CompleteFollowUpInput,
  CreateLeadInput,
  CreateLeadSourceInput,
  CreatedLead,
  FunnelCounts,
  LeadIdRequest,
  LeadListRequest,
  LeadListResponse,
  LeadSourceRow,
  LeadSourceSearchRequest,
  LeadTextOptionRow,
  LeadVocabularySearchRequest,
  MarkLeadLostInput,
  MoveLeadStageInput,
  PeopleList,
  RecordedActivity,
  RecordLeadActivityInput,
  ReferenceData,
  ScheduleFollowUpInput
} from '../../shared/contracts/sales'

/**
 * Module 01 application use cases and queries. Each Command gates on a permission,
 * derives the org/user from the session, and owns one `withTransaction` boundary.
 */

const OWNER_CHANGE_TYPE = 'OWNER_CHANGE'

function orgTimezone(organizationId: number): string {
  return organizationRepo.findById(organizationId)?.timezone ?? DEFAULT_TIMEZONE
}

function stageMachineFor(organizationId: number): LeadStageMachine {
  return new LeadStageMachine(stageRepo.findAll(organizationId))
}

/** Creates the person (if unknown) and a lead at the initial stage, atomically. */
export function createLead(input: CreateLeadInput): CreatedLead {
  requirePermission(PERMISSIONS.LEAD_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const phone = IndianMobileNumber.parse(input.phone)
  const machine = stageMachineFor(organizationId)
  const initialStage = machine.initialStage()

  if (!sourceRepo.findById(organizationId, input.sourceId)) {
    throw new NotFoundError('Lead source not found')
  }

  return withTransaction(() => {
    let person = personRepo.findByPhone(organizationId, phone.value)
    if (!person) {
      person = personRepo.create({
        organizationId,
        fullName: input.fullName.trim(),
        phone: phone.value,
        email: input.email?.trim().toLowerCase() || null
      })
    }

    if (leadRepo.findActiveByPersonId(organizationId, person.id)) {
      throw new ConflictError('This person already has an active lead')
    }

    const lead = leadRepo.create({
      organizationId,
      personId: person.id,
      sourceId: input.sourceId,
      currentStageId: initialStage.id,
      ownerUserId: userId,
      createdBy: userId,
      planInterest: input.planInterest?.trim() || null,
      goal: input.goal?.trim() || null,
      notes: input.notes?.trim() || null
    })

    stageHistoryRepo.record({
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

/**
 * Moves a lead to any active non-terminal stage, guarded by the stage machine.
 * The caller must pass the stage it believes the lead is on (`expectedStageId`);
 * a mismatch means a concurrent change happened (D17).
 */
export function moveLeadStage(input: MoveLeadStageInput): void {
  requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = stageMachineFor(organizationId)
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  const current = stageRepo.findById(organizationId, lead.currentStageId)
  const target = stageRepo.findById(organizationId, input.targetStageId)
  if (!current) throw new NotFoundError('Current stage not found')
  if (!target) throw new NotFoundError('Target stage not found')

  if (lead.currentStageId !== input.expectedStageId) {
    throw new ConflictError('Lead changed concurrently; refresh and retry')
  }

  const activity = activityRepo.getById(organizationId, input.activityId)
  if (!activity || activity.leadId !== lead.id) {
    throw new NotFoundError('Activity not found for this lead')
  }

  machine.assertMoveAllowed(current, target, true)

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

/** Records an activity on a lead. Never mutates the stage (D10). */
export function recordLeadActivity(input: RecordLeadActivityInput): RecordedActivity {
  requirePermission(PERMISSIONS.LEAD_RECORD_ACTIVITY)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  const type = activityTypeRepo.findById(organizationId, input.typeId)
  if (!type) throw new NotFoundError('Activity type not found')

  const activity = activityRepo.create({
    organizationId,
    leadId: lead.id,
    typeId: type.id,
    note: input.note?.trim() || null,
    occurredAt: input.occurredAt,
    createdBy: userId
  })
  return { activityId: activity.id }
}

/** Reassigns the owner, recording an OWNER_CHANGE activity (D15). */
export function assignLead(input: AssignLeadInput): void {
  requirePermission(PERMISSIONS.LEAD_ASSIGN)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  if (lead.ownerUserId === input.ownerUserId) return

  const target = userRepo.findById(input.ownerUserId)
  if (!target) throw new NotFoundError('Owner user not found')

  const ownerChangeType = activityTypeRepo.findByName(organizationId, OWNER_CHANGE_TYPE)
  if (!ownerChangeType) throw new NotFoundError('OWNER_CHANGE activity type is not configured')

  withTransaction(() => {
    leadRepo.updateOwner(organizationId, lead.id, input.ownerUserId)
    activityRepo.create({
      organizationId,
      leadId: lead.id,
      typeId: ownerChangeType.id,
      note: `Ownership changed from user ${lead.ownerUserId ?? 'none'} to ${input.ownerUserId}`,
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
  })
}

/** Marks a lead lost with a mandatory reason (D8). Terminal; no further moves. */
export function markLeadLost(input: MarkLeadLostInput): void {
  requirePermission(PERMISSIONS.LEAD_MARK_LOST)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = stageMachineFor(organizationId)
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  const current = stageRepo.findById(organizationId, lead.currentStageId)
  if (!current) throw new NotFoundError('Current stage not found')

  const reason = lostReasonRepo.findById(organizationId, input.lostReasonId)
  if (!reason) throw new NotFoundError('Lost reason not found')

  machine.assertCanMarkLost(current)
  const lostStage = machine.terminalStage('isLost')

  withTransaction(() => {
    leadRepo.markLost({
      organizationId,
      id: lead.id,
      stageId: lostStage.id,
      reasonId: reason.id,
      lostBy: userId
    })
    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: current.id,
      toStageId: lostStage.id,
      activityId: null,
      reason: reason.name,
      changedBy: userId
    })
  })
}

/** Schedules a follow-up. The due date must be in the future. */
export function scheduleFollowUp(input: ScheduleFollowUpInput): { followupId: number } {
  requirePermission(PERMISSIONS.FOLLOWUP_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw new ValidationError('dueAt must be a valid date')
  if (due.getTime() <= Date.now()) {
    throw new ValidationError('Follow-up due date must be in the future')
  }

  const followup = withTransaction(() =>
    followupRepo.create({
      organizationId,
      leadId: lead.id,
      title: input.title.trim(),
      dueAt: due.toISOString(),
      createdBy: userId
    })
  )
  return { followupId: followup.id }
}

/** Completes a follow-up. Idempotent: completing an already-done one is a no-op. */
export function completeFollowUp(input: CompleteFollowUpInput): void {
  requirePermission(PERMISSIONS.FOLLOWUP_COMPLETE)
  const organizationId = currentOrganizationId()

  const followup = followupRepo.getById(organizationId, input.followupId)
  if (!followup) throw new NotFoundError('Follow-up not found')
  if (followup.completedAt) return

  withTransaction(() => {
    followupRepo.complete(organizationId, followup.id, requireSession().userId)
  })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const RANGE_DAYS: Record<NonNullable<LeadListRequest['range']>, number> = {
  today: 0,
  week: 7,
  month: 30,
  all: 0
}

/**
 * `leads:list` — the pipeline read model. Filters are optional and map to
 * indexed columns; the nested arrays (activities, follow-ups, stage history)
 * are fetched in three batched IN queries keyed by lead id, so the whole list
 * is assembled in four SQL round-trips regardless of page size.
 */
export function listLeads(input: LeadListRequest): LeadListResponse {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  let createdAfter: string | undefined
  if (input.range && input.range !== 'all') {
    const days = RANGE_DAYS[input.range]
    const start = days === 0 ? new Date() : new Date(Date.now() - days * 86_400_000)
    createdAfter = localDayUtcRange(orgTimezone(organizationId), start).start
  }

  const { items: base, total } = leadRepo.list({
    organizationId,
    search: input.search?.trim() || undefined,
    stageId: input.stageId,
    sourceId: input.sourceId,
    ownerUserId: input.ownerUserId,
    createdAfter,
    page: input.page,
    limit: input.limit
  })

  const leadIds = base.map((r) => r.id)
  const activities = activityRepo.listForLeadIds(organizationId, leadIds)
  const followUps = followupRepo.listForLeadIds(organizationId, leadIds)
  const history = stageHistoryRepo.listForLeadIds(organizationId, leadIds)

  const activitiesByLead = groupBy(activities, (a) => a.leadId)
  const followUpsByLead = groupBy(followUps, (f) => f.leadId)
  const historyByLead = groupBy(history, (h) => h.leadId)

  const items = base.map((row) => ({
    id: row.id,
    personId: row.personId,
    personName: row.personName,
    phone: row.phone,
    email: row.email,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    stageId: row.stageId,
    stageName: row.stageName,
    isWon: row.isWon,
    isLost: row.isLost,
    ownerUserId: row.ownerUserId,
    ownerName: row.ownerName,
    planInterest: row.planInterest,
    goal: row.goal,
    notes: row.notes,
    createdAt: row.createdAt,
    lostReasonId: row.lostReasonId,
    lostReasonName: row.lostReasonName,
    lostAt: row.lostAt,
    activities: activitiesByLead.get(row.id) ?? [],
    followUps: followUpsByLead.get(row.id) ?? [],
    stageHistory: historyByLead.get(row.id) ?? []
  }))

  return {
    items,
    page: input.page,
    limit: input.limit,
    total,
    hasMore: input.page * input.limit < total
  }
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

export function getLeadDetails(input: LeadIdRequest): {
  leadId: number
  personName: string
  phone: string
  email: string | null
  sourceName: string
  stageName: string
  status: 'OPEN' | 'WON' | 'LOST'
  ownerName: string | null
  createdAt: string
} | null {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) return null
  const person = personRepo.findById(organizationId, lead.personId)
  const source = sourceRepo.findById(organizationId, lead.sourceId)
  const stage = stageRepo.findById(organizationId, lead.currentStageId)
  if (!person || !source || !stage) return null

  const owner = lead.ownerUserId ? userRepo.findById(lead.ownerUserId) : null

  return {
    leadId: lead.id,
    personName: person.fullName,
    phone: person.phone,
    email: person.email,
    sourceName: source.name,
    stageName: stage.name,
    status: deriveLeadStatus(stage),
    ownerName: owner?.fullName ?? null,
    createdAt: lead.createdAt
  }
}

/** The §24 timeline: merged activities + stage history + follow-ups, newest first. */
export function getLeadTimeline(input: LeadIdRequest): Array<{
  kind: 'activity' | 'stage' | 'followup'
  at: string
  label: string
}> {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) return []

  const stages = new Map(stageRepo.findAll(organizationId).map((s) => [s.id, s]))
  const types = new Map(activityTypeRepo.findAll(organizationId).map((t) => [t.id, t.name]))

  const entries: Array<{ kind: 'activity' | 'stage' | 'followup'; at: string; label: string }> = []

  for (const a of activityRepo.listForLead(organizationId, lead.id)) {
    entries.push({
      kind: 'activity',
      at: a.occurredAt,
      label: types.get(a.typeId) ?? 'Activity'
    })
  }
  for (const h of stageHistoryRepo.listForLead(organizationId, lead.id)) {
    const from = h.fromStageId ? stages.get(h.fromStageId)?.name : 'New'
    const to = stages.get(h.toStageId)?.name ?? '?'
    entries.push({ kind: 'stage', at: h.changedAt, label: `Stage: ${from} → ${to}` })
  }
  for (const f of followupRepo.listForLead(organizationId, lead.id)) {
    entries.push({
      kind: 'followup',
      at: f.completedAt ?? f.dueAt,
      label: `Follow-up: ${f.title}${f.completedAt ? ' (done)' : ''}`
    })
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

export function getNewLeads(): { id: number; personName: string; phone: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listNew(currentOrganizationId())
}

export function getUncontactedLeads(): { id: number; personName: string; phone: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listUncontacted(currentOrganizationId())
}

export function getFunnelCounts(): FunnelCounts {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.getFunnelCounts(currentOrganizationId())
}

export function getTodaysFollowups(): {
  followupId: number
  leadId: number
  title: string
  dueAt: string
}[] {
  requirePermission(PERMISSIONS.FOLLOWUP_VIEW)
  const organizationId = currentOrganizationId()
  const { start, end } = localDayUtcRange(orgTimezone(organizationId), new Date())
  return followupRepo
    .listDueBetween(organizationId, start, end)
    .map((f) => ({ followupId: f.id, leadId: f.leadId, title: f.title, dueAt: f.dueAt }))
}

export function getOverdueFollowups(): {
  followupId: number
  leadId: number
  title: string
  dueAt: string
}[] {
  requirePermission(PERMISSIONS.FOLLOWUP_VIEW)
  const organizationId = currentOrganizationId()
  return followupRepo
    .listOverdueBefore(organizationId, new Date().toISOString())
    .map((f) => ({ followupId: f.id, leadId: f.leadId, title: f.title, dueAt: f.dueAt }))
}

export function getTrialsEnding(): { id: number; personName: string; dueAt: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listTrialsEnding(currentOrganizationId())
}

export function getRecentlyWon(): { id: number; personName: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listRecentlyWon(currentOrganizationId())
}

export function getRecentlyLost(): { id: number; personName: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listRecentlyLost(currentOrganizationId())
}

export function searchPeople(query: string): PeopleList {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return personRepo.search(organizationId, query.trim(), 50, 0)
}

export function getReferenceData(): ReferenceData {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return {
    sources: stageRepo.findAllSources(organizationId),
    stages: stageRepo.findAll(organizationId),
    lostReasons: lostReasonRepo.findAll(organizationId),
    activityTypes: activityTypeRepo.findAll(organizationId)
  }
}

/** Live source search for the combobox — active sources, ordered by sort order. */
export function searchLeadSources(input: LeadSourceSearchRequest): LeadSourceRow[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return sourceRepo.search(organizationId, input.query.trim(), 20)
}

/**
 * Creates a lead source. Settings scoped so only admins can grow the vocabulary;
 * the duplicate check is case-insensitive even though the schema constraint is
 * case-sensitive, so "instagram" and "Instagram" can't both be created.
 */
export function createLeadSource(input: CreateLeadSourceInput): LeadSourceRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const name = input.name.trim()
  if (!name) throw new ValidationError('Source name is required')
  if (sourceRepo.findByName(organizationId, name)) {
    throw new ConflictError(`A source named "${name}" already exists`)
  }
  return withTransaction(() => sourceRepo.create(organizationId, name))
}

const LEAD_VOCABULARY_LIMIT = 20

/**
 * Plan-interest / goal autocomplete. The vocabulary is data-driven: distinct
 * free-text values already used on this org's leads (no lookup table), so
 * "creating" an option is simply committing the typed text — the value itself
 * is the identity (`id === label`). Trimmed and de-duplicated case-insensitively.
 */
function searchLeadVocabulary(
  input: LeadVocabularySearchRequest,
  field: string,
  values: (organizationId: number, query: string, limit: number) => string[]
): LeadTextOptionRow[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  const query = input.query.trim()
  const seen = new Set<string>()
  const options: LeadTextOptionRow[] = []
  for (const raw of values(organizationId, query, LEAD_VOCABULARY_LIMIT)) {
    const value = raw.trim()
    const key = value.toLocaleLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    options.push({ id: value, label: value })
    if (options.length >= LEAD_VOCABULARY_LIMIT) break
  }
  logger.info(`vocab search "${field}"`, { organizationId, query, count: options.length })
  return options
}

export function searchLeadPlanInterests(input: LeadVocabularySearchRequest): LeadTextOptionRow[] {
  return searchLeadVocabulary(
    input,
    'plan_interest',
    (organizationId, query, limit) => leadRepo.distinctPlanInterests(organizationId, query, limit)
  )
}

export function searchLeadGoals(input: LeadVocabularySearchRequest): LeadTextOptionRow[] {
  return searchLeadVocabulary(
    input,
    'goal',
    (organizationId, query, limit) => leadRepo.distinctGoals(organizationId, query, limit)
  )
}
