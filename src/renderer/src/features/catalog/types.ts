import type {
  CancellationEffectiveRule,
  FreezeAccessBehavior,
  FreezeBillingBehavior,
  FreezeExtendOrCredit,
  ProrationRule
} from '../../../../shared/contracts/catalog'

export type PlanDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type BillingFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type AccessWindow = 'ALL_HOURS' | 'TIMED'

/**
 * A pricing plan — the current catalog of how memberships are sold. Plans can be
 * edited freely because a Membership snapshots the price at sale time (Module 03).
 * `taxRate`/`registrationFee` are display units (percent / rupees); they are
 * converted to bps/paise on the wire.
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
  taxCode: string | null
  taxRate: number
  registrationFee: number
  freezePolicyId: number | null
  prorationPolicyId: number | null
  cancellationPolicyId: number | null
  isActive: boolean
  description: string
  createdAt: string
}

export type PlanInput = Omit<
  Plan,
  'id' | 'createdAt' | 'freezePolicyId' | 'prorationPolicyId' | 'cancellationPolicyId'
> & {
  freezePolicyId?: number | null
  prorationPolicyId?: number | null
  cancellationPolicyId?: number | null
}

/** A historical price state of a plan, captured on every plan edit. */
export interface PlanVersion {
  id: number
  planId: number
  basePrice: number
  taxRate: number
  effectiveFrom: string
  createdAt: string
}

/** A historical discount state of an offer, captured when the discount type or value changes. */
export interface OfferVersion {
  id: number
  offerId: number
  discountType: DiscountType
  value: number
  effectiveFrom: string
  createdAt: string
}

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'OVERRIDE_PRICE' | 'FREE_PERIOD'

/** Derived from dates + the active flag — never stored, computed on the fly. */
export type OfferLifecycle = 'LIVE' | 'UPCOMING' | 'ENDED' | 'PAUSED'

/**
 * A promotional offer applied against plan base prices. Offers can change freely —
 * the discount math is snapshotted onto the Membership/Invoice at sale time.
 * `value` is display units (percent / rupees / months); `code` is derived from
 * the name for display only (the backend stores no code). `maxUses` is 0 when
 * the offer is unlimited.
 */
export interface Offer {
  id: number
  name: string
  code: string
  description: string
  discountType: DiscountType
  value: number
  applicablePlanIds: number[]
  minPurchase: number
  maxUses: number
  usedCount: number
  startDate: string
  endDate: string | null
  isActive: boolean
  eligibility: string
  createdAt: string
}

export type OfferInput = Omit<Offer, 'id' | 'code' | 'usedCount' | 'createdAt'>

export interface FreezePolicy {
  id: number
  name: string
  billingBehavior: FreezeBillingBehavior
  accessBehavior: FreezeAccessBehavior
  extendOrCredit: FreezeExtendOrCredit
  fee: number
  freeFreezeCountPerYear: number
  description: string | null
}

export interface ProrationPolicy {
  id: number
  name: string
  rule: ProrationRule
  description: string | null
}

export interface CancellationPolicy {
  id: number
  name: string
  effectiveRule: CancellationEffectiveRule
  noticeDays: number | null
  description: string | null
}

export interface PolicyLookups {
  freezePolicies: FreezePolicy[]
  prorationPolicies: ProrationPolicy[]
  cancellationPolicies: CancellationPolicy[]
}