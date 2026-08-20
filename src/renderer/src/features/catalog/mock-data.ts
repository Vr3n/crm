import type { Offer, OfferInput } from './types'

let offerId = 0

const nextOfferId = (): number => ++offerId

const seedOffers: Offer[] = [
  {
    id: nextOfferId(),
    name: 'New Year Offer',
    code: 'NEWYEAR20',
    discountType: 'PERCENTAGE',
    value: 20,
    applicablePlanIds: [6],
    minPurchase: 0,
    maxUses: 100,
    usedCount: 47,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isActive: true,
    eligibility: 'New joiners and renewals',
    createdAt: '2025-12-20'
  },
  {
    id: nextOfferId(),
    name: 'Referral Credit',
    code: 'REFER500',
    discountType: 'FIXED_AMOUNT',
    value: 500,
    applicablePlanIds: [],
    minPurchase: 1500,
    maxUses: 200,
    usedCount: 88,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isActive: true,
    eligibility: 'Existing members who refer a friend',
    createdAt: '2026-01-02'
  },
  {
    id: nextOfferId(),
    name: 'Summer Slam',
    code: 'SUMMER1500',
    discountType: 'FIXED_AMOUNT',
    value: 1500,
    applicablePlanIds: [5],
    minPurchase: 7400,
    maxUses: 50,
    usedCount: 12,
    startDate: '2026-05-01',
    endDate: '2026-07-31',
    isActive: true,
    eligibility: 'Half-yearly signups during summer',
    createdAt: '2026-04-10'
  },
  {
    id: nextOfferId(),
    name: 'Festive Free Month',
    code: 'FESTIVE1',
    discountType: 'FREE_PERIOD',
    value: 1,
    applicablePlanIds: [1, 2],
    minPurchase: 0,
    maxUses: 40,
    usedCount: 0,
    startDate: '2026-08-20',
    endDate: '2026-09-20',
    isActive: true,
    eligibility: 'First purchase on monthly plans',
    createdAt: '2026-08-01'
  },
  {
    id: nextOfferId(),
    name: 'Founder Early Bird',
    code: 'FOUNDER10',
    discountType: 'PERCENTAGE',
    value: 10,
    applicablePlanIds: [],
    minPurchase: 0,
    maxUses: 150,
    usedCount: 19,
    startDate: '2026-06-01',
    endDate: '2026-09-30',
    isActive: false,
    eligibility: 'Pre-launch signups',
    createdAt: '2026-05-15'
  },
  {
    id: nextOfferId(),
    name: 'Black Friday Blitz',
    code: 'BLACKFRI25',
    discountType: 'OVERRIDE_PRICE',
    value: 17500,
    applicablePlanIds: [6],
    minPurchase: 0,
    maxUses: 30,
    usedCount: 0,
    startDate: '2026-11-20',
    endDate: '2026-11-30',
    isActive: true,
    eligibility: 'Annual Premium at a flat price',
    createdAt: '2026-07-25'
  }
]

let offers: Offer[] = [...seedOffers]

/**
 * In-memory store for the OFFERS surface only. Plans moved to the real SQLite
 * backend (Module 03) — see `api.ts` for the IPC-backed plan facade. The
 * `applicablePlanIds` above reference the seeded membership_plans ids; they are
 * illustrative mock data until the offers backend lands.
 */
export const CatalogStore = {
  listOffers(): Offer[] {
    return [...offers]
  },

  createOffer(input: OfferInput): Offer {
    const offer: Offer = {
      ...input,
      id: nextOfferId(),
      usedCount: 0,
      createdAt: new Date().toISOString().slice(0, 10)
    }
    offers = [offer, ...offers]
    return offer
  },

  updateOffer(id: number, input: OfferInput): Offer {
    offers = offers.map((offer) => (offer.id === id ? { ...offer, ...input } : offer))
    return offers.find((offer) => offer.id === id) as Offer
  },

  deleteOffer(id: number): void {
    offers = offers.filter((offer) => offer.id !== id)
  }
}
