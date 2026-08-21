import type { MembershipExpiration, PaymentDue, MemberRecord } from './types'

/**
 * Thin IPC facade for the dashboard surface. Every method delegates to the
 * preload bridge (`window.api.dashboard.*`).
 */
export const api = {
  upcomingExpirations: (): Promise<MembershipExpiration[]> =>
    window.api.dashboard.expirations(),
  paymentsDue: (): Promise<PaymentDue[]> =>
    window.api.dashboard.paymentsDue(),
  memberRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard.memberRecord({ memberId: id }),
  paymentRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard.paymentRecord({ memberId: id })
}
