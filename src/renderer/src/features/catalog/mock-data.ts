import type { Offer, OfferInput, Plan, PlanInput } from './types'

let planId = 0
let offerId = 0

const nextPlanId = (): number => ++planId
const nextOfferId = (): number => ++offerId

const seedPlans: Plan[] = [
  {
    id: nextPlanId(),
    name: 'Basic Monthly',
    duration: 'MONTHLY',
    billing: 'ONE_TIME',
    basePrice: 1500,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    isActive: true,
    description: 'Gym-floor access across all equipment zones.',
    createdAt: '2026-01-05'
  },
  {
    id: nextPlanId(),
    name: 'Student Monthly',
    duration: 'MONTHLY',
    billing: 'ONE_TIME',
    basePrice: 1200,
    accessWindow: 'TIMED',
    startTime: '07:00',
    endTime: '17:00',
    isActive: true,
    description: 'Off-peak floor access for students with a valid college ID.',
    createdAt: '2026-01-05'
  },
  {
    id: nextPlanId(),
    name: 'Yoga Studio',
    duration: 'MONTHLY',
    billing: 'ONE_TIME',
    basePrice: 1800,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    isActive: true,
    description: 'Yoga floor, mat sessions and the meditation hall.',
    createdAt: '2026-02-12'
  },
  {
    id: nextPlanId(),
    name: 'Premium Quarterly',
    duration: 'QUARTERLY',
    billing: 'ONE_TIME',
    basePrice: 3900,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    isActive: true,
    description: 'Full facility for 3 months at a better per-month rate.',
    createdAt: '2026-01-05'
  },
  {
    id: nextPlanId(),
    name: 'Premium Half Yearly',
    duration: 'HALF_YEARLY',
    billing: 'ONE_TIME',
    basePrice: 7400,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    isActive: true,
    description: 'Six months of full-facility access.',
    createdAt: '2026-01-05'
  },
  {
    id: nextPlanId(),
    name: 'Annual Premium',
    duration: 'YEARLY',
    billing: 'ONE_TIME',
    basePrice: 24000,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    isActive: true,
    description: 'The flagship year-long membership at the best per-month rate.',
    createdAt: '2026-01-05'
  },
  {
    id: nextPlanId(),
    name: 'Weekend Access',
    duration: 'MONTHLY',
    billing: 'ONE_TIME',
    basePrice: 900,
    accessWindow: 'TIMED',
    startTime: '08:00',
    endTime: '20:00',
    isActive: false,
    description: 'Weekend-only floor access. Paused while the weekend bootcamps run.',
    createdAt: '2026-03-01'
  }
]

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

let plans: Plan[] = [...seedPlans]
let offers: Offer[] = [...seedOffers]

export const CatalogStore = {
  listPlans(): Plan[] {
    return [...plans]
  },

  createPlan(input: PlanInput): Plan {
    const plan: Plan = { ...input, id: nextPlanId(), createdAt: new Date().toISOString().slice(0, 10) }
    plans = [plan, ...plans]
    return plan
  },

  updatePlan(id: number, input: PlanInput): Plan {
    plans = plans.map((plan) => (plan.id === id ? { ...plan, ...input } : plan))
    return plans.find((plan) => plan.id === id) as Plan
  },

  deletePlan(id: number): void {
    plans = plans.filter((plan) => plan.id !== id)
    offers = offers.map((offer) => ({
      ...offer,
      applicablePlanIds: offer.applicablePlanIds.filter((planId) => planId !== id)
    }))
  },

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