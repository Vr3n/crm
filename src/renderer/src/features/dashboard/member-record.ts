import { addMonths } from 'date-fns'
import type {
  MemberLeadContext,
  MemberRecord,
  MembershipExpiration,
  MembershipInvoice,
  PaymentDue
} from './types'

/**
 * Deterministic builders for the member record drawer.
 *
 * The real system reads these from the transactional Module 01–05 tables: the
 * lead context is the converted lead (Module 01 → 02 link) and the invoices are
 * the billing rows under the membership. Until those modules exist, both are
 * derived purely from the source row so the drawer reads like a real record
 * without adding separate seed data.
 */

/** Nominal plan → price used to shape the seeded billing history. */
const PLAN_PRICE: Record<string, number> = {
  'Annual Premium': 12000,
  'Annual Plus': 15000,
  'Half-Yearly': 7600,
  'Quarterly Flex': 3900,
  'Personal Training': 8800
}

/** Nominal plan → term length in months (used to derive an expiry for payments). */
const PLAN_MONTHS: Record<string, number> = {
  'Annual Premium': 12,
  'Annual Plus': 12,
  'Half-Yearly': 6,
  'Quarterly Flex': 3,
  'Personal Training': 1
}

const SOURCES = ['Walk-in', 'Instagram', 'Referral', 'Website', 'Phone call']
const OWNERS = ['Priya Verma', 'Arjun Mehta', 'Sana Shaikh']
const GOALS = [
  'Weight loss',
  'Muscle gain',
  'General fitness',
  'Strength & conditioning',
  'Yoga & mobility'
]

const DAY = 86400000

/** Small stable hash so each member gets a fixed (reproducible) profile. */
function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function formatMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(iso))
}

/** The sales snapshot — source, owner, goal — of the lead this member converted from. */
export function buildLeadContext(e: MembershipExpiration): MemberLeadContext {
  const h = hash(e.member.id)
  return {
    source: SOURCES[h % SOURCES.length],
    owner: OWNERS[(h >> 2) % OWNERS.length],
    planInterest: e.plan,
    goal: GOALS[(h >> 4) % GOALS.length],
    joinedAt: e.purchasedAt
  }
}

/**
 * Monthly installment history covering the whole membership term (newest first).
 * The final installment stays OVERDUE when the membership lapsed without
 * renewal, so the drawer mirrors the table's urgency tone.
 */
export function buildInvoiceHistory(e: MembershipExpiration): MembershipInvoice[] {
  const price = PLAN_PRICE[e.plan] ?? 6000
  const termDays = Math.max(
    1,
    Math.round((new Date(e.expiresAt).getTime() - new Date(e.purchasedAt).getTime()) / DAY)
  )
  const count = Math.min(12, Math.max(1, Math.round(termDays / 30)))
  const base = Math.round(price / count / 100) * 100
  const expired = new Date(e.expiresAt).getTime() < Date.now()

  const invoices: MembershipInvoice[] = []
  for (let i = 0; i < count; i++) {
    const periodStart = addMonths(new Date(e.purchasedAt), i)
    const periodEnd = addMonths(new Date(e.purchasedAt), i + 1)
    const lastOverdue = i === count - 1 && expired
    invoices.push({
      id: `${e.id}-inv-${i}`,
      invoiceNo: `INV-${periodStart.getFullYear()}-${e.id.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      label: formatMonth(periodStart.toISOString()),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      amount: i === count - 1 ? price - base * (count - 1) : base,
      status: lastOverdue ? 'OVERDUE' : 'PAID',
      paidAt: lastOverdue ? undefined : periodEnd.toISOString()
    })
  }
  return invoices.reverse()
}

export function buildMemberRecord(e: MembershipExpiration): MemberRecord {
  return {
    membership: { plan: e.plan, purchasedAt: e.purchasedAt, expiresAt: e.expiresAt },
    lead: buildLeadContext(e),
    invoices: buildInvoiceHistory(e)
  }
}

/**
 * Billing history for a payment due (newest first): a run of settled
 * installments plus one overdue installment for the outstanding amount, so the
 * summary reads "collected = total − amountDue".
 */
export function buildPaymentInvoices(p: PaymentDue): MembershipInvoice[] {
  const count = Math.min(8, Math.max(2, Math.round(p.total / 2000)))
  const paidTotal = p.total - p.amountDue
  const base = paidTotal > 0 ? Math.round(paidTotal / (count - 1) / 50) * 50 : 0

  const invoices: MembershipInvoice[] = []
  for (let i = 0; i < count; i++) {
    const lastPaid = i === count - 2
    const isOverdue = i === count - 1
    const periodStart = addMonths(new Date(p.purchasedAt), i)
    const periodEnd = addMonths(new Date(p.purchasedAt), i + 1)
    invoices.push({
      id: `${p.id}-inv-${i}`,
      invoiceNo: `INV-${periodStart.getFullYear()}-${p.id.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      label: formatMonth(periodStart.toISOString()),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      amount: isOverdue ? p.amountDue : lastPaid ? paidTotal - base * (count - 2) : base,
      status: isOverdue ? 'OVERDUE' : 'PAID',
      paidAt: isOverdue ? undefined : periodEnd.toISOString()
    })
  }
  return invoices.reverse()
}

export function buildPaymentRecord(p: PaymentDue): MemberRecord {
  const months = PLAN_MONTHS[p.plan] ?? 1
  return {
    membership: {
      plan: p.plan,
      purchasedAt: p.purchasedAt,
      expiresAt: addMonths(new Date(p.purchasedAt), months).toISOString(),
      amountDue: p.amountDue,
      total: p.total
    },
    invoices: buildPaymentInvoices(p)
  }
}
