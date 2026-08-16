import type { MembershipExpiration, PaymentDue, PersonRef } from './types'

/**
 * Seed data for the member-facing dashboard rows.
 *
 * Timestamps are relative to "now" so the "n days remaining" figures feel live
 * and the date-range filters behave. The data is intentionally realistic — a
 * mix of overdue, due-soon and far-out rows — so the urgency styling and the
 * data-table controls (search, date-range, pagination, sorting) all have
 * something to act on. This is mock data for Modules 02–05 which aren't built
 * yet; the real rows will be read models over the transactional tables.
 */

const days = (n: number): string => new Date(Date.now() + n * 86400000).toISOString()
const daysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString()

const P = (name: string, phone: string, email?: string): PersonRef => ({
  id: `m${name}`,
  name,
  phone,
  email
})

const people: Record<string, PersonRef> = {
  rohit: P('Rohit Sharma', '+91 98220 11445', 'rohit.sharma@example.com'),
  anjali: P('Anjali Mehta', '+91 99870 55231', 'anjali.mehta@example.com'),
  vikram: P('Vikram Singh', '+91 98110 22098', 'vikram.s@example.com'),
  sneha: P('Sneha Kulkarni', '+91 99200 77889', 'sneha.k@example.com'),
  arjun: P('Arjun Nair', '+91 90040 33211', 'arjun.nair@example.com'),
  kavya: P('Kavya Reddy', '+91 97010 66544', 'kavya.r@example.com'),
  manoj: P('Manoj Verma', '+91 98490 12780', 'manoj.v@example.com'),
  priya: P('Priya Deshmukh', '+91 98989 09090', 'priya.d@example.com'),
  deepak: P('Deepak Patel', '+91 98765 43210', 'deepak.p@example.com'),
  rekha: P('Rekha Iyer', '+91 99876 54321'),
  siddharth: P('Siddharth Rao', '+91 98654 32109', 'sid.rao@example.com'),
  meera: P('Meera Nambiar', '+91 97531 24680', 'meera.n@example.com'),
  tarun: P('Tarun Khanna', '+91 96420 13579'),
  divya: P('Divya Menon', '+91 95313 57911', 'divya.m@example.com'),
  gaurav: P('Gaurav Joshi', '+91 94220 46688', 'gaurav.j@example.com'),
  pallavi: P('Pallavi Gupta', '+91 93112 99877', 'pallavi.g@example.com'),
  hitesh: P('Hitesh Bansal', '+91 92004 55221'),
  namrata: P('Namrata Shah', '+91 98908 77665', 'namrata.s@example.com'),
  farhan: P('Farhan Ansari', '+91 97000 12345', 'farhan.a@example.com'),
  shalini: P('Shalini Raghunath', '+91 98123 90909'),
  varun: P('Varun Malhotra', '+91 99222 33445', 'varun.m@example.com'),
  isha: P('Isha Bhatt', '+91 90090 80807', 'isha.b@example.com'),
  raghav: P('Raghav Kumar', '+91 98777 66776'),
  tina: P('Tina Fernandes', '+91 99888 77665', 'tina.f@example.com')
}

const PLANS = [
  'Annual Premium',
  'Half-Yearly',
  'Quarterly Flex',
  'Personal Training',
  'Annual Plus'
]

export const SEED_EXPIRATIONS: MembershipExpiration[] = [
  {
    id: 'e1',
    member: people.vikram,
    plan: PLANS[0],
    purchasedAt: daysAgo(355),
    expiresAt: days(-10)
  },
  {
    id: 'e2',
    member: people.raghav,
    plan: PLANS[2],
    purchasedAt: daysAgo(85),
    expiresAt: days(-4)
  },
  {
    id: 'e3',
    member: people.kavya,
    plan: PLANS[0],
    purchasedAt: daysAgo(340),
    expiresAt: days(-1)
  },
  { id: 'e4', member: people.tina, plan: PLANS[3], purchasedAt: daysAgo(88), expiresAt: days(2) },
  { id: 'e5', member: people.rohit, plan: PLANS[0], purchasedAt: daysAgo(320), expiresAt: days(5) },
  { id: 'e6', member: people.divya, plan: PLANS[1], purchasedAt: daysAgo(172), expiresAt: days(8) },
  {
    id: 'e7',
    member: people.anjali,
    plan: PLANS[0],
    purchasedAt: daysAgo(300),
    expiresAt: days(12)
  },
  {
    id: 'e8',
    member: people.hitesh,
    plan: PLANS[4],
    purchasedAt: daysAgo(310),
    expiresAt: days(15)
  },
  {
    id: 'e9',
    member: people.priya,
    plan: PLANS[2],
    purchasedAt: daysAgo(100),
    expiresAt: days(19)
  },
  {
    id: 'e10',
    member: people.meera,
    plan: PLANS[1],
    purchasedAt: daysAgo(160),
    expiresAt: days(23)
  },
  {
    id: 'e11',
    member: people.manoj,
    plan: PLANS[0],
    purchasedAt: daysAgo(270),
    expiresAt: days(27)
  },
  {
    id: 'e12',
    member: people.gaurav,
    plan: PLANS[3],
    purchasedAt: daysAgo(70),
    expiresAt: days(31)
  },
  {
    id: 'e13',
    member: people.sneha,
    plan: PLANS[2],
    purchasedAt: daysAgo(130),
    expiresAt: days(36)
  },
  {
    id: 'e14',
    member: people.pallavi,
    plan: PLANS[0],
    purchasedAt: daysAgo(280),
    expiresAt: days(41)
  },
  {
    id: 'e15',
    member: people.arjun,
    plan: PLANS[4],
    purchasedAt: daysAgo(290),
    expiresAt: days(46)
  },
  {
    id: 'e16',
    member: people.varun,
    plan: PLANS[1],
    purchasedAt: daysAgo(140),
    expiresAt: days(52)
  },
  {
    id: 'e17',
    member: people.namrata,
    plan: PLANS[2],
    purchasedAt: daysAgo(110),
    expiresAt: days(58)
  },
  {
    id: 'e18',
    member: people.deepak,
    plan: PLANS[0],
    purchasedAt: daysAgo(260),
    expiresAt: days(63)
  },
  { id: 'e19', member: people.isha, plan: PLANS[3], purchasedAt: daysAgo(60), expiresAt: days(68) },
  {
    id: 'e20',
    member: people.rekha,
    plan: PLANS[1],
    purchasedAt: daysAgo(150),
    expiresAt: days(74)
  },
  {
    id: 'e21',
    member: people.siddharth,
    plan: PLANS[0],
    purchasedAt: daysAgo(240),
    expiresAt: days(79)
  },
  {
    id: 'e22',
    member: people.farhan,
    plan: PLANS[2],
    purchasedAt: daysAgo(95),
    expiresAt: days(84)
  },
  {
    id: 'e23',
    member: people.shalini,
    plan: PLANS[4],
    purchasedAt: daysAgo(250),
    expiresAt: days(88)
  },
  {
    id: 'e24',
    member: people.tarun,
    plan: PLANS[0],
    purchasedAt: daysAgo(230),
    expiresAt: days(93)
  }
]

export const SEED_PAYMENTS_DUE: PaymentDue[] = [
  {
    id: 'p1',
    member: people.anjali,
    plan: PLANS[0],
    purchasedAt: daysAgo(2),
    amountDue: 2400,
    total: 12000
  },
  {
    id: 'p2',
    member: people.sneha,
    plan: PLANS[0],
    purchasedAt: daysAgo(4),
    amountDue: 4600,
    total: 9200
  },
  {
    id: 'p3',
    member: people.arjun,
    plan: PLANS[0],
    purchasedAt: daysAgo(6),
    amountDue: 3000,
    total: 15000
  },
  {
    id: 'p4',
    member: people.deepak,
    plan: PLANS[4],
    purchasedAt: daysAgo(8),
    amountDue: 7500,
    total: 15000
  },
  {
    id: 'p5',
    member: people.manoj,
    plan: PLANS[0],
    purchasedAt: daysAgo(9),
    amountDue: 1200,
    total: 7000
  },
  {
    id: 'p6',
    member: people.meera,
    plan: PLANS[1],
    purchasedAt: daysAgo(12),
    amountDue: 3800,
    total: 7600
  },
  {
    id: 'p7',
    member: people.rohit,
    plan: PLANS[0],
    purchasedAt: daysAgo(15),
    amountDue: 2400,
    total: 12000
  },
  {
    id: 'p8',
    member: people.priya,
    plan: PLANS[2],
    purchasedAt: daysAgo(18),
    amountDue: 1950,
    total: 3900
  },
  {
    id: 'p9',
    member: people.rekha,
    plan: PLANS[1],
    purchasedAt: daysAgo(22),
    amountDue: 3800,
    total: 7600
  },
  {
    id: 'p10',
    member: people.farhan,
    plan: PLANS[2],
    purchasedAt: daysAgo(26),
    amountDue: 650,
    total: 3900
  },
  {
    id: 'p11',
    member: people.pallavi,
    plan: PLANS[0],
    purchasedAt: daysAgo(31),
    amountDue: 4800,
    total: 12000
  },
  {
    id: 'p12',
    member: people.hitesh,
    plan: PLANS[4],
    purchasedAt: daysAgo(35),
    amountDue: 3750,
    total: 15000
  },
  {
    id: 'p13',
    member: people.shalini,
    plan: PLANS[4],
    purchasedAt: daysAgo(42),
    amountDue: 7500,
    total: 15000
  },
  {
    id: 'p14',
    member: people.tina,
    plan: PLANS[3],
    purchasedAt: daysAgo(48),
    amountDue: 2200,
    total: 8800
  },
  {
    id: 'p15',
    member: people.varun,
    plan: PLANS[1],
    purchasedAt: daysAgo(55),
    amountDue: 3800,
    total: 7600
  },
  {
    id: 'p16',
    member: people.isha,
    plan: PLANS[3],
    purchasedAt: daysAgo(63),
    amountDue: 4400,
    total: 8800
  },
  {
    id: 'p17',
    member: people.namrata,
    plan: PLANS[2],
    purchasedAt: daysAgo(72),
    amountDue: 1950,
    total: 3900
  },
  {
    id: 'p18',
    member: people.gaurav,
    plan: PLANS[3],
    purchasedAt: daysAgo(81),
    amountDue: 6600,
    total: 8800
  },
  {
    id: 'p19',
    member: people.siddharth,
    plan: PLANS[0],
    purchasedAt: daysAgo(94),
    amountDue: 2400,
    total: 12000
  },
  {
    id: 'p20',
    member: people.kavya,
    plan: PLANS[0],
    purchasedAt: daysAgo(108),
    amountDue: 6000,
    total: 12000
  }
]
