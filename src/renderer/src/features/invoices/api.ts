import type { Invoice, InvoiceStatus } from './types'

/**
 * Thin IPC facade for the invoices surface. Every method delegates to the
 * preload bridge (`window.api.invoices.*`).
 */
export const api = {
  invoices: (): Promise<Invoice[]> =>
    window.api.invoices.list() as unknown as Promise<Invoice[]>,
  invoice: (id: string): Promise<Invoice | undefined> =>
    window.api.invoices.get({ invoiceId: id }) as unknown as Promise<Invoice | undefined>,
  invoicesByStatus: (status: InvoiceStatus | undefined): Promise<Invoice[]> =>
    window.api.invoices.listByStatus({ status: status as never }) as unknown as Promise<Invoice[]>
}
