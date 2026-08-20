import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId } from '../auth/session'
import { planRepo } from '../repositories/catalog'
import { leadRepo } from '../repositories/sales'
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type { MembershipPlan } from '../domain/catalog'
import type {
  CreatePlanInput,
  PlanIdRequest,
  PlanRow,
  UpdatePlanInput
} from '../../shared/contracts/catalog'

/**
 * Module 03 (Catalog) application use cases for membership plans. Plans are
 * reference data that change freely — Memberships/Invoices snapshot their
 * commercial terms at sale time, so editing here never rewrites history. Each
 * use case gates on a permission, derives the org from the session, and owns one
 * `withTransaction` boundary.
 */

function mapPlanToRow(plan: MembershipPlan): PlanRow {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    duration: plan.duration,
    billingFrequency: plan.billingFrequency,
    basePriceMinor: plan.basePriceMinor,
    accessWindow: plan.accessWindow,
    startTime: plan.startTime,
    endTime: plan.endTime,
    isActive: plan.active,
    createdAt: plan.createdAt
  }
}

/** The current pricing catalog — the Plans screen reads this. */
export function listPlans(): PlanRow[] {
  requirePermission(PERMISSIONS.PLAN_VIEW)
  const organizationId = currentOrganizationId()
  return planRepo.list(organizationId).map(mapPlanToRow)
}

/** Adds a reusable commercial definition to the catalog. */
export function createPlan(input: CreatePlanInput): PlanRow {
  requirePermission(PERMISSIONS.PLAN_CREATE)
  const organizationId = currentOrganizationId()
  const name = input.name.trim()
  if (!name) throw new ValidationError('Plan name is required')
  if (planRepo.findByName(organizationId, name)) {
    throw new ConflictError(`A plan named "${name}" already exists`)
  }

  return withTransaction(() => {
    const plan = planRepo.create({
      organizationId,
      name,
      description: input.description?.trim() || null,
      duration: input.duration,
      billingFrequency: input.billingFrequency,
      basePriceMinor: input.basePriceMinor,
      accessWindow: input.accessWindow,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      active: input.isActive
    })
    return mapPlanToRow(plan)
  })
}

/** Edits a plan's live terms — affects only future sales, never existing snapshots. */
export function updatePlan(input: UpdatePlanInput): PlanRow {
  requirePermission(PERMISSIONS.PLAN_UPDATE)
  const organizationId = currentOrganizationId()
  const existing = planRepo.getById(organizationId, input.planId)
  if (!existing) throw new NotFoundError('Plan not found')

  const name = input.name.trim()
  if (!name) throw new ValidationError('Plan name is required')
  const duplicate = planRepo.findByName(organizationId, name)
  if (duplicate && duplicate.id !== existing.id) {
    throw new ConflictError(`A plan named "${name}" already exists`)
  }

  return withTransaction(() => {
    planRepo.update(organizationId, existing.id, {
      name,
      description: input.description?.trim() || null,
      duration: input.duration,
      billingFrequency: input.billingFrequency,
      basePriceMinor: input.basePriceMinor,
      accessWindow: input.accessWindow,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      active: input.isActive
    })
    const updated = planRepo.getById(organizationId, existing.id)
    return mapPlanToRow(updated as MembershipPlan)
  })
}

/**
 * Removes a plan from the catalog. Refused while any lead references it — the
 * lead's plan interest is a real FK, so the delete guard protects referential
 * integrity (a referenced plan must be deactivated instead).
 */
export function deletePlan(input: PlanIdRequest): void {
  requirePermission(PERMISSIONS.PLAN_DEACTIVATE)
  const organizationId = currentOrganizationId()
  const existing = planRepo.getById(organizationId, input.planId)
  if (!existing) throw new NotFoundError('Plan not found')
  if (leadRepo.countByPlanId(organizationId, existing.id) > 0) {
    throw new ConflictError('This plan is referenced by leads and cannot be deleted')
  }
  withTransaction(() => {
    planRepo.delete(organizationId, existing.id)
  })
}
