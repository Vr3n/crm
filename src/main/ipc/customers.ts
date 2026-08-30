import { asc, eq, and, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  customers,
  people,
  memberships,
  membershipFreezes,
  invoices,
  paymentAllocations
} from '../db/schema'
import { currentOrganizationId } from '../auth/session'
import { customerIdRequestSchema } from '../../shared/contracts/customers'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { toRupees } from '../../shared/contracts/money'
import { handle } from './handle'

/**
 * Customers IPC handlers (Module 02 read models).
 * Returns data in the renderer's expected shape — customers with nested
 * memberships and freezes.
 */

interface PersonRow {
  id: number
  full_name: string
  phone: string | null
  email: string | null
}

interface CustomerRow {
  id: number
  person_id: number
  billing_name: string | null
  billing_phone: string | null
  billing_email: string | null
  billing_address: string | null
  emergency_contact: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface MembershipRow {
  id: number
  customer_id: number
  plan_id: number
  plan_name_snapshot: string
  base_price_minor: number
  discount_minor: number
  final_price_minor: number
  billing_frequency: string
  start_date: string
  end_date: string
  status: string
  created_at: string
  created_by: number
}

interface FreezeRow {
  id: number
  membership_id: number
  start_date: string
  end_date: string
  reason: string | null
  fee_minor: number
  billing_behavior: string
  access_behavior: string
  extension_days: number
  created_at: string
  created_by: number
}

interface InvoiceRow {
  id: number
  number: string
  status: string
  subtotal_minor: number
  tax_minor: number
  total_minor: number
  finalized_at: string | null
  created_at: string
}

interface AllocationRow {
  invoice_id: number
  amount_minor: number
}

/** Invoice read model in finished rupees — paid/outstanding derived from allocations. */
function buildInvoiceOutputs(
  organizationId: number,
  customerId: number
): Array<{
  id: string
  invoiceNo: string
  status: 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'
  issuedAt: string
  subtotal: number
  tax: number
  total: number
  paidAmount: number
  outstanding: number
}> {
  const invoiceRows = getDrizzle()
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organization_id, organizationId),
        eq(invoices.customer_id, customerId),
        sql`${invoices.status} != 'DRAFT'`
      )
    )
    .orderBy(asc(invoices.created_at))
    .all() as InvoiceRow[]

  if (invoiceRows.length === 0) return []

  const invoiceIds = invoiceRows.map((i) => i.id)
  const allocRows = getDrizzle()
    .select({
      invoice_id: paymentAllocations.invoice_id,
      amount_minor: paymentAllocations.amount_minor
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.organization_id, organizationId),
        sql`${paymentAllocations.invoice_id} IN (${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)})`
      )
    )
    .all() as AllocationRow[]

  const paidByInvoice = new Map<number, number>()
  for (const a of allocRows) {
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + a.amount_minor)
  }

  return invoiceRows.map((inv) => {
    const total = toRupees(inv.total_minor)
    const paid = toRupees(paidByInvoice.get(inv.id) ?? 0)
    return {
      id: String(inv.id),
      invoiceNo: inv.number,
      status: inv.status as 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE',
      issuedAt: inv.finalized_at ?? inv.created_at,
      subtotal: toRupees(inv.subtotal_minor),
      tax: toRupees(inv.tax_minor),
      total,
      paidAmount: paid,
      outstanding: Math.max(0, total - paid)
    }
  })
}

function buildCustomerOutput(
  customer: CustomerRow,
  person: PersonRow | undefined,
  memberShips: MembershipRow[],
  freezesByMembership: Map<number, FreezeRow[]>
) {
  // Read models ship finished rupees — minor units convert here exactly once
  // (Module 04 §34) so no component ever multiplies or divides by 100.
  return {
    id: String(customer.id),
    name: person?.full_name ?? customer.billing_name ?? 'Unknown',
    phone: person?.phone ?? customer.billing_phone ?? undefined,
    email: person?.email ?? customer.billing_email ?? undefined,
    dateOfBirth: undefined,
    gender: undefined,
    address: customer.billing_address ?? undefined,
    emergencyContact: customer.emergency_contact ?? undefined,
    notes: customer.notes ?? undefined,
    leadId: undefined,
    source: undefined,
    ownerId: undefined,
    ownerName: undefined,
    joinedAt: memberShips[0]?.created_at ?? customer.created_at,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at ?? undefined,
    memberships: memberShips.map((m) => ({
      id: String(m.id),
      customerId: String(m.customer_id),
      plan: m.plan_name_snapshot,
      planId: String(m.plan_id),
      price: toRupees(m.base_price_minor),
      discount: toRupees(m.discount_minor),
      billingFrequency: m.billing_frequency as 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL',
      registrationFee: 0,
      startDate: m.start_date,
      endDate: m.end_date,
      status: m.status as 'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED',
      freezes: (freezesByMembership.get(m.id) ?? []).map((f) => ({
        id: String(f.id),
        membershipId: String(f.membership_id),
        startDate: f.start_date,
        endDate: f.end_date,
        reason: f.reason ?? '',
        fee: toRupees(f.fee_minor),
        billingBehavior: f.billing_behavior as 'SUSPEND_BILLING' | 'CONTINUE_BILLING',
        accessBehavior: f.access_behavior as 'NO_ACCESS' | 'ACCESS',
        extensionDays: f.extension_days,
        createdAt: f.created_at,
        createdBy: f.created_by ? String(f.created_by) : undefined
      })),
      createdAt: m.created_at,
      createdBy: m.created_by ? String(m.created_by) : undefined
    }))
  }
}

function deriveCustomerStatus(
  memberships: MembershipRow[],
  freezes: FreezeRow[]
): 'ACTIVE' | 'FROZEN' | 'PENDING' | 'EXPIRED' | 'NONE' {
  const today = new Date().toISOString().slice(0, 10)
  const active = memberships.find(
    (m) => m.status === 'ACTIVE' && m.start_date <= today && m.end_date >= today
  )
  if (!active) {
    const pending = memberships.find((m) => m.status === 'PENDING')
    if (pending) return 'PENDING'
    const expired = memberships.find((m) => m.status === 'EXPIRED')
    if (expired) return 'EXPIRED'
    return 'NONE'
  }
  const hasActiveFreeze = freezes.some(
    (f) => f.membership_id === active.id && f.start_date <= today && f.end_date >= today
  )
  return hasActiveFreeze ? 'FROZEN' : 'ACTIVE'
}

export function registerCustomersIpc(): void {
  handle(IPC_CHANNELS.CUSTOMERS_LIST, () => {
    const organizationId = currentOrganizationId()

    const customerRows = getDrizzle()
      .select()
      .from(customers)
      .where(eq(customers.organization_id, organizationId))
      .all() as CustomerRow[]

    if (customerRows.length === 0) return []

    // Fetch people for all customers
    const personIds = customerRows.map((c) => c.person_id)
    const personRows = getDrizzle()
      .select()
      .from(people)
      .where(
        and(
          eq(people.organization_id, organizationId),
          sql`${people.id} IN (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})`
        )
      )
      .all() as PersonRow[]
    const personMap = new Map(personRows.map((p) => [p.id, p]))

    // Fetch all memberships
    const membershipRows = getDrizzle()
      .select()
      .from(memberships)
      .where(eq(memberships.organization_id, organizationId))
      .all() as MembershipRow[]
    const membershipsByCustomer = new Map<number, MembershipRow[]>()
    for (const m of membershipRows) {
      const list = membershipsByCustomer.get(m.customer_id) ?? []
      list.push(m)
      membershipsByCustomer.set(m.customer_id, list)
    }

    // Fetch all freezes
    const freezeRows = getDrizzle()
      .select()
      .from(membershipFreezes)
      .where(eq(membershipFreezes.organization_id, organizationId))
      .all() as FreezeRow[]
    const freezesByMembership = new Map<number, FreezeRow[]>()
    for (const f of freezeRows) {
      const list = freezesByMembership.get(f.membership_id) ?? []
      list.push(f)
      freezesByMembership.set(f.membership_id, list)
    }

    // Build output
    const today = new Date().toISOString().slice(0, 10)
    return customerRows.map((c) => {
      const person = personMap.get(c.person_id)
      const memberShips = membershipsByCustomer.get(c.id) ?? []
      const allFreezes = memberShips.flatMap(
        (m) => freezesByMembership.get(m.id) ?? []
      )
      const output = buildCustomerOutput(c, person, memberShips, freezesByMembership)
      const status = deriveCustomerStatus(memberShips, allFreezes)
      const currentMembership = memberShips.find(
        (m) =>
          (m.status === 'ACTIVE' || m.status === 'FROZEN') &&
          m.start_date <= today &&
          m.end_date >= today
      )
      return {
        ...output,
        status,
        currentMembership: currentMembership
          ? output.memberships.find((m) => m.id === String(currentMembership.id))
          : undefined,
        membershipCount: memberShips.length,
        nextExpiry: memberShips
          .filter((m) => m.status === 'ACTIVE')
          .sort((a, b) => a.end_date.localeCompare(b.end_date))[0]
          ?.end_date
      }
    })
  })

  handle(IPC_CHANNELS.CUSTOMERS_GET, customerIdRequestSchema, (input) => {
    const organizationId = currentOrganizationId()
    const customerId = parseInt(input.customerId, 10)

    const customerRow = getDrizzle()
      .select()
      .from(customers)
      .where(and(eq(customers.organization_id, organizationId), eq(customers.id, customerId)))
      .get() as CustomerRow | undefined

    if (!customerRow) return undefined

    const person = getDrizzle()
      .select()
      .from(people)
      .where(and(eq(people.organization_id, organizationId), eq(people.id, customerRow.person_id)))
      .get() as PersonRow | undefined

    const memberShips = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.organization_id, organizationId), eq(memberships.customer_id, customerId))
      )
      .orderBy(asc(memberships.created_at))
      .all() as MembershipRow[]

    const freezesByMembership = new Map<number, FreezeRow[]>()
    for (const m of memberShips) {
      const freezes = getDrizzle()
        .select()
        .from(membershipFreezes)
        .where(
          and(
            eq(membershipFreezes.organization_id, organizationId),
            eq(membershipFreezes.membership_id, m.id)
          )
        )
        .all() as FreezeRow[]
      freezesByMembership.set(m.id, freezes)
    }

    const output = buildCustomerOutput(customerRow, person, memberShips, freezesByMembership)
    const allFreezes = memberShips.flatMap(
      (m) => freezesByMembership.get(m.id) ?? []
    )
    const status = deriveCustomerStatus(memberShips, allFreezes)
    const today = new Date().toISOString().slice(0, 10)
    const currentMembership = memberShips.find(
      (m) =>
        (m.status === 'ACTIVE' || m.status === 'FROZEN') &&
        m.start_date <= today &&
        m.end_date >= today
    )

    return {
      ...output,
      status,
      currentMembership: currentMembership
        ? output.memberships.find((m) => m.id === String(currentMembership.id))
        : undefined,
      membershipCount: memberShips.length,
      nextExpiry: memberShips
        .filter((m) => m.status === 'ACTIVE')
        .sort((a, b) => a.end_date.localeCompare(b.end_date))[0]
        ?.end_date,
      invoices: buildInvoiceOutputs(organizationId, customerId)
    }
  })
}
