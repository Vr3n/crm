import { PaymentStore } from './store'
import { SEED_PAYMENTS } from './mock-data'
import type { PaymentRecord } from './types'

/**
 * Async facade over the in-memory payment store.
 *
 * Keep these signatures; swap the bodies for IPC calls
 * (e.g. `window.api.finance.payments()`) once the SQLite read-model layer
 * exists. The artificial delay keeps loading states honest.
 */

const store = new PaymentStore()
store.seed(SEED_PAYMENTS)

const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async payments(): Promise<PaymentRecord[]> {
    await delay()
    return store.list()
  },
  async payment(id: string): Promise<PaymentRecord | undefined> {
    await delay()
    return store.byId(id)
  }
}
