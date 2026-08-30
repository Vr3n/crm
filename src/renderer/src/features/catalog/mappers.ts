import type {
  CancellationPolicyRow,
  CreateFreezePolicyInput,
  CreateOfferInput,
  CreatePlanInput,
  FreezePolicyRow,
  OfferRow,
  OfferVersionRow,
  PlanRow,
  PlanVersionRow,
  PolicyLookupSet,
  ProrationPolicyRow
} from '../../../../shared/contracts/catalog'
import type {
  CancellationPolicy,
  FreezePolicy,
  Offer,
  OfferInput,
  OfferVersion,
  Plan,
  PlanInput,
  PlanVersion,
  PolicyLookups,
  ProrationPolicy
} from './types'
import { toRupees, fromRupees } from '../../../../shared/contracts/money'

/**
 * Catalog wire → display mapping (README "Renderer API layer"). Api methods
 * return the shared-contract wire shape exactly (paise, ISO dates, `active`);
 * every rupee/date/enum reconciliation happens here so components stay clean.
 */

const bpsToPercent = (bps: number): number => bps / 100
const percentToBps = (percent: number): number => Math.round(percent * 100)

/** A stable display code derived from the offer name — never stored on the wire. */
export const codeFromName = (name: string): string =>
  name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_-]/g, '')

export function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    duration: row.duration,
    billing: row.billingFrequency,
    basePrice: toRupees(row.basePriceMinor),
    accessWindow: row.accessWindow,
    startTime: row.startTime ?? '06:00',
    endTime: row.endTime ?? '23:00',
    taxCode: row.taxCode,
    taxRate: bpsToPercent(row.taxRateBps),
    registrationFee: toRupees(row.registrationFeeMinor),
    freezePolicyId: row.freezePolicyId,
    prorationPolicyId: row.prorationPolicyId,
    cancellationPolicyId: row.cancellationPolicyId,
    isActive: row.isActive,
    description: row.description ?? '',
    createdAt: row.createdAt
  }
}

export function mapPlanInput(input: PlanInput): CreatePlanInput {
  return {
    name: input.name,
    description: input.description,
    duration: input.duration,
    billingFrequency: input.billing,
    basePriceMinor: fromRupees(input.basePrice),
    accessWindow: input.accessWindow,
    startTime: input.startTime,
    endTime: input.endTime,
    taxCode: input.taxCode,
    taxRateBps: percentToBps(input.taxRate),
    registrationFeeMinor: fromRupees(input.registrationFee),
    freezePolicyId: input.freezePolicyId,
    prorationPolicyId: input.prorationPolicyId,
    cancellationPolicyId: input.cancellationPolicyId,
    isActive: input.isActive
  }
}

function offerValueFromMinor(discountType: Offer['discountType'], valueMinor: number): number {
  if (discountType === 'PERCENTAGE' || discountType === 'FREE_PERIOD') return valueMinor
  return toRupees(valueMinor)
}

export function mapOfferRow(row: OfferRow): Offer {
  return {
    id: row.id,
    name: row.name,
    code: codeFromName(row.name),
    description: row.description ?? '',
    discountType: row.discountType,
    value: offerValueFromMinor(row.discountType, row.valueMinor),
    applicablePlanIds: row.applicablePlanIds,
    minPurchase: row.minPurchaseMinor == null ? 0 : toRupees(row.minPurchaseMinor),
    maxUses: row.maxUsage ?? 0,
    usedCount: row.usedCount,
    startDate: row.validFrom,
    endDate: row.validTo,
    isActive: row.active,
    eligibility: row.eligibility ?? '',
    createdAt: row.createdAt
  }
}

function offerValueToMinor(discountType: Offer['discountType'], value: number): number {
  if (discountType === 'PERCENTAGE' || discountType === 'FREE_PERIOD') return Math.round(value)
  return fromRupees(value)
}

export function mapOfferInput(input: OfferInput): CreateOfferInput {
  return {
    name: input.name,
    description: input.description,
    discountType: input.discountType,
    valueMinor: offerValueToMinor(input.discountType, input.value),
    applicablePlanIds: input.applicablePlanIds,
    eligibility: input.eligibility,
    validFrom: input.startDate,
    validTo: input.endDate || null,
    maxUsage: input.maxUses > 0 ? input.maxUses : null,
    minPurchaseMinor: fromRupees(input.minPurchase),
    active: input.isActive
  }
}

export function mapPlanVersionRow(row: PlanVersionRow): PlanVersion {
  return {
    id: row.id,
    planId: row.planId,
    basePrice: toRupees(row.basePriceMinor),
    taxRate: bpsToPercent(row.taxRateBps),
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt
  }
}

export function mapOfferVersionRow(row: OfferVersionRow): OfferVersion {
  return {
    id: row.id,
    offerId: row.offerId,
    discountType: row.discountType,
    value: offerValueFromMinor(row.discountType, row.valueMinor),
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt
  }
}

function mapFreezePolicyRow(row: FreezePolicyRow): FreezePolicy {
  return {
    id: row.id,
    name: row.name,
    billingBehavior: row.billingBehavior,
    accessBehavior: row.accessBehavior,
    extendOrCredit: row.extendOrCredit,
    fee: toRupees(row.feeMinor),
    freeFreezeCountPerYear: row.freeFreezeCountPerYear,
    description: row.description
  }
}

function mapProrationPolicyRow(row: ProrationPolicyRow): ProrationPolicy {
  return {
    id: row.id,
    name: row.name,
    rule: row.rule,
    description: row.description
  }
}

function mapCancellationPolicyRow(row: CancellationPolicyRow): CancellationPolicy {
  return {
    id: row.id,
    name: row.name,
    effectiveRule: row.effectiveRule,
    noticeDays: row.noticeDays,
    description: row.description
  }
}

export function mapPolicyLookupSet(set: PolicyLookupSet): PolicyLookups {
  return {
    freezePolicies: set.freezePolicies.map(mapFreezePolicyRow),
    prorationPolicies: set.prorationPolicies.map(mapProrationPolicyRow),
    cancellationPolicies: set.cancellationPolicies.map(mapCancellationPolicyRow)
  }
}

/** The policy-creation inputs (used by the admin screen when it lands). */
export function mapFreezePolicyCreateInput(input: Omit<FreezePolicy, 'id'>): CreateFreezePolicyInput {
  return {
    name: input.name,
    billingBehavior: input.billingBehavior,
    accessBehavior: input.accessBehavior,
    extendOrCredit: input.extendOrCredit,
    feeMinor: fromRupees(input.fee),
    freeFreezeCountPerYear: input.freeFreezeCountPerYear,
    description: input.description ?? undefined
  }
}