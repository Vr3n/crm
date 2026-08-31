import type {
  MembershipExpiration,
  PaymentDue,
  MemberRecord,
  MembershipInvoice,
  MembershipDetails
} from './types'
import type {
  PaymentDueOutput,
  MemberRecordOutput,
  MembershipInvoiceOutput,
  MembershipDetailsOutput
} from '../../../../shared/contracts/dashboard'
import { minorToMajor } from '../../../../shared/contracts/money'

function mapPaymentDue(row: PaymentDueOutput): PaymentDue {
  return {
    id: row.id,
    member: row.member,
    plan: row.plan,
    purchasedAt: row.purchasedAt,
    amountDue: Number(minorToMajor(row.amountDueMinor, 'INR')),
    total: Number(minorToMajor(row.totalMinor, 'INR'))
  }
}

function mapMembershipInvoice(row: MembershipInvoiceOutput): MembershipInvoice {
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    label: row.label,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    amount: Number(minorToMajor(row.amountMinor, 'INR')),
    status: row.status,
    paidAt: row.paidAt
  }
}

function mapMembershipDetails(row: MembershipDetailsOutput): MembershipDetails {
  return {
    plan: row.plan,
    purchasedAt: row.purchasedAt,
    expiresAt: row.expiresAt,
    amountDue: row.amountDueMinor != null ? Number(minorToMajor(row.amountDueMinor, 'INR')) : undefined,
    total: row.totalMinor != null ? Number(minorToMajor(row.totalMinor, 'INR')) : undefined
  }
}

function mapMemberRecord(row: MemberRecordOutput): MemberRecord {
  return {
    membership: mapMembershipDetails(row.membership),
    lead: row.lead,
    invoices: row.invoices.map(mapMembershipInvoice)
  }
}

/**
 * Thin IPC facade for the dashboard surface. Every method delegates to the
 * preload bridge (`window.api.dashboard.*`).
 */
export const api = {
  upcomingExpirations: (): Promise<MembershipExpiration[]> => window.api.dashboard.expirations(),
  paymentsDue: (): Promise<PaymentDue[]> =>
    window.api.dashboard.paymentsDue().then((rows) => rows.map(mapPaymentDue)),
  memberRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard
      .memberRecord({ memberId: id })
      .then((row) => (row ? mapMemberRecord(row) : undefined)),
  paymentRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard
      .paymentRecord({ memberId: id })
      .then((row) => (row ? mapMemberRecord(row) : undefined))
}
