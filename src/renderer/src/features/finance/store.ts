import { invoiceDue } from './build'
import {
  FINANCE_CUSTOMERS,
  SEED_CREDITS,
  SEED_INVOICES,
  SEED_PAYMENTS,
  SEED_REFUNDS
} from './mock-data'
import type { Credit, FinanceInvoice, InvoiceStatus, Payment, PaymentMethod, Refund } from './types'
import type { PersonRef } from '@/features/dashboard/types'

/**
 * In-memory read-model + mutation store for the finance feature.
 *
 * Holds the seeded Module 05 records. The async facade in `api.ts` is the seam
 * where the future SQLite transactional layer drops in — keep these signatures
 * and swap the bodies for IPC calls (e.g. `window.api.finance.payments()`).
 *
 * Mutations mirror the reference transactions (Module 07 §46–47): record a
 * payment and its allocations together, issue a refund without touching the
 * original payment, and let the invoice's paid amount be derived/updated from
 * the allocation records rather than a hand-maintained counter.
 */

export interface AllocationInput {
  invoiceId: string
  invoiceNo: string
  amount: number
}

export interface RecordPaymentInput {
  customerId: string
  paymentDate: string
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: AllocationInput[]
}

export interface IssueRefundInput {
  customerId: string
  refundDate: string
  amount: number
  sourcePaymentId: string
  sourcePaymentNo: string
  method: PaymentMethod
  reason: string
}

export interface IssueCreditInput {
  customerId: string
  issuedAt: string
  amount: number
  reason: string
  source?: string
}

function applyInvoicePayment(invoices: FinanceInvoice[], invoiceId: string, amount: number): void {
  const invoice = invoices.find((i) => i.id === invoiceId)
  if (!invoice || invoice.status === 'VOID') return
  const settled = Math.min(invoice.total, invoice.paid + amount)
  invoice.paid = settled
  invoice.status = settled >= invoice.total ? 'PAID' : settled > 0 ? 'PARTIALLY_PAID' : 'OPEN'
}

class FinanceStore {
  private payments: Payment[]
  private refunds: Refund[]
  private credits: Credit[]
  private invoices: FinanceInvoice[]

  constructor() {
    this.payments = []
    this.refunds = []
    this.credits = []
    this.invoices = []
  }

  seed(): void {
    this.payments = SEED_PAYMENTS.map((p) => ({
      ...p,
      allocations: [...p.allocations],
      refundIds: [...p.refundIds]
    }))
    this.refunds = SEED_REFUNDS.map((r) => ({ ...r }))
    this.credits = SEED_CREDITS.map((c) => ({ ...c, applications: [...c.applications] }))
    this.invoices = SEED_INVOICES.map((i) => ({ ...i }))
  }

  /* ── reads ─────────────────────────────────────────────────────────────── */

  listPayments(): Payment[] {
    return [...this.payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }

  listRefunds(): Refund[] {
    return [...this.refunds].sort((a, b) => b.refundDate.localeCompare(a.refundDate))
  }

  listCredits(): Credit[] {
    return [...this.credits].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }

  listInvoices(): FinanceInvoice[] {
    return [...this.invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }

  listCustomers(): PersonRef[] {
    return FINANCE_CUSTOMERS
  }

  payment(id: string): Payment | undefined {
    return this.payments.find((p) => p.id === id)
  }

  refund(id: string): Refund | undefined {
    return this.refunds.find((r) => r.id === id)
  }

  credit(id: string): Credit | undefined {
    return this.credits.find((c) => c.id === id)
  }

  /** Open / partially-paid invoices still carrying a balance for a customer. */
  outstandingInvoicesFor(customerId: string): FinanceInvoice[] {
    return this.invoices.filter(
      (i) =>
        i.customer.id === customerId &&
        (i.status === 'OPEN' || i.status === 'PARTIALLY_PAID') &&
        invoiceDue(i) > 0
    )
  }

  /** Payments recorded against a customer (for the refund source picker). */
  paymentsFor(customerId: string): Payment[] {
    return this.payments
      .filter((p) => p.customer.id === customerId)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }

  /* ── writes ────────────────────────────────────────────────────────────── */

  /** Record money received and spread it across the chosen invoices (Module 07 §47). */
  recordPayment(input: RecordPaymentInput, createdBy: string): Payment {
    const payment: Payment = {
      id: `pay-${Date.now()}`,
      paymentNo: `P-${9000 + this.payments.length + 1}`,
      customer: FINANCE_CUSTOMERS.find((c) => c.id === input.customerId)!,
      paymentDate: input.paymentDate,
      amount: input.amount,
      method: input.method,
      reference: input.reference?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdBy,
      allocations: [...input.allocations],
      refundIds: []
    }
    for (const a of payment.allocations) applyInvoicePayment(this.invoices, a.invoiceId, a.amount)
    this.payments.push(payment)
    return payment
  }

  /**
   * Issue a refund. The original payment is never edited — the refund is a
   * separate, dated, reasoned record layered on top, and the invoice it was
   * allocated against reverts toward its original due amount (Module 05 §17).
   */
  issueRefund(input: IssueRefundInput, createdBy: string): Refund {
    const refund: Refund = {
      id: `ref-${Date.now()}`,
      refundNo: `R-${200 + this.refunds.length + 1}`,
      customer: FINANCE_CUSTOMERS.find((c) => c.id === input.customerId)!,
      refundDate: input.refundDate,
      amount: input.amount,
      sourcePaymentId: input.sourcePaymentId,
      sourcePaymentNo: input.sourcePaymentNo,
      method: input.method,
      reason: input.reason.trim(),
      createdBy
    }
    this.refunds.push(refund)

    const source = this.payments.find((p) => p.id === input.sourcePaymentId)
    if (source) source.refundIds = [...source.refundIds, refund.id]

    // Deallocate from the source payment's allocations (last-in-first-out),
    // so the invoices the money had covered revert toward their due amounts.
    let remaining = refund.amount
    const allocs = [...(source?.allocations ?? [])].reverse()
    for (const a of allocs) {
      if (remaining <= 0) break
      const invoice = this.invoices.find((i) => i.id === a.invoiceId)
      if (!invoice || invoice.status === 'VOID') continue
      const pull = Math.min(remaining, invoice.paid)
      invoice.paid = invoice.paid - pull
      remaining -= pull
      invoice.status =
        invoice.paid >= invoice.total ? 'PAID' : invoice.paid > 0 ? 'PARTIALLY_PAID' : 'OPEN'
    }
    return refund
  }

  /** Add value kept inside the business against a future invoice (Module 05 §18). */
  issueCredit(input: IssueCreditInput, createdBy: string): Credit {
    const credit: Credit = {
      id: `crd-${Date.now()}`,
      creditNo: `C-${300 + this.credits.length + 1}`,
      customer: FINANCE_CUSTOMERS.find((c) => c.id === input.customerId)!,
      issuedAt: input.issuedAt,
      amount: input.amount,
      reason: input.reason.trim(),
      source: input.source?.trim() || undefined,
      createdBy,
      applications: []
    }
    this.credits.push(credit)
    return credit
  }
}

export { FinanceStore }
export type { InvoiceStatus }
