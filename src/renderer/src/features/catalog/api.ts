import { CatalogStore } from './mock-data'
import type { CreatePlanInput, PlanRow } from '../../../../shared/contracts/catalog'
import type { Offer, OfferInput, Plan, PlanInput } from './types'

/**
 * Async facade over the IPC bridge for the Plans surface (Module 03). Prices are
 * transported as integer minor units (`basePriceMinor`) per the accounting rules;
 * this seam converts rupees (display) ↔ paise (wire). Offers remain on the
 * in-memory `CatalogStore` until the Module 03 offers backend lands.
 */
const minorToRupees = (minor: number): number => minor / 100
const rupeesToMinor = (rupees: number): number => Math.round(rupees * 100)

function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    duration: row.duration,
    billing: row.billingFrequency,
    basePrice: minorToRupees(row.basePriceMinor),
    accessWindow: row.accessWindow,
    startTime: row.startTime ?? '06:00',
    endTime: row.endTime ?? '23:00',
    isActive: row.isActive,
    description: row.description ?? '',
    createdAt: row.createdAt
  }
}

function mapPlanInput(input: PlanInput): CreatePlanInput {
  return {
    name: input.name,
    description: input.description,
    duration: input.duration,
    billingFrequency: input.billing,
    basePriceMinor: rupeesToMinor(input.basePrice),
    accessWindow: input.accessWindow,
    startTime: input.startTime,
    endTime: input.endTime,
    isActive: input.isActive
  }
}

const delay = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 120))

export const catalogApi = {
  async listPlans(): Promise<Plan[]> {
    const rows = await window.api.catalog.listPlans()
    return rows.map(mapPlanRow)
  },

  async createPlan(input: PlanInput): Promise<Plan> {
    const row = await window.api.catalog.createPlan(mapPlanInput(input))
    return mapPlanRow(row)
  },

  async updatePlan(id: number, input: PlanInput): Promise<Plan> {
    const row = await window.api.catalog.updatePlan({ planId: id, ...mapPlanInput(input) })
    return mapPlanRow(row)
  },

  async deletePlan(id: number): Promise<void> {
    await window.api.catalog.deletePlan({ planId: id })
  },

  async listOffers(): Promise<Offer[]> {
    await delay()
    return CatalogStore.listOffers()
  },

  async createOffer(input: OfferInput): Promise<Offer> {
    await delay()
    return CatalogStore.createOffer(input)
  },

  async updateOffer(id: number, input: OfferInput): Promise<Offer> {
    await delay()
    return CatalogStore.updateOffer(id, input)
  },

  async deleteOffer(id: number): Promise<void> {
    await delay()
    CatalogStore.deleteOffer(id)
  }
}
