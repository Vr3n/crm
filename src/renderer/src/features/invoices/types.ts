/**
 * Billing & Invoicing read models (docs/modules 04, 09 §62).
 *
 * These are presentational aggregates for the invoice register. The real
 * system builds them as read models over the transactional Module 04–05
 * tables — `invoices` + `invoice_lines` (frozen pricing snapshots, §14/§33) +
 * `payments` / `payment_allocations` (settlement, Module 05 §16). Until those
 * exist this is a frontend prototype over seeded mock data; the async facade
 * in `api.ts` is the seam where IPC-backed queries drop in.
 *
 * Amounts are whole rupees on the read model (the domain stores integer paise,
 * Module 04 §34). `paidAmount` / `outstanding` are derived from the
 * allocations at build time — never maintained by the UI.
 */

import type { PaymentMethod } from '@/lib/payment-methods'

export type { PaymentMethod }

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'

/** Minimal customer reference shown across billing rows. */
export interface CustomerRef {
  id: string
  name: string
  phone?: string
  email?: string
}

/** One frozen pricing snapshot on the invoice (Module 04 §14, §33). */
export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  lineTotal: number
}

/** Money received and allocated against this invoice (Module 05 §16). */
export interface InvoiceAllocation {
  id: string
  amount: number
  method: PaymentMethod
  reference: string
  receivedAt: string
  receivedBy: string
}

export interface Invoice {
  id: string
  invoiceNo: string
  customer: CustomerRef
  issuedAt: string
  dueAt?: string
  status: InvoiceStatus
  lines: InvoiceLine[]
  allocations: InvoiceAllocation[]
  createdBy: string
  /** Derived, never stored: sum of line amounts before tax. */
  subtotal: number
  /** Derived: sum of per-line tax. */
  taxTotal: number
  /** Derived: subtotal + tax. */
  total: number
  /** Derived: sum of allocations. */
  paidAmount: number
  /** Derived: total − paid (clamped at 0). */
  outstanding: number
}
