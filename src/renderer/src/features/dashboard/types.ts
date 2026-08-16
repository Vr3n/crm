/**
 * Dashboard read-model domain types.
 *
 * These are *presentational* aggregates derived for the operational dashboard
 * (Module 09 §58): expiring memberships, unpaid dues and cold leads. The real
 * system would build them as read models over the transactional Module 01–05
 * tables. Until those exist, this is a frontend-only prototype: the mock
 * store stands in for the future SQLite-backed query layer.
 *
 * Members / memberships / payments belong to Module 02–05 (not yet built), so
 * the member-facing rows are seeded mock data; leads are read from the
 * existing `features/leads` store.
 */

/** Minimal person reference shown in member-facing tables. */
export interface PersonRef {
  id: string
  name: string
  phone?: string
  email?: string
}

/** A membership about to expire — drives renewal follow-ups. */
export interface MembershipExpiration {
  id: string
  member: PersonRef
  plan: string
  purchasedAt: string
  expiresAt: string
}

/** An unpaid obligation — drives collection follow-ups. */
export interface PaymentDue {
  id: string
  member: PersonRef
  plan: string
  purchasedAt: string
  amountDue: number
  total: number
}
