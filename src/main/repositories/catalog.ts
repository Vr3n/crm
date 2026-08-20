import { and, eq, like } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { membershipPlans } from '../db/schema'
import type {
  MembershipPlan,
  PlanAccessWindow,
  PlanBillingFrequency,
  PlanDuration
} from '../domain/catalog'

/**
 * Module 03 repositories. Object-literal repo (matching identity.ts/sales.ts),
 * org-scoped on every query, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary (§5).
 */

interface MembershipPlanRow {
  id: number
  organization_id: number
  name: string
  description: string | null
  duration: string
  billing_frequency: string
  base_price_minor: number
  access_window: string
  start_time: string | null
  end_time: string | null
  active: boolean
  created_at: string
  updated_at: string
}

function mapPlan(row: MembershipPlanRow): MembershipPlan {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    duration: row.duration as PlanDuration,
    billingFrequency: row.billing_frequency as PlanBillingFrequency,
    basePriceMinor: row.base_price_minor,
    accessWindow: row.access_window as PlanAccessWindow,
    startTime: row.start_time,
    endTime: row.end_time,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const planRepo = {
  list(organizationId: number): MembershipPlan[] {
    const rows = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(eq(membershipPlans.organization_id, organizationId))
      .all() as MembershipPlanRow[]
    return rows.map(mapPlan)
  },

  getById(organizationId: number, id: number): MembershipPlan | null {
    const row = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .get() as MembershipPlanRow | undefined
    return row ? mapPlan(row) : null
  },

  /** Case-insensitive name lookup, for duplicate detection. */
  findByName(organizationId: number, name: string): MembershipPlan | null {
    const row = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(
        and(eq(membershipPlans.organization_id, organizationId), like(membershipPlans.name, name))
      )
      .get() as MembershipPlanRow | undefined
    return row ? mapPlan(row) : null
  },

  create(input: {
    organizationId: number
    name: string
    description: string | null
    duration: PlanDuration
    billingFrequency: PlanBillingFrequency
    basePriceMinor: number
    accessWindow: PlanAccessWindow
    startTime: string | null
    endTime: string | null
    active: boolean
  }): MembershipPlan {
    const row = getDrizzle()
      .insert(membershipPlans)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        description: input.description,
        duration: input.duration,
        billing_frequency: input.billingFrequency,
        base_price_minor: input.basePriceMinor,
        access_window: input.accessWindow,
        start_time: input.startTime,
        end_time: input.endTime,
        active: input.active
      })
      .returning()
      .get() as MembershipPlanRow
    return mapPlan(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      name: string
      description: string | null
      duration: PlanDuration
      billingFrequency: PlanBillingFrequency
      basePriceMinor: number
      accessWindow: PlanAccessWindow
      startTime: string | null
      endTime: string | null
      active: boolean
    }
  ): void {
    getDrizzle()
      .update(membershipPlans)
      .set({
        name: input.name,
        description: input.description,
        duration: input.duration,
        billing_frequency: input.billingFrequency,
        base_price_minor: input.basePriceMinor,
        access_window: input.accessWindow,
        start_time: input.startTime,
        end_time: input.endTime,
        active: input.active,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .run()
  },

  delete(organizationId: number, id: number): void {
    getDrizzle()
      .delete(membershipPlans)
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .run()
  },

  /** Active plans matching the query, for the lead form's plan picker. */
  searchActive(
    organizationId: number,
    query: string,
    limit: number
  ): { id: number; name: string }[] {
    return getDrizzle()
      .select({ id: membershipPlans.id, name: membershipPlans.name })
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.organization_id, organizationId),
          eq(membershipPlans.active, true),
          like(membershipPlans.name, `%${query}%`)
        )
      )
      .orderBy(membershipPlans.name)
      .limit(limit)
      .all()
  }
}
