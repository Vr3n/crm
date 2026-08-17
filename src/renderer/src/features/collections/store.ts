import type { PaymentRecord } from './types'

/**
 * In-memory read-model store for payment records (Module 05 §16).
 *
 * The report is a pure derivation over these rows (`buildDayCollection`), so
 * there is deliberately no stored total to go stale. The async facade in
 * `api.ts` is the seam where the SQLite aggregation drops in later.
 */

class PaymentStore {
  private payments: PaymentRecord[] = []

  seed(rows: PaymentRecord[]): void {
    this.payments = rows
  }

  /** Latest recorded first. */
  list(): PaymentRecord[] {
    return [...this.payments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }

  byId(id: string): PaymentRecord | undefined {
    return this.payments.find((p) => p.id === id)
  }
}

export { PaymentStore }
