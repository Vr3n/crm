import type { BillingFrequency, MembershipStatus } from '@/features/customers/types'

/**
 * Memberships page (Module 02 §6) — a flat, queryable view of every entitlement
 * period across all customers. One row = one purchased membership; history is
 * never overwritten (docs/02 §32).
 */
export interface MembershipRow {
  id: string
  customerId: string
  customerName: string
  personId?: string
  plan: string
  priceMinor: number
  discountMinor: number
  registrationFeeMinor: number
  billingFrequency: BillingFrequency
  startDate: string
  endDate: string
  /** Effective state — derived from dates + open freezes (docs/02 §7). */
  status: MembershipStatus
  freezeCount: number
}

export interface MembershipFilters {
  search: string
  status: MembershipStatus | 'ALL'
  plan: string
}
