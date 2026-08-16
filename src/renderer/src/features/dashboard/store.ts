import { buildMemberRecord, buildPaymentRecord } from './member-record'
import type { MemberRecord, MembershipExpiration, PaymentDue } from './types'

/**
 * In-memory read-model store for the dashboard.
 *
 * Holds the seeded member rows. The async facade in `api.ts` is the seam where
 * the future SQLite read models drop in — keep these signatures and swap the
 * bodies for IPC calls (e.g. `window.api.dashboard.expirations()`).
 */

class DashboardStore {
  private expirations: MembershipExpiration[]
  private paymentsDue: PaymentDue[]

  constructor() {
    this.expirations = []
    this.paymentsDue = []
  }

  seed(expirations: MembershipExpiration[], paymentsDue: PaymentDue[]): void {
    this.expirations = expirations
    this.paymentsDue = paymentsDue
  }

  upcomingExpirations(): MembershipExpiration[] {
    return [...this.expirations].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  }

  listPaymentsDue(): PaymentDue[] {
    return [...this.paymentsDue].sort((a, b) => b.amountDue - a.amountDue)
  }

  memberRecord(expirationId: string): MemberRecord | undefined {
    const found = this.expirations.find((e) => e.id === expirationId)
    return found ? buildMemberRecord(found) : undefined
  }

  paymentRecord(paymentId: string): MemberRecord | undefined {
    const found = this.paymentsDue.find((p) => p.id === paymentId)
    return found ? buildPaymentRecord(found) : undefined
  }
}

export { DashboardStore }
