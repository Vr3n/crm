import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan
} from '../../../src/main/application/catalog'
import { createLead } from '../../../src/main/application/leads'
import { planRepo } from '../../../src/main/repositories/catalog'
import {
  organizationRepo,
  roleRepo,
  staffRepo,
  userRepo
} from '../../../src/main/repositories/identity'
import { setSession } from '../../../src/main/auth/session'
import type { SessionContext } from '../../../src/main/domain/identity'
import { getDb } from '../../../src/main/db/connection'
import {
  ConflictError,
  ForbiddenError,
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

let signInCounter = 0
/** Creates a brand-new staff member in the given role and switches the session to them. */
function signInAs(organizationId: number, roleName: string): number {
  const org = organizationRepo.findById(organizationId)
  const user = userRepo.create({
    fullName: 'Sana Kapoor',
    email: `sana${++signInCounter}@fitgym.com`,
    passwordHash: 'h'
  })
  const role = roleRepo.findByName(organizationId, roleName)
  staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
  const session: SessionContext = {
    organizationId,
    organizationSlug: org.slug,
    organizationName: org.name,
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    roleId: role.id,
    roleName: role.name,
    isSuper: role.isSuper,
    permissions: roleRepo.findPermissionCodes(role.id)
  }
  setSession(session)
  return user.id
}

const VALID_PLAN = {
  name: 'Strength Bundle',
  description: 'Weights + HIIT zones.',
  duration: 'MONTHLY' as const,
  billingFrequency: 'ONE_TIME' as const,
  basePriceMinor: 220000,
  accessWindow: 'ALL_HOURS' as const,
  startTime: '06:00',
  endTime: '23:00',
  isActive: true
}

describe('listPlans', () => {
  it('returns the orgs seeded catalog, scoped and free of foreign rows', () => {
    seedOrgWithSession() // a first org with its own plans
    const { organizationId: orgB } = seedOrgWithSession() // session now on org B

    const plans = listPlans()
    expect(plans).toHaveLength(7)
    expect(plans.every((p) => p.name && p.basePriceMinor > 0)).toBe(true)
    expect(plans.map((p) => p.id)).toEqual(planRepo.list(orgB).map((p) => p.id))
  })

  it('throws PERMISSION_DENIED without plan.view', () => {
    seedOrgWithSession('Front Desk')
    expect(() => listPlans()).toThrow(ForbiddenError)
  })
})

describe('createPlan', () => {
  it('creates a plan with a trimmed name and returns the row', () => {
    seedOrgWithSession()
    const created = createPlan({ ...VALID_PLAN, name: '  Strength Bundle  ' })
    expect(created).toMatchObject({
      id: expect.any(Number),
      name: 'Strength Bundle',
      basePriceMinor: 220000,
      isActive: true
    })
    const stored = getDb()
      .prepare('SELECT name FROM membership_plans WHERE id = ?')
      .get(created.id) as { name: string }
    expect(stored.name).toBe('Strength Bundle')
  })

  it('rejects a duplicate name case-insensitively with ConflictError', () => {
    seedOrgWithSession()
    expect(() => createPlan({ ...VALID_PLAN, name: 'annual premium' })).toThrow(ConflictError)
  })

  it('rejects a whitespace-only name with ValidationError', () => {
    seedOrgWithSession()
    expect(() => createPlan({ ...VALID_PLAN, name: '   ' })).toThrow(ValidationError)
  })

  it('denies creation without plan.create even with plan.view', () => {
    seedOrgWithSession('Sales')
    expect(() => createPlan(VALID_PLAN)).toThrow(ForbiddenError)
  })
})

describe('updatePlan', () => {
  it('updates a plans live terms and bumps updated_at', () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]

    const updated = updatePlan({
      planId: target.id,
      ...VALID_PLAN,
      name: 'Renamed Bundle',
      basePriceMinor: 250000,
      isActive: false
    })
    expect(updated).toMatchObject({ id: target.id, name: 'Renamed Bundle', isActive: false })
    const row = getDb()
      .prepare('SELECT name, base_price_minor FROM membership_plans WHERE id = ?')
      .get(target.id) as { name: string; base_price_minor: number }
    expect(row).toEqual({ name: 'Renamed Bundle', base_price_minor: 250000 })
  })

  it('throws NotFoundError for a plan in another organization', () => {
    const { organizationId: orgA } = seedOrgWithSession()
    const { organizationId: orgB } = seedOrgWithSession()
    const foreign = planRepo.list(orgB)[0]

    signInAs(orgA, 'Owner')
    expect(() => updatePlan({ planId: foreign.id, ...VALID_PLAN })).toThrow(NotFoundError)
  })

  it('allows keeping the same name but rejects another plans name', () => {
    const { organizationId } = seedOrgWithSession()
    const [first, second] = planRepo.list(organizationId)
    expect(() => updatePlan({ planId: first.id, ...VALID_PLAN, name: first.name })).not.toThrow()
    expect(() => updatePlan({ planId: first.id, ...VALID_PLAN, name: second.name })).toThrow(
      ConflictError
    )
  })

  it('denies updates without plan.update', () => {
    seedOrgWithSession('Sales')
    expect(() => updatePlan({ planId: 1, ...VALID_PLAN })).toThrow(ForbiddenError)
  })
})

describe('deletePlan', () => {
  it('hard-deletes an unreferenced plan', () => {
    const { organizationId } = seedOrgWithSession()
    const created = createPlan({ ...VALID_PLAN, name: 'Throwaway Plan' })

    expect(() => deletePlan({ planId: created.id })).not.toThrow()
    expect(planRepo.getById(organizationId, created.id)).toBeNull()
  })

  it('refuses to delete a plan referenced by leads with ConflictError', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const referenced = planRepo.list(organizationId)[0]
    createLead({
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      sourceId,
      planId: referenced.id
    })

    expect(() => deletePlan({ planId: referenced.id })).toThrow(ConflictError)
    expect(planRepo.getById(organizationId, referenced.id)).not.toBeNull()
  })

  it('throws NotFoundError for a missing plan', () => {
    seedOrgWithSession()
    expect(() => deletePlan({ planId: 999999 })).toThrow(NotFoundError)
  })

  it('denies deletion without plan.deactivate', () => {
    seedOrgWithSession('Sales')
    expect(() => deletePlan({ planId: 1 })).toThrow(ForbiddenError)
  })
})
