import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { customerRepo } from '../repositories/membership'
import { invoiceRepo } from '../repositories/billing'
import {
  paymentRepo,
  paymentMethodRepo,
  allocationRepo,
  refundRepo,
  creditRepo,
  creditAllocationRepo
} from '../repositories/finance'
import { PaymentAllocationService } from '../domain/finance'
import {
  PaymentOverAllocatedError,
  RefundExceedsPaymentError,
  CreditExceedsBalanceError,
  NotFoundError,
  ValidationError
} from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type { InvoiceStatus } from '../domain/billing'

/**
 * Module 05 (Finance) application use cases. Each Command gates on a permission,
 * derives the org/user from the session, and owns one `withTransaction` boundary.
 */

function mapPaymentToRow(payment: ReturnType<typeof paymentRepo.getById> extends infer T ? NonNullable<T> : never) {
  return {
    id: payment.id,
    customerId: payment.customerId,
    paymentDate: payment.paymentDate,
    amountMinor: payment.amountMinor,
    paymentMethod: payment.paymentMethod,
    reference: payment.reference,
    notes: payment.notes,
    createdAt: payment.createdAt
  }
}

function mapRefundToRow(refund: ReturnType<typeof refundRepo.getByPayment> extends infer T ? NonNullable<T>[number] : never) {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    amountMinor: refund.amountMinor,
    reason: refund.reason,
    createdAt: refund.createdAt
  }
}

function mapCreditToRow(credit: ReturnType<typeof creditRepo.getById> extends infer T ? NonNullable<T> : never) {
  return {
    id: credit.id,
    customerId: credit.customerId,
    amountMinor: credit.amountMinor,
    remainingMinor: credit.remainingMinor,
    reason: credit.reason,
    expiresAt: credit.expiresAt,
    createdAt: credit.createdAt
  }
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/** Records a payment from a customer. */
export function recordPayment(input: {
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference?: string | null
  notes?: string | null
}) {
  requirePermission(PERMISSIONS.PAYMENT_RECORD)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')

  if (input.amountMinor <= 0) throw new ValidationError('Payment amount must be positive')

  const payment = paymentRepo.create({
    organizationId,
    customerId: input.customerId,
    paymentDate: input.paymentDate,
    amountMinor: input.amountMinor,
    paymentMethod: input.paymentMethod,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    createdBy: userId
  })

  return mapPaymentToRow(payment)
}

/** Allocates a payment (or part of it) to an invoice. */
export function allocatePayment(input: {
  paymentId: number
  invoiceId: number
  amountMinor: number
}) {
  requirePermission(PERMISSIONS.PAYMENT_ALLOCATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const payment = paymentRepo.getById(organizationId, input.paymentId)
    if (!payment) throw new NotFoundError('Payment not found')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'PAID') {
      throw new ValidationError(`Cannot allocate to invoice in ${invoice.status} status`)
    }

    // Check existing allocations for this payment
    const existingAllocations = allocationRepo.listByPayment(organizationId, input.paymentId)

    // Calculate invoice outstanding
    const invoiceAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const invoiceRefunds = refundRepo.getByPayment(organizationId, payment.id)
    const netAllocated = PaymentAllocationService.calculateNetAllocated(invoiceAllocations, invoiceRefunds)
    const outstanding = PaymentAllocationService.calculateOutstanding(invoice.totalMinor, netAllocated)

    // Validate allocation
    PaymentAllocationService.validateAllocation(
      payment.amountMinor,
      existingAllocations,
      input.amountMinor,
      outstanding
    )

    // Handle overpayment: cap at outstanding
    const { allocatedToInvoice, unallocatedRemainder } = PaymentAllocationService.handleOverpayment(
      input.amountMinor,
      input.amountMinor,
      outstanding
    )

    // Create allocation
    const allocation = allocationRepo.create({
      organizationId,
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      amountMinor: allocatedToInvoice,
      createdBy: userId
    })

    // Re-derive invoice status
    const newAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const newRefunds = refundRepo.getByPayment(organizationId, payment.id)
    const newNetAllocated = PaymentAllocationService.calculateNetAllocated(newAllocations, newRefunds)
    const newStatus = PaymentAllocationService.deriveInvoiceStatus(newNetAllocated, invoice.totalMinor)

    invoiceRepo.updateStatus(organizationId, input.invoiceId, newStatus)

    return {
      allocation: {
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      unallocatedRemainder,
      invoiceStatus: newStatus
    }
  })
}

/**
 * Records a payment and allocates it to an invoice in one transaction.
 * This is the convenience command for the common "customer pays now" case
 * (Module 07 §46).
 */
export function recordAndAllocatePayment(input: {
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  invoiceId: number
  reference?: string | null
  notes?: string | null
}) {
  requirePermission(PERMISSIONS.PAYMENT_RECORD)
  requirePermission(PERMISSIONS.PAYMENT_ALLOCATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const customer = customerRepo.getById(organizationId, input.customerId)
    if (!customer) throw new NotFoundError('Customer not found')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.customerId !== input.customerId) {
      throw new ValidationError('Invoice does not belong to this customer')
    }

    // Create payment
    const payment = paymentRepo.create({
      organizationId,
      customerId: input.customerId,
      paymentDate: input.paymentDate,
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: userId
    })

    // Calculate outstanding
    const invoiceAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const invoiceRefunds = refundRepo.getByPayment(organizationId, payment.id)
    const netAllocated = PaymentAllocationService.calculateNetAllocated(invoiceAllocations, invoiceRefunds)
    const outstanding = PaymentAllocationService.calculateOutstanding(invoice.totalMinor, netAllocated)

    // Validate and handle overpayment
    const existingAllocations = allocationRepo.listByPayment(organizationId, payment.id)
    PaymentAllocationService.validateAllocation(
      payment.amountMinor,
      existingAllocations,
      input.amountMinor,
      outstanding
    )

    const { allocatedToInvoice, unallocatedRemainder } = PaymentAllocationService.handleOverpayment(
      input.amountMinor,
      input.amountMinor,
      outstanding
    )

    // Create allocation
    const allocation = allocationRepo.create({
      organizationId,
      paymentId: payment.id,
      invoiceId: input.invoiceId,
      amountMinor: allocatedToInvoice,
      createdBy: userId
    })

    // Re-derive invoice status
    const newAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const newRefunds = refundRepo.getByPayment(organizationId, payment.id)
    const newNetAllocated = PaymentAllocationService.calculateNetAllocated(newAllocations, newRefunds)
    const newStatus = PaymentAllocationService.deriveInvoiceStatus(newNetAllocated, invoice.totalMinor)

    invoiceRepo.updateStatus(organizationId, input.invoiceId, newStatus)

    return {
      payment: mapPaymentToRow(payment),
      allocation: {
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      unallocatedRemainder,
      invoiceStatus: newStatus
    }
  })
}

/** Issues a refund against a payment. Re-derives invoice state. */
export function issueRefund(input: {
  paymentId: number
  amountMinor: number
  reason: string
}) {
  requirePermission(PERMISSIONS.REFUND_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const payment = paymentRepo.getById(organizationId, input.paymentId)
    if (!payment) throw new NotFoundError('Payment not found')

    // Calculate net paid (payments - existing refunds)
    const existingRefunds = refundRepo.getByPayment(organizationId, input.paymentId)
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amountMinor, 0)
    const netPaid = payment.amountMinor - totalRefunded

    // Validate refund
    PaymentAllocationService.validateRefund(netPaid, input.amountMinor)

    // Create refund
    const refund = refundRepo.create({
      organizationId,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      createdBy: userId
    })

    // Re-derive status for all invoices allocated to by this payment
    const allocations = allocationRepo.listByPayment(organizationId, input.paymentId)
    const affectedInvoiceIds = new Set(allocations.map((a) => a.invoiceId))

    for (const invoiceId of affectedInvoiceIds) {
      const invoice = invoiceRepo.getById(organizationId, invoiceId)
      if (!invoice || invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') continue

      const invoiceAllocations = allocationRepo.listByInvoice(organizationId, invoiceId)
      const invoiceRefunds = refundRepo.getByPayment(organizationId, payment.id)
      const netAllocated = PaymentAllocationService.calculateNetAllocated(invoiceAllocations, invoiceRefunds)
      const newStatus = PaymentAllocationService.deriveInvoiceStatus(netAllocated, invoice.totalMinor)

      invoiceRepo.updateStatus(organizationId, invoiceId, newStatus)
    }

    return mapRefundToRow(refund)
  })
}

/** Issues a credit to a customer's account. */
export function issueCredit(input: {
  customerId: number
  amountMinor: number
  reason: string
  expiresAt?: string | null
}) {
  requirePermission(PERMISSIONS.CREDIT_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')

  if (input.amountMinor <= 0) throw new ValidationError('Credit amount must be positive')

  const credit = creditRepo.create({
    organizationId,
    customerId: input.customerId,
    amountMinor: input.amountMinor,
    reason: input.reason,
    expiresAt: input.expiresAt ?? null,
    createdBy: userId
  })

  return mapCreditToRow(credit)
}

/** Applies credit to an invoice. Decrements remaining and re-derives invoice state. */
export function applyCredit(input: {
  creditId: number
  invoiceId: number
  amountMinor: number
}) {
  requirePermission(PERMISSIONS.CREDIT_APPLY)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const credit = creditRepo.getById(organizationId, input.creditId)
    if (!credit) throw new NotFoundError('Credit not found')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'PAID') {
      throw new ValidationError(`Cannot apply credit to invoice in ${invoice.status} status`)
    }

    // Validate credit application
    PaymentAllocationService.validateCreditApplication(credit.remainingMinor, input.amountMinor)

    // Create credit allocation
    const allocation = creditAllocationRepo.create({
      organizationId,
      creditId: input.creditId,
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      createdBy: userId
    })

    // Decrement remaining
    creditRepo.decrementRemaining(organizationId, input.creditId, input.amountMinor)

    return {
      allocation: {
        id: allocation.id,
        creditId: allocation.creditId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      creditRemaining: credit.remainingMinor - input.amountMinor
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Gets the payment state of an invoice. */
export function getInvoicePaymentState(input: { invoiceId: number }) {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')

  const allocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
  const refunds = refundRepo.getByPayment(organizationId, 0) // We need all refunds for this invoice's payments
  // Actually we need refunds for all payments allocated to this invoice
  const allRefunds: Array<{ amountMinor: number }> = []
  for (const alloc of allocations) {
    const paymentRefunds = refundRepo.getByPayment(organizationId, alloc.paymentId)
    allRefunds.push(...paymentRefunds)
  }

  const netAllocated = PaymentAllocationService.calculateNetAllocated(allocations, allRefunds)
  const outstanding = PaymentAllocationService.calculateOutstanding(invoice.totalMinor, netAllocated)

  return {
    invoiceId: invoice.id,
    totalMinor: invoice.totalMinor,
    allocatedMinor: netAllocated,
    refundedMinor: allRefunds.reduce((sum, r) => sum + r.amountMinor, 0),
    outstandingMinor: outstanding,
    status: invoice.status
  }
}

/** Gets payment history for a customer. */
export function getPaymentHistory(input: { customerId: number }) {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const payments = paymentRepo.getByCustomer(organizationId, input.customerId)
  return payments.map(mapPaymentToRow)
}

/** Gets refund history for a payment. */
export function getRefundHistory(input: { paymentId: number }) {
  requirePermission(PERMISSIONS.REFUND_VIEW)
  const organizationId = currentOrganizationId()

  const refunds = refundRepo.getByPayment(organizationId, input.paymentId)
  return refunds.map(mapRefundToRow)
}

/** Gets the credit balance for a customer. */
export function getCreditBalance(input: { customerId: number }) {
  requirePermission(PERMISSIONS.CREDIT_VIEW)
  const organizationId = currentOrganizationId()

  return creditRepo.getBalance(organizationId, input.customerId)
}

/** Lists all credits for a customer. */
export function listCredits(input: { customerId: number }) {
  requirePermission(PERMISSIONS.CREDIT_VIEW)
  const organizationId = currentOrganizationId()

  const credits = creditRepo.getByCustomer(organizationId, input.customerId)
  return credits.map(mapCreditToRow)
}

/** Lists active payment methods. */
export function listPaymentMethods() {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const methods = paymentMethodRepo.listActive(organizationId)
  return methods.map((m) => ({ id: m.id, name: m.name, sortOrder: m.sortOrder, active: m.active }))
}
