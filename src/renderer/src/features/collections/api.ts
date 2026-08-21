import type { PaymentRecord } from './types'

/**
 * Thin IPC facade for the collections surface. Every method delegates to the
 * preload bridge (`window.api.collections.*`).
 */
export const api = {
  payments: (): Promise<PaymentRecord[]> =>
    window.api.collections.payments() as Promise<PaymentRecord[]>,
  payment: (id: string): Promise<PaymentRecord | undefined> =>
    window.api.collections.payment(parseInt(id, 10)) as Promise<PaymentRecord | undefined>
}
