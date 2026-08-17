import { currentActor } from '@/features/leads/api'
import {
  FinanceStore,
  type IssueCreditInput,
  type IssueRefundInput,
  type RecordPaymentInput
} from './store'
import type { Credit, FinanceInvoice, Payment, Refund } from './types'

/**
 * Async facade over the in-memory finance store.
 *
 * The seam where the future backend drops in: keep these signatures and swap
 * the bodies for IPC calls (e.g. `window.api.finance.payments()`) once the
 * SQLite read-model layer exists. A small artificial delay keeps the loading
 * and mutation states honest so the UI reads like a real system.
 */

const store = new FinanceStore()
store.seed()

const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async payments(): Promise<Payment[]> {
    await delay()
    return store.listPayments()
  },
  async refunds(): Promise<Refund[]> {
    await delay()
    return store.listRefunds()
  },
  async credits(): Promise<Credit[]> {
    await delay()
    return store.listCredits()
  },
  async invoices(): Promise<FinanceInvoice[]> {
    await delay()
    return store.listInvoices()
  },
  async customers() {
    await delay(40)
    return store.listCustomers()
  },
  async outstandingInvoicesFor(customerId: string): Promise<FinanceInvoice[]> {
    await delay(40)
    return store.outstandingInvoicesFor(customerId)
  },
  async paymentsFor(customerId: string): Promise<Payment[]> {
    await delay(40)
    return store.paymentsFor(customerId)
  },
  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    await delay()
    return store.recordPayment(input, currentActor)
  },
  async issueRefund(input: IssueRefundInput): Promise<Refund> {
    await delay()
    return store.issueRefund(input, currentActor)
  },
  async issueCredit(input: IssueCreditInput): Promise<Credit> {
    await delay()
    return store.issueCredit(input, currentActor)
  }
}
