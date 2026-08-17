export type PlanDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type BillingFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type AccessWindow = 'ALL_HOURS' | 'TIMED'

/**
 * A pricing plan — the current catalog of how memberships are sold. Plans can be
 * edited freely because a Membership snapshots the price at sale time (Module 03).
 */
export interface Plan {
  id: number
  name: string
  duration: PlanDuration
  billing: BillingFrequency
  basePrice: number
  accessWindow: AccessWindow
  startTime: string
  endTime: string
  isActive: boolean
  description: string
  createdAt: string
}

export type PlanInput = Omit<Plan, 'id' | 'createdAt'>

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'OVERRIDE_PRICE' | 'FREE_PERIOD'

/** Derived from dates + the active flag — never stored, computed on the fly. */
export type OfferLifecycle = 'LIVE' | 'UPCOMING' | 'ENDED' | 'PAUSED'

/**
 * A promotional offer applied against plan base prices. Offers can change freely —
 * the discount math is snapshotted onto the Membership/Invoice at sale time.
 */
export interface Offer {
  id: number
  name: string
  code: string
  discountType: DiscountType
  value: number
  applicablePlanIds: number[]
  minPurchase: number
  maxUses: number
  usedCount: number
  startDate: string
  endDate: string
  isActive: boolean
  eligibility: string
  createdAt: string
}

export type OfferInput = Omit<Offer, 'id' | 'usedCount' | 'createdAt'>