import { SEED_INVOICES } from '@/features/invoices/mock-data'
import type { CustomerRef, PaymentRecord } from './types'

/**
 * Seed payments for the daily collection report.
 *
 * The bulk of the rows are *derived* from the invoice register's allocations —
 * a payment is the same record the invoice drawer shows — so the two read
 * models can never disagree about what was collected. A handful of standalone
 * "on account" payments are appended to exercise the advance-payment concept
 * (Module 05 §15) without an invoice attached.
 *
 * Timestamps are relative to "now"; several land today so the default report
 * is alive. In the real system this whole file is a SQL aggregation over the
 * `payments` table (Module 09 §63).
 */

const stamp = (daysBack: number, hour: number, minute: number): string => {
  const d = new Date(Date.now() - daysBack * 86400000)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const P = (id: string, name: string, phone: string): CustomerRef => ({ id, name, phone })

const derived: PaymentRecord[] = SEED_INVOICES.flatMap((inv) =>
  inv.allocations.map((a) => ({
    id: a.id,
    reference: a.reference,
    customer: inv.customer,
    amount: a.amount,
    method: a.method,
    receivedAt: a.receivedAt,
    receivedBy: a.receivedBy,
    allocations: [{ invoiceNo: inv.invoiceNo, amount: a.amount }]
  }))
)

/** Walk-ins / advance payments recorded today, with no invoice in the register. */
const onAccount: PaymentRecord[] = [
  {
    id: 'pay-adv-1',
    reference: 'PYMT-2026-0117',
    customer: P('c15', 'Aisha Khan', '+91 98100 22334'),
    amount: 354,
    method: 'CASH',
    receivedAt: stamp(0, 9, 15),
    receivedBy: 'Priya Verma',
    allocations: [],
    notes: 'Day pass — walk-in'
  },
  {
    id: 'pay-adv-2',
    reference: 'PYMT-2026-0118',
    customer: P('c16', 'Nikhil Shah', '+91 99220 44556'),
    amount: 1416,
    method: 'UPI',
    receivedAt: stamp(0, 11, 5),
    receivedBy: 'Sana Shaikh',
    allocations: [],
    notes: 'Locker rental — paid in advance'
  },
  {
    id: 'pay-adv-3',
    reference: 'PYMT-2026-0119',
    customer: P('c17', 'Rohan Gupta', '+91 98330 66778'),
    amount: 5000,
    method: 'CASH',
    receivedAt: stamp(0, 13, 45),
    receivedBy: 'Arjun Mehta',
    allocations: [],
    notes: 'Advance on account'
  },
  {
    id: 'pay-adv-4',
    reference: 'PYMT-2026-0120',
    customer: P('c18', 'Tanya Joshi', '+91 97440 88990'),
    amount: 900,
    method: 'UPI',
    receivedAt: stamp(0, 15, 20),
    receivedBy: 'Priya Verma',
    allocations: [],
    notes: 'Day pass — walk-in'
  }
]

export const SEED_PAYMENTS: PaymentRecord[] = [...derived, ...onAccount]
