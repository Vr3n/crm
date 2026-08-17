import { InvoiceStore } from './store'
import { SEED_INVOICES } from './mock-data'
import type { Invoice, InvoiceStatus } from './types'

/**
 * Async facade over the in-memory invoice store.
 *
 * This is the seam where the future backend drops in: keep these signatures
 * and swap the bodies for IPC calls (e.g. `window.api.billing.invoices()`)
 * once the SQLite read-model layer exists. A small artificial delay keeps the
 * loading states honest so the UI reads like a real system.
 */

const store = new InvoiceStore()
store.seed(SEED_INVOICES)

const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async invoices(): Promise<Invoice[]> {
    await delay()
    return store.list()
  },
  async invoice(id: string): Promise<Invoice | undefined> {
    await delay()
    return store.byId(id)
  },
  async invoicesByStatus(status: InvoiceStatus | undefined): Promise<Invoice[]> {
    await delay()
    return store.byStatus(status)
  }
}
