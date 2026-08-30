import { currentOrganizationId, requirePermission } from '../auth/session'
import { invoiceRepo, invoiceLineRepo } from '../repositories/billing'
import { allocationRepo, paymentRepo } from '../repositories/finance'
import { getDrizzle } from '../db/connection'
import { organizations, customers, people, users, memberships } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { NotFoundError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import { renderPdf } from '../pdf/renderer'
import { renderInvoiceDocument } from '../pdf/templates/invoice-document'
import { renderPaymentReceipt } from '../pdf/templates/payment-receipt'
import type {
  InvoicePrintContext,
  ReceiptPrintContext,
  OrgBranding,
  PdfAllocation,
  PdfCustomer
} from '../pdf/types'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getOrgBranding(organizationId: number): OrgBranding {
  const org = getDrizzle()
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .get() as
    | {
        name: string
        legal_name: string | null
        logo: string | null
        address: string | null
        gstin: string | null
        mobile_number: string
        org_invoice_prefix: string | null
      }
    | undefined

  if (!org) throw new NotFoundError('Organization not found')

  return {
    name: org.name,
    legalName: org.legal_name,
    logo: org.logo,
    address: org.address,
    gstin: org.gstin,
    mobileNumber: org.mobile_number,
    invoicePrefix: org.org_invoice_prefix
  }
}

/** Fetches customer personal info (name, phone, email) from the people table. */
function getCustomerInfo(organizationId: number, customerId: number): PdfCustomer {
  const row = getDrizzle()
    .select({
      name: people.full_name,
      phone: people.phone,
      email: people.email
    })
    .from(customers)
    .innerJoin(people, eq(customers.person_id, people.id))
    .where(and(eq(customers.organization_id, organizationId), eq(customers.id, customerId)))
    .get() as { name: string; phone: string; email: string | null } | undefined

  if (!row) throw new NotFoundError('Customer not found')

  return {
    name: row.name,
    phone: row.phone,
    email: row.email
  }
}

function formatNow(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Builds a safe filename from customer name + ID + timestamp. */
function buildFilename(customerName: string, docId: string, timestamp: Date): string {
  const safe = customerName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase()
  const ts = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${safe}_${docId}_${ts}.pdf`
}

/* -------------------------------------------------------------------------- */
/* Invoice Document Export                                                     */
/* -------------------------------------------------------------------------- */

export function exportInvoicePdf(input: {
  invoiceId: number
  mode?: 'save' | 'preview'
}): Promise<string> {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')

  const lines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const customerInfo = getCustomerInfo(organizationId, invoice.customerId)

  const allocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)

  // Hydrate allocation payment numbers
  const enrichedAllocations: PdfAllocation[] = allocations.map((alloc) => {
    const payment = paymentRepo.getById(organizationId, alloc.paymentId)
    const paymentNo = payment
      ? `PAY-${String(payment.id).padStart(4, '0')}`
      : `PAY-${alloc.paymentId}`
    return {
      paymentNo,
      method: payment?.paymentMethod ?? 'UNKNOWN',
      amount: alloc.amountMinor,
      receivedAt: alloc.createdAt
    }
  })

  const org = getOrgBranding(organizationId)
  const now = formatNow()

  // Fetch the latest membership for this customer (for duration info)
  const membership = getDrizzle()
    .select({
      planName: memberships.plan_name_snapshot,
      joiningDate: memberships.joining_date,
      startDate: memberships.start_date,
      endDate: memberships.end_date
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.organization_id, organizationId),
        eq(memberships.customer_id, invoice.customerId)
      )
    )
    .orderBy(desc(memberships.created_at))
    .get() as
    | { planName: string; joiningDate: string; startDate: string; endDate: string }
    | undefined

  // Calculate paid amount from allocations
  const paidAmount = allocations.reduce((sum, a) => sum + a.amountMinor, 0)
  const outstanding = invoice.totalMinor - paidAmount

  const ctx: InvoicePrintContext = {
    org,
    invoiceNo: invoice.number,
    status: invoice.status,
    issuedAt: invoice.createdAt,
    dueAt: invoice.finalizedAt,
    customer: customerInfo,
    membership: membership
      ? {
          planName: membership.planName,
          joiningDate: membership.joiningDate,
          startDate: membership.startDate,
          endDate: membership.endDate
        }
      : null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPriceMinor,
      taxRate: Math.round(l.taxRateBps / 100), // Convert basis points to percentage
      discountAmount: l.discountMinor,
      lineTotal: l.lineTotalMinor
    })),
    subtotal: invoice.subtotalMinor,
    taxTotal: invoice.taxMinor,
    total: invoice.totalMinor,
    allocations: enrichedAllocations,
    paidAmount,
    outstanding,
    generatedAt: now
  }

  const html = renderInvoiceDocument(ctx)
  const downloadTime = new Date()
  const filename = buildFilename(customerInfo.name, invoice.number, downloadTime)
  const shouldOpen = input.mode !== 'save'

  return renderPdf(html, filename, 'Invoices', shouldOpen)
}

/* -------------------------------------------------------------------------- */
/* Payment Receipt Export                                                      */
/* -------------------------------------------------------------------------- */

export function exportReceiptPdf(input: {
  paymentId: number
  mode?: 'save' | 'preview'
}): Promise<string> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const payment = paymentRepo.getById(organizationId, input.paymentId)
  if (!payment) throw new NotFoundError('Payment not found')

  const customerInfo = getCustomerInfo(organizationId, payment.customerId)

  const allocations = allocationRepo.listByPayment(organizationId, input.paymentId)

  // Enrich allocations with invoice numbers
  const enrichedAllocations = allocations.map((alloc) => {
    const invoice = invoiceRepo.getById(organizationId, alloc.invoiceId)
    return {
      invoiceNo: invoice?.number ?? `INV-${alloc.invoiceId}`,
      amount: alloc.amountMinor
    }
  })

  const org = getOrgBranding(organizationId)
  const now = formatNow()

  // Fetch the user name for receivedBy (staff who recorded the payment)
  const createdByUser = getDrizzle()
    .select({ fullName: users.full_name })
    .from(users)
    .where(eq(users.id, payment.createdBy))
    .get() as { fullName: string } | undefined

  const paymentNo = `PAY-${String(payment.id).padStart(4, '0')}`

  const ctx: ReceiptPrintContext = {
    org,
    paymentNo,
    paymentDate: payment.paymentDate,
    amount: payment.amountMinor,
    method: payment.paymentMethod,
    reference: payment.reference,
    customer: customerInfo,
    allocations: enrichedAllocations,
    receivedBy: createdByUser?.fullName ?? 'System',
    generatedAt: now
  }

  const html = renderPaymentReceipt(ctx)
  const downloadTime = new Date()
  const filename = buildFilename(customerInfo.name, paymentNo, downloadTime)
  const shouldOpen = input.mode !== 'save'

  return renderPdf(html, filename, 'Receipts', shouldOpen)
}
