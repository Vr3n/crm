import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  assignLead,
  completeFollowUp,
  createLead,
  getFunnelCounts,
  getLeadDetails,
  getLeadTimeline,
  getNewLeads,
  getUncontactedLeads,
  getReferenceData,
  listLeads,
  markLeadLost,
  moveLeadStage,
  recordLeadActivity,
  scheduleFollowUp
} from '../../../src/main/application/leads'
import { activityRepo, leadRepo } from '../../../src/main/repositories/sales'
import { userRepo, staffRepo } from '../../../src/main/repositories/identity'
import { getDb } from '../../../src/main/db/connection'
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError
} from '../../../src/main/domain/errors'

setupSalesDb()

function createSourceId(organizationId: number): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_sources WHERE organization_id = ? ORDER BY sort_order LIMIT 1')
    .get(organizationId) as { id: number }
  return row.id
}

function stageIdByName(organizationId: number, name: string): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_stages WHERE organization_id = ? AND name = ?')
    .get(organizationId, name) as { id: number }
  return row.id
}

function activityTypeId(organizationId: number, name: string): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_activity_types WHERE organization_id = ? AND name = ?')
    .get(organizationId, name) as { id: number }
  return row.id
}

/** Creates a lead, returning its id and phone. Each call uses a distinct phone. */
let leadCounter = 0
function createLeadFor(organizationId: number): { leadId: number; phone: string } {
  const sourceId = createSourceId(organizationId)
  const phone = `9${String(100000000 + ++leadCounter)}`
  const { leadId } = createLead({
    fullName: 'Rahul Sharma',
    phone,
    sourceId
  })
  return { leadId, phone }
}

describe('createLead', () => {
  it('creates a person + lead at the initial stage in one transaction', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const { leadId, personId } = createLead({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      sourceId
    })

    const person = getDb()
      .prepare('SELECT full_name, phone FROM people WHERE id = ?')
      .get(personId) as { full_name: string; phone: string }
    expect(person).toEqual({ full_name: 'Rahul Sharma', phone: '9876543210' })

    const lead = getDb()
      .prepare(
        `SELECT person_id, current_stage_id, owner_user_id, created_by
         FROM leads WHERE id = ?`
      )
      .get(leadId) as {
      person_id: number
      current_stage_id: number
      owner_user_id: number
      created_by: number
    }
    expect(lead.person_id).toBe(personId)
    expect(lead.current_stage_id).toBe(stageIdByName(organizationId, 'NEW'))
    expect(lead.owner_user_id).toBe(userId) // default owner = creator
    expect(lead.created_by).toBe(userId)

    // Initial history row: from = NULL, activity = NULL
    const history = getDb()
      .prepare(
        `SELECT from_stage_id, to_stage_id, activity_id, reason
         FROM lead_stage_history WHERE lead_id = ?`
      )
      .all(leadId) as {
      from_stage_id: number | null
      to_stage_id: number
      activity_id: number | null
      reason: string | null
    }[]
    expect(history).toHaveLength(1)
    expect(history[0]).toEqual({
      from_stage_id: null,
      to_stage_id: lead.current_stage_id,
      activity_id: null,
      reason: null
    })
  })

  it('persists plan interest, goal, and notes', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const { leadId } = createLead({
      fullName: 'Sana Kapoor',
      phone: '9876543210',
      sourceId,
      planInterest: 'Annual Premium',
      goal: 'Weight loss',
      notes: 'Asked about pool access'
    })

    const lead = getDb()
      .prepare('SELECT plan_interest, goal, notes FROM leads WHERE id = ?')
      .get(leadId) as { plan_interest: string | null; goal: string | null; notes: string | null }
    expect(lead).toEqual({
      plan_interest: 'Annual Premium',
      goal: 'Weight loss',
      notes: 'Asked about pool access'
    })
  })

  it('stores blank optional fields as NULL', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const { leadId } = createLead({
      fullName: 'Sana Kapoor',
      phone: '9876543210',
      sourceId,
      planInterest: '  ',
      goal: '',
      notes: undefined
    })

    const lead = getDb()
      .prepare('SELECT plan_interest, goal, notes FROM leads WHERE id = ?')
      .get(leadId) as { plan_interest: string | null; goal: string | null; notes: string | null }
    expect(lead).toEqual({ plan_interest: null, goal: null, notes: null })
  })

  it('reuses an existing person once the previous lead is terminal (lost)', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const first = createLead({ fullName: 'Rahul Sharma', phone: '9876543210', sourceId })
    const reasonId = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId: first.leadId, lostReasonId: reasonId.id })

    const second = createLead({ fullName: 'Rahul S.', phone: '+91 9876543210', sourceId })

    const personCount = (getDb().prepare('SELECT COUNT(*) AS n FROM people').get() as { n: number })
      .n
    expect(personCount).toBe(1) // person reused, not duplicated
    expect(second.personId).toBe(first.personId)
  })

  it('rejects a second active lead for the same person', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })
    expect(() => createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })).toThrow(
      ConflictError
    )
  })

  it('allows a new lead once the previous one is terminal (lost)', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const { leadId } = createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })
    const reasonId = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reasonId.id })

    expect(() => createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })).not.toThrow()
  })

  it('rejects an unknown source', () => {
    seedOrgWithSession()
    expect(() => createLead({ fullName: 'R', phone: '9876543210', sourceId: 99999 })).toThrow(
      NotFoundError
    )
  })

  it('rejects an invalid phone number', () => {
    seedOrgWithSession()
    expect(() => createLead({ fullName: 'R', phone: '12345', sourceId: 1 })).toThrow(
      ValidationError
    )
  })

  it('throws PERMISSION_DENIED without lead.create', () => {
    const { organizationId } = seedOrgWithSession('Finance')
    const sourceId = createSourceId(organizationId)
    expect(() => createLead({ fullName: 'R', phone: '9876543210', sourceId })).toThrow(
      ForbiddenError
    )
  })
})

describe('moveLeadStage', () => {
  it('moves to any intermediate stage with an activity', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const phoneType = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId: phoneType,
      note: 'Called Rahul',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })

    const target = stageIdByName(organizationId, 'CONTACTED')
    const initial = stageIdByName(organizationId, 'NEW')
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: target,
        expectedStageId: initial,
        activityId: activity.id
      })
    ).not.toThrow()

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(target)
  })

  it('rejects a move without an activity (or with a foreign activity)', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const target = stageIdByName(organizationId, 'CONTACTED')
    const initial = stageIdByName(organizationId, 'NEW')
    const { leadId: foreignLeadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const foreignActivity = activityRepo.create({
      organizationId,
      leadId: foreignLeadId,
      typeId,
      note: 'Other lead activity',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })

    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: target,
        expectedStageId: initial,
        activityId: foreignActivity.id
      })
    ).toThrow(NotFoundError)
  })

  it('rejects a move into a WON stage', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: stageIdByName(organizationId, 'WON'),
        expectedStageId: stageIdByName(organizationId, 'NEW'),
        activityId: activity.id
      })
    ).toThrow(InvalidStateTransitionError)
  })

  it('rejects a stale optimistic concurrency token', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: 99999, // stale on purpose
        activityId: activity.id
      })
    ).toThrow(ConflictError)
  })
})

describe('markLeadLost', () => {
  it('marks the lead lost with reason and writes history', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id, name FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number; name: string }

    markLeadLost({ leadId, lostReasonId: reason.id })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'LOST'))
    expect(lead.lostReasonId).toBe(reason.id)
    expect(lead.lostAt).not.toBeNull()
    expect(lead.lostBy).not.toBeNull()

    const history = getDb()
      .prepare(
        'SELECT from_stage_id, to_stage_id, activity_id, reason FROM lead_stage_history WHERE lead_id = ?'
      )
      .all(leadId) as { reason: string | null }[]
    expect(history[history.length - 1].reason).toBe(reason.name)
  })

  it('rejects a reason from another org', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() => markLeadLost({ leadId, lostReasonId: 99999 })).toThrow(NotFoundError)
  })

  it('rejects marking an already-lost lead lost again', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reason.id })
    expect(() => markLeadLost({ leadId, lostReasonId: reason.id })).toThrow(
      InvalidStateTransitionError
    )
  })
})

describe('recordLeadActivity', () => {
  it('records an activity without touching the stage', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'WALK_IN')

    recordLeadActivity({
      leadId,
      typeId,
      note: 'Talked about annual plan',
      occurredAt: new Date().toISOString()
    })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'NEW')) // unchanged
    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      typeId,
      note: 'Talked about annual plan',
      createdBy: userId
    })
  })
})

describe('assignLead', () => {
  it('writes an OWNER_CHANGE activity on reassignment', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)

    const other = userRepo.create({
      fullName: 'Sana',
      email: 'sana@fitgym.com',
      passwordHash: 'h'
    })
    const role = getDb()
      .prepare('SELECT id FROM roles WHERE organization_id = ? AND name = ?')
      .get(organizationId, 'Sales') as { id: number }
    staffRepo.create({ organizationId, userId: other.id, roleId: role.id })

    assignLead({ leadId, ownerUserId: other.id })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.ownerUserId).toBe(other.id)
    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0].typeId).toBe(activityTypeId(organizationId, 'OWNER_CHANGE'))
  })

  it('is a no-op when assigning the same owner', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() => assignLead({ leadId, ownerUserId: userId })).not.toThrow()
    expect(activityRepo.listForLead(organizationId, leadId)).toHaveLength(0)
  })
})

describe('follow-ups', () => {
  it('schedules and idempotently completes a follow-up', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()

    const { followupId } = scheduleFollowUp({ leadId, title: 'Call Rahul', dueAt: future })
    completeFollowUp({ followupId })
    expect(() => completeFollowUp({ followupId })).not.toThrow() // idempotent

    const followup = getDb()
      .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
      .get(followupId) as { completed_at: string | null }
    expect(followup.completed_at).not.toBeNull()
  })

  it('rejects a due date in the past', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() =>
      scheduleFollowUp({
        leadId,
        title: 'x',
        dueAt: new Date(Date.now() - 1000).toISOString()
      })
    ).toThrow(ValidationError)
  })
})

describe('queries', () => {
  it('returns reference data after seeding', () => {
    seedOrgWithSession()
    const ref = getReferenceData()
    expect(ref.sources.length).toBeGreaterThan(0)
    expect(ref.stages.map((s) => s.name)).toContain('NEW')
    expect(ref.stages.filter((s) => s.isInitial)).toHaveLength(1)
    expect(ref.lostReasons.length).toBeGreaterThan(0)
    expect(ref.activityTypes.some((t) => t.name === 'OWNER_CHANGE')).toBe(true)
  })

  it('classifies new vs uncontacted leads', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const contacted = createLead({ fullName: 'A', phone: '9111111111', sourceId })
    const typeId = activityTypeId(organizationId, 'WALK_IN')
    activityRepo.create({
      organizationId,
      leadId: contacted.leadId,
      typeId,
      note: 'contacted',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    createLead({ fullName: 'B', phone: '9222222222', sourceId })

    expect(getNewLeads()).toHaveLength(2)
    const uncontacted = getUncontactedLeads()
    expect(uncontacted).toHaveLength(1)
    expect(uncontacted[0].phone).toBe('9222222222')
  })

  it('returns funnel counts grouped by stage', () => {
    const { organizationId } = seedOrgWithSession()
    createLeadFor(organizationId)
    createLeadFor(organizationId)

    const counts = getFunnelCounts()
    expect(counts.find((c) => c.stageName === 'NEW')?.count).toBe(2)
  })

  it('returns lead details with derived status', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId, phone } = createLeadFor(organizationId)

    const details = getLeadDetails({ leadId })
    expect(details).toMatchObject({
      leadId,
      personName: 'Rahul Sharma',
      phone,
      sourceName: expect.any(String),
      stageName: 'NEW',
      status: 'OPEN',
      ownerName: 'Priya Verma'
    })
  })

  it('returns a timeline of activities, stage moves, and follow-ups', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId,
      targetStageId: stageIdByName(organizationId, 'CONTACTED'),
      expectedStageId: stageIdByName(organizationId, 'NEW'),
      activityId: activity.id
    })
    scheduleFollowUp({
      leadId,
      title: 'Re-call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    const kinds = getLeadTimeline({ leadId }).map((t) => t.kind)
    expect(kinds).toContain('activity')
    expect(kinds).toContain('stage')
    expect(kinds).toContain('followup')
  })

  it('scopes queries to the session organization', () => {
    const first = seedOrgWithSession()
    createLeadFor(first.organizationId)
    const second = seedOrgWithSession()
    createLeadFor(second.organizationId)

    expect(getNewLeads()).toHaveLength(1)
    const counts = getFunnelCounts()
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(1)
  })
})

describe('listLeads', () => {
  it('returns rows with nested activities, follow-ups, and stage history', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)

    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'Called Rahul',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId,
      targetStageId: stageIdByName(organizationId, 'CONTACTED'),
      expectedStageId: stageIdByName(organizationId, 'NEW'),
      activityId: activity.id
    })
    scheduleFollowUp({
      leadId,
      title: 'Re-call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    const page = listLeads({ page: 1, limit: 50 })
    expect(page.total).toBe(1)
    expect(page.items).toHaveLength(1)
    const row = page.items[0]
    expect(row).toMatchObject({
      id: leadId,
      personName: 'Rahul Sharma',
      stageName: 'CONTACTED',
      isWon: false,
      isLost: false,
      ownerName: 'Priya Verma',
      sourceName: expect.any(String)
    })
    expect(row.activities).toHaveLength(1)
    expect(row.activities[0]).toMatchObject({
      typeName: 'PHONE_CALL',
      note: 'Called Rahul',
      createdByName: 'Priya Verma'
    })
    expect(row.followUps).toHaveLength(1)
    expect(row.followUps[0]).toMatchObject({ title: 'Re-call', completedAt: null })
    expect(row.stageHistory).toHaveLength(2) // initial NEW + CONTACTED move
    expect(row.stageHistory[1]).toMatchObject({
      fromStageName: 'NEW',
      toStageName: 'CONTACTED'
    })
  })

  it('round-trips plan interest, goal, and notes in list rows', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({
      fullName: 'Neha',
      phone: '9333333333',
      sourceId,
      planInterest: 'Quarterly',
      goal: 'Muscle gain',
      notes: 'Prefers evening batch'
    })

    const row = listLeads({ page: 1, limit: 50 }).items[0]
    expect(row).toMatchObject({
      planInterest: 'Quarterly',
      goal: 'Muscle gain',
      notes: 'Prefers evening batch'
    })
  })

  it('filters by stage, source, owner, and search', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const first = createLead({ fullName: 'Alpha', phone: '9111111111', sourceId })
    createLead({ fullName: 'Beta', phone: '9222222222', sourceId })
    assignLead({ leadId: first.leadId, ownerUserId: userId }) // no-op, already owner

    const newStage = stageIdByName(organizationId, 'NEW')
    expect(listLeads({ page: 1, limit: 50, stageId: newStage }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, sourceId }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, ownerUserId: userId }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, search: 'Beta' }).total).toBe(1)
    expect(listLeads({ page: 1, limit: 50, search: 'does-not-exist' }).total).toBe(0)
  })

  it('paginates with hasMore', () => {
    const { organizationId } = seedOrgWithSession()
    createLeadFor(organizationId)
    createLeadFor(organizationId)
    createLeadFor(organizationId)

    const page = listLeads({ page: 1, limit: 2 })
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.total).toBe(3)

    const last = listLeads({ page: 2, limit: 2 })
    expect(last.items).toHaveLength(1)
    expect(last.hasMore).toBe(false)
  })

  it('throws PERMISSION_DENIED without lead.view', () => {
    seedOrgWithSession('Finance')
    expect(() => listLeads({ page: 1, limit: 50 })).toThrow(ForbiddenError)
  })
})
