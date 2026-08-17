import type { Invoice, InvoiceLine } from './types'

/**
 * Deterministic invoice builder. The register never stores totals — `subtotal`,
 * `taxTotal`, `total` and the settlement fields (`paidAmount`, `outstanding`)
 * are always derived from the lines and allocations so a row can never drift
 * from its parts. The real system's read model would do the same thing in SQL
 * over the transactional tables (Module 04–05).
 */

/** Gross line value before tax (unit price × qty − discount). */
export function grossLine(l: InvoiceLine): number {
  return (l.unitPrice - l.discountAmount) * l.quantity
}

export function buildInvoice(
  raw: Omit<Invoice, 'subtotal' | 'taxTotal' | 'total' | 'paidAmount' | 'outstanding'>
): Invoice {
  const subtotal = raw.lines.reduce((sum, l) => sum + grossLine(l), 0)
  const taxTotal = raw.lines.reduce((sum, l) => sum + l.taxAmount, 0)
  const total = raw.lines.reduce((sum, l) => sum + l.lineTotal, 0)
  const paidAmount = raw.allocations.reduce((sum, a) => sum + a.amount, 0)
  return {
    ...raw,
    subtotal,
    taxTotal,
    total,
    paidAmount,
    outstanding: Math.max(0, total - paidAmount)
  }
}
