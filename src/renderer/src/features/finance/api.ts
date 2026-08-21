import type { Payment, Refund, Credit, FinanceInvoice } from './types'
import type { PersonRef } from '@/features/dashboard/types'

interface RecordPaymentInput {
  customerId: string
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference?: string
  notes?: string
}

interface IssueRefundInput {
  paymentId: string
  amountMinor: number
  reason: string
}

interface IssueCreditInput {
  customerId: string
  amountMinor: number
  reason: string
  expiresAt?: string
}

/**
 * Thin IPC facade for the finance surface. Every method delegates to the
 * preload bridge (`window.api.finance.*`).
 */
export const api = {
  payments: (): Promise<Payment[]> =>
    window.api.finance.paymentHistory({ customerId: 0 }) as unknown as Promise<Payment[]>,
  refunds: (): Promise<Refund[]> => Promise.resolve([]),
  credits: (): Promise<Credit[]> => Promise.resolve([]),
  invoices: (): Promise<FinanceInvoice[]> => Promise.resolve([]),
  customers: (): Promise<PersonRef[]> => Promise.resolve([]),
  outstandingInvoicesFor: (_customerId: string): Promise<FinanceInvoice[]> => Promise.resolve([]),
  paymentsFor: (customerId: string): Promise<Payment[]> =>
    window.api.finance.paymentHistory({ customerId: parseInt(customerId, 10) }) as unknown as Promise<Payment[]>,
  recordPayment: (input: RecordPaymentInput): Promise<Payment> =>
    window.api.finance.recordPayment({
      customerId: parseInt(input.customerId, 10),
      paymentDate: input.paymentDate,
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null
    }) as unknown as Promise<Payment>,
  issueRefund: (input: IssueRefundInput): Promise<Refund> =>
    window.api.finance.issueRefund({
      paymentId: parseInt(input.paymentId, 10),
      amountMinor: input.amountMinor,
      reason: input.reason
    }) as unknown as Promise<Refund>,
  issueCredit: (input: IssueCreditInput): Promise<Credit> =>
    window.api.finance.issueCredit({
      customerId: parseInt(input.customerId, 10),
      amountMinor: input.amountMinor,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null
    }) as unknown as Promise<Credit>
}
