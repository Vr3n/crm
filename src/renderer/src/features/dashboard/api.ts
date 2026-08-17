import { DashboardStore } from './store'
import { SEED_EXPIRATIONS, SEED_PAYMENTS_DUE } from './mock-data'
import type { MemberRecord, MembershipExpiration, PaymentDue } from './types'

/**
 * Async facade over the in-memory dashboard store.
 *
 * This is the seam where the future backend drops in: keep these signatures
 * and swap the bodies for IPC calls (e.g. `window.api.dashboard.expirations()`)
 * once the SQLite read-model layer exists. A small artificial delay keeps the
 * loading states honest so the UI reads like a real system.
 */

const store = new DashboardStore()
store.seed(SEED_EXPIRATIONS, SEED_PAYMENTS_DUE)

const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async upcomingExpirations(): Promise<MembershipExpiration[]> {
    await delay()
    return store.upcomingExpirations()
  },
  async paymentsDue(): Promise<PaymentDue[]> {
    await delay()
    return store.listPaymentsDue()
  },
  async memberRecord(id: string): Promise<MemberRecord | undefined> {
    await delay()
    return store.memberRecord(id)
  },
  async paymentRecord(id: string): Promise<MemberRecord | undefined> {
    await delay()
    return store.paymentRecord(id)
  }
}
