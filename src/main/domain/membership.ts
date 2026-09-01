/**
 * Customers & Memberships domain (Module 02).
 *
 * Customer is the stable person; each membership row is one purchased entitlement
 * period. Membership status is a cache — ground truth is dates plus freeze records
 * (Module 02 §technical decision). Status transitions are explicit domain operations.
 */

export type MembershipStatus =
  'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED'

export type FreezeBillingBehavior = 'SUSPEND_BILLING' | 'CONTINUE_BILLING'
export type FreezeAccessBehavior = 'NO_ACCESS' | 'LIMITED_ACCESS'

export type MembershipEventType =
  | 'CREATED'
  | 'ACTIVATED'
  | 'FROZEN'
  | 'UNFROZEN'
  | 'RENEWED'
  | 'PLAN_CHANGED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'TERMINATED'

export interface Customer {
  id: number
  organizationId: number
  personId: number
  billingName: string | null
  billingPhone: string | null
  billingEmail: string | null
  billingAddress: string | null
  emergencyContact: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Membership {
  id: number
  organizationId: number
  customerId: number
  planId: number
  offerId: number | null
  planNameSnapshot: string
  durationDaysSnapshot: number
  basePriceMinor: number
  discountMinor: number
  finalPriceMinor: number
  taxRateBps: number
  joiningDate: string
  startDate: string
  endDate: string
  billingFrequency: string
  status: MembershipStatus
  cancellationRequestedAt: string | null
  cancellationEffectiveDate: string | null
  cancellationReason: string | null
  createdAt: string
  createdBy: number
}

export interface MembershipFreeze {
  id: number
  organizationId: number
  membershipId: number
  startDate: string
  endDate: string
  reason: string | null
  feeMinor: number
  billingBehavior: FreezeBillingBehavior
  accessBehavior: FreezeAccessBehavior
  extensionDays: number
  creditDays: number
  createdAt: string
  createdBy: number
}

export interface MembershipEvent {
  id: number
  organizationId: number
  membershipId: number
  type: MembershipEventType
  data: string | null
  occurredAt: string
  createdBy: number
}

/**
 * Allowed status transitions (Module 11 §72). Explicit transitions only.
 * EXPIRED is derived from end_date < today and maintained by a reconciliation
 * job — never set by UI code directly.
 */
const ALLOWED_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['FROZEN', 'EXPIRED', 'CANCELLED', 'TERMINATED'],
  FROZEN: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'TERMINATED'],
  EXPIRED: [],
  CANCELLED: [],
  TERMINATED: []
}

/**
 * Validates that a status transition is legal. Throws InvalidStateTransitionError
 * if the transition is not in the allowed map.
 */
export function assertValidTransition(from: MembershipStatus, to: MembershipStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid membership transition: ${from} → ${to}`)
  }
}

/**
 * Derives the "effective" membership status from dates and freeze records.
 * This is the ground truth; the status column is a cache.
 */
export function deriveMembershipStatus(
  startDate: string,
  endDate: string,
  today: string,
  hasActiveFreeze: boolean
): MembershipStatus {
  if (today < startDate) return 'PENDING'
  if (today > endDate) return 'EXPIRED'
  if (hasActiveFreeze) return 'FROZEN'
  return 'ACTIVE'
}
