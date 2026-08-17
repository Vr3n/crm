import { CatalogStore } from './mock-data'
import type { Offer, OfferInput, Plan, PlanInput } from './types'

const delay = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 120))

/**
 * Async facade over the in-memory CatalogStore. Mirrors the future main-process
 * IPC seam (catalog:* channels) so components only ever await promises.
 */
export const catalogApi = {
  async listPlans(): Promise<Plan[]> {
    await delay()
    return CatalogStore.listPlans()
  },

  async createPlan(input: PlanInput): Promise<Plan> {
    await delay()
    return CatalogStore.createPlan(input)
  },

  async updatePlan(id: number, input: PlanInput): Promise<Plan> {
    await delay()
    return CatalogStore.updatePlan(id, input)
  },

  async deletePlan(id: number): Promise<void> {
    await delay()
    CatalogStore.deletePlan(id)
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