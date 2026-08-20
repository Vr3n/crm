/**
 * Catalog & Offers domain (Module 03). Plans are reference/lookup data — they
 * change freely because Memberships/Invoices snapshot their commercial terms at
 * sale time (Module 03 §10). Prices are integer minor units (paise), never floats.
 */

export type PlanDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type PlanBillingFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type PlanAccessWindow = 'ALL_HOURS' | 'TIMED'

export interface MembershipPlan {
  id: number
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
  createdAt: string
  updatedAt: string
}
