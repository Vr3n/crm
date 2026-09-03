import { withTransaction } from '../db/connection'
import { getDrizzle } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { ValidationError, NotFoundError, OverpaymentNotAllowedError } from '../domain/errors'
import { calculateSalePricing, type DiscountType } from '../domain/pricing'
import { deriveInvoicePrefix, formatDDMMYY } from '../domain/billing'
import { leadRepo, personRepo, stageRepo } from '../repositories/sales'
import { planRepo, offerRepo } from '../repositories/catalog'
import { customerRepo } from '../repositories/membership'
import { organizationRepo } from '../repositories/identity'
import { idempotencyRepo } from '../repositories/idempotency'
import { and, eq } from 'drizzle-orm'
import {
  memberships,
  invoices,
  invoiceLines,
  invoiceSequence,
  payments,
  paymentAllocations,
  offerRedemptions,
  leads,
  leadStages,
  leadActivities,
  leadActivityTypes,
  leadStageHistory,
  membershipEvents,
  idempotencyKeys,
  organizations
} from '../db/schema'
import { formatMinor, type CurrencyCode } from '../../shared/contracts/money'
import type {
  SellMembershipInput,
  SellMembershipResult
} from '../../shared/contracts/membership-sale'

function daysForDuration(duration: string): number {
  switch (duration) {
    case 'MONTHLY':
      return 30
    case 'QUARTERLY':
      return 90
    case 'HALF_YEARLY':
      return 180
    case 'YEARLY':
      return 365
    default:
      return 30
  }
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function sellMembership(input: SellMembershipInput): SellMembershipResult {
  requirePermission(PERMISSIONS.MEMBERSHIP_SELL)
  const organizationId = currentOrganizationId()
  const session = requireSession()
  const userId = session.userId
  const orgCurrency = (organizationRepo.findById(organizationId)?.currency ?? 'INR') as CurrencyCode

  const existing = idempotencyRepo.find(organizationId, input.transactionId)
  if (existing?.response) {
    try {
      return JSON.parse(existing.response) as SellMembershipResult
    } catch {
      // no-op
    }
  }
  if (input.discountType === 'NONE' && input.discountValueMinor !== null)
    throw new ValidationError('discountValue must be null when discountType is NONE')
  if (input.discountType !== 'NONE' && input.discountValueMinor === null)
    throw new ValidationError('discountValue is required when discountType is not NONE')
  const start = new Date(`${input.startDate}T00:00:00`)
  const end = new Date(`${input.endDate}T00:00:00`)
  const joining = new Date(`${input.joiningDate}T00:00:00`)
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(joining.getTime())
  )
    throw new ValidationError('Invalid joining, start, or end date')
  if (end < start) throw new ValidationError('End date cannot be before start date')

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  const person = personRepo.findById(organizationId, lead.personId)
  if (!person) throw new NotFoundError('Person not found for lead')

  const plan = planRepo.getById(organizationId, input.planId)
  if (!plan) throw new NotFoundError('Plan not found')
  if (!plan.active) throw new ValidationError('Plan is inactive')

  const expectedDays = daysForDuration(plan.duration)
  const minEnd = addDays(input.startDate, expectedDays - 1)
  if (input.endDate < minEnd)
    throw new ValidationError(
      `End date violates ${plan.duration} — should be at least ${minEnd} (${expectedDays} days)`
    )

  let offer: ReturnType<typeof offerRepo.getById> = null
  if (input.offerId !== null) {
    offer = offerRepo.getById(organizationId, input.offerId)
    if (!offer) throw new NotFoundError('Offer not found')
    if (!offer.active) throw new ValidationError('Offer is inactive')
    const today = new Date().toISOString().slice(0, 10)
    if (offer.validFrom > today) throw new ValidationError('Offer not yet valid')
    if (offer.validTo !== null && offer.validTo < today)
      throw new ValidationError('Offer has expired')
    if (offer.applicablePlanIds.length > 0 && !offer.applicablePlanIds.includes(plan.id))
      throw new ValidationError(`Offer "${offer.name}" does not apply to plan "${plan.name}"`)
    if (offer.maxUsage !== null) {
      const used = offerRepo.countRedemptions(organizationId, offer.id)
      if (used >= offer.maxUsage) throw new ValidationError('Offer has reached max usage')
    }
    if (offer.minPurchaseMinor !== null && input.basePriceMinor < offer.minPurchaseMinor)
      throw new ValidationError(
        `Offer requires minimum purchase ${formatMinor(offer.minPurchaseMinor, orgCurrency)}`
      )
  } else if (input.discountType !== 'NONE') {
    throw new ValidationError('Offer must be selected when discount is applied')
  }

  const pricing = calculateSalePricing({
    basePriceMinor: input.basePriceMinor,
    discountType: input.discountType as DiscountType,
    discountValueMinor: input.discountValueMinor
  })
  if (pricing.finalPriceMinor === 0)
    throw new ValidationError('Final price cannot be zero — use the Trial form')

  const result = withTransaction(() => {
    const db = getDrizzle()
    const insideExisting = idempotencyRepo.find(organizationId, input.transactionId)
    if (insideExisting?.response) {
      try {
        return JSON.parse(insideExisting.response) as SellMembershipResult
      } catch {
        // no-op
      }
    }

    let customer = customerRepo.getByPersonId(organizationId, person.id)
    if (!customer) {
      customer = customerRepo.create({
        organizationId,
        personId: person.id,
        billingName: person.fullName,
        billingPhone: person.phone,
        billingEmail: person.email,
        billingAddress: null,
        emergencyContact: null,
        notes: null
      })
    }

    const durationDays =
      Math.floor(
        (new Date(`${input.endDate}T00:00:00`).getTime() -
          new Date(`${input.startDate}T00:00:00`).getTime()) /
          86400000
      ) + 1

    const membershipRow = db
      .insert(memberships)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        plan_name_snapshot: plan.name,
        duration_days_snapshot: durationDays,
        base_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        final_price_minor: pricing.finalPriceMinor,
        tax_rate_bps: plan.taxRateBps,
        joining_date: input.joiningDate,
        start_date: input.startDate,
        end_date: input.endDate,
        billing_frequency: plan.billingFrequency,
        status: 'ACTIVE',
        created_by: userId
      })
      .returning()
      .get() as typeof memberships.$inferSelect
    const membershipId = membershipRow.id

    const invoiceDraft = db
      .insert(invoices)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        number: `DRAFT-${input.transactionId}`,
        status: 'DRAFT',
        billing_name: person.fullName,
        billing_phone: person.phone,
        billing_email: person.email,
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: 0,
        total_minor: pricing.finalPriceMinor,
        created_by: userId
      })
      .returning()
      .get() as typeof invoices.$inferSelect
    const invoiceId = invoiceDraft.id
    const taxAmountMinor = Math.round((pricing.finalPriceMinor * plan.taxRateBps) / 10000)
    const lineTotalMinor = pricing.finalPriceMinor + taxAmountMinor
    if (input.paidAmountMinor > lineTotalMinor) {
      throw new OverpaymentNotAllowedError(
        `Amount paid ${formatMinor(input.paidAmountMinor, orgCurrency)} exceeds invoice total ${formatMinor(lineTotalMinor, orgCurrency)}`
      )
    }
    db.insert(invoiceLines)
      .values({
        organization_id: organizationId,
        invoice_id: invoiceId,
        description: `${plan.name} (${input.startDate} — ${input.endDate})`,
        quantity: 1,
        unit_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        tax_rate_bps: plan.taxRateBps,
        tax_amount_minor: taxAmountMinor,
        line_total_minor: lineTotalMinor,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        sort_order: 0
      })
      .run()

    const org = organizationRepo.findById(organizationId)
    const orgInvoicePrefix =
      db
        .select({ org_invoice_prefix: organizations.org_invoice_prefix })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .get()?.org_invoice_prefix ?? null
    const prefix = deriveInvoicePrefix(org?.name ?? 'ORG', orgInvoicePrefix)
    const now = new Date()
    const ddmmYY = formatDDMMYY(now)
    const seqKey = ddmmYY
    const seqRow = db
      .select()
      .from(invoiceSequence)
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, seqKey),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .get() as typeof invoiceSequence.$inferSelect | undefined
    let nextVal = 1
    if (!seqRow) {
      db.insert(invoiceSequence)
        .values({ organization_id: organizationId, year: seqKey, prefix, last_value: 1 })
        .run()
      nextVal = 1
    } else {
      nextVal = (seqRow.last_value as number) + 1
      db.update(invoiceSequence)
        .set({ last_value: nextVal })
        .where(
          and(
            eq(invoiceSequence.organization_id, organizationId),
            eq(invoiceSequence.year, seqKey),
            eq(invoiceSequence.prefix, prefix)
          )
        )
        .run()
    }
    const invoiceNumber = `${prefix}-${ddmmYY}-${String(nextVal).padStart(2, '0')}`
    db.update(invoices)
      .set({
        number: invoiceNumber,
        status:
          input.paidAmountMinor === lineTotalMinor
            ? 'PAID'
            : input.paidAmountMinor === 0
              ? 'OPEN'
              : 'PARTIALLY_PAID',
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: taxAmountMinor,
        total_minor: lineTotalMinor,
        finalized_at: new Date().toISOString(),
        finalized_by: userId
      })
      .where(eq(invoices.id, invoiceId))
      .run()

    let paymentId = 0
    if (input.paidAmountMinor > 0) {
      const paymentRow = db
        .insert(payments)
        .values({
          organization_id: organizationId,
          customer_id: customer.id,
          payment_date: new Date().toISOString().slice(0, 10),
          amount_minor: input.paidAmountMinor,
          payment_method: input.paymentMethod,
          created_by: userId
        })
        .returning()
        .get() as typeof payments.$inferSelect
      paymentId = paymentRow.id
      const allocAmount = Math.min(input.paidAmountMinor, lineTotalMinor)
      db.insert(paymentAllocations)
        .values({
          organization_id: organizationId,
          payment_id: paymentId,
          invoice_id: invoiceId,
          amount_minor: allocAmount,
          created_by: userId
        })
        .run()
    }

    const wonStage = db
      .select()
      .from(leadStages)
      .where(and(eq(leadStages.organization_id, organizationId), eq(leadStages.is_won, true)))
      .get() as typeof leadStages.$inferSelect | undefined
    const currentStage = stageRepo.findById(organizationId, lead.currentStageId)
    if (!currentStage) throw new NotFoundError('Current lead stage not found')
    if (currentStage.isLost) throw new ValidationError('A lost lead cannot be sold')

    if (wonStage && !currentStage.isWon) {
      const noteType = db
        .select()
        .from(leadActivityTypes)
        .where(
          and(
            eq(leadActivityTypes.organization_id, organizationId),
            eq(leadActivityTypes.name, 'NOTE')
          )
        )
        .get() as typeof leadActivityTypes.$inferSelect | undefined
      if (!noteType) throw new NotFoundError('NOTE activity type is not configured')
      const conversionActivity = db
        .insert(leadActivities)
        .values({
          organization_id: organizationId,
          lead_id: lead.id,
          type_id: noteType.id,
          note: `Membership sold: ${plan.name} ${input.startDate} → ${input.endDate}`,
          occurred_at: new Date().toISOString(),
          created_by: userId
        })
        .returning({ id: leadActivities.id })
        .get()

      db.update(leads)
        .set({
          customer_id: customer.id,
          current_stage_id: wonStage.id,
          updated_at: new Date().toISOString()
        })
        .where(and(eq(leads.organization_id, organizationId), eq(leads.id, lead.id)))
        .run()
      db.insert(leadStageHistory)
        .values({
          organization_id: organizationId,
          lead_id: lead.id,
          from_stage_id: lead.currentStageId,
          to_stage_id: wonStage.id,
          activity_id: conversionActivity.id,
          reason: null,
          changed_by: userId
        })
        .run()
    } else {
      db.update(leads)
        .set({ customer_id: customer.id })
        .where(and(eq(leads.organization_id, organizationId), eq(leads.id, lead.id)))
        .run()
    }

    db.insert(membershipEvents)
      .values({
        organization_id: organizationId,
        membership_id: membershipId,
        type: 'CREATED',
        data: JSON.stringify({ source: 'MEMBERSHIP_SALE', leadId: lead.id, invoiceId }),
        created_by: userId
      })
      .run()

    if (offer) {
      db.insert(offerRedemptions)
        .values({
          organization_id: organizationId,
          offer_id: offer.id,
          membership_id: membershipId,
          invoice_id: invoiceId,
          applied_discount_minor: pricing.discountMinor,
          created_by: userId
        })
        .run()
    }

    const res: SellMembershipResult = {
      membershipId,
      customerId: customer.id,
      invoiceId,
      invoiceNumber,
      paymentId
    }
    db.insert(idempotencyKeys)
      .values({
        organization_id: organizationId,
        key: input.transactionId,
        response: JSON.stringify(res)
      })
      .run()
    return res
  })

  return result
}
