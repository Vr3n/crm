import { buildInvoice } from './build'
import type { Invoice, InvoiceStatus } from './types'

/**
 * In-memory read-model store for the invoice register.
 *
 * Holds the seeded invoices, totals derived at seed time via `buildInvoice`.
 * The async facade in `api.ts` is the seam where the future SQLite read model
 * drops in — keep these signatures and swap the bodies for IPC calls
 * (e.g. `window.api.billing.invoices()`).
 */

class InvoiceStore {
  private invoices: Invoice[] = []

  seed(seeds: Parameters<typeof buildInvoice>[0][]): void {
    this.invoices = seeds.map(buildInvoice)
  }

  /** Register sorted newest-issued first (matches the table's default sort). */
  list(): Invoice[] {
    return [...this.invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }

  byId(id: string): Invoice | undefined {
    return this.invoices.find((i) => i.id === id)
  }

  /** Fast filter for status chips / exports without re-sorting the list. */
  byStatus(status: InvoiceStatus | undefined): Invoice[] {
    return status ? this.invoices.filter((i) => i.status === status) : this.invoices
  }
}

export { InvoiceStore }
