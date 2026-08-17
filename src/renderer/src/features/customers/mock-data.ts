import type { Customer, Membership, MembershipFreeze } from './types'

/**
 * Module 02 — seeded customer store. Mirrors the docs' worked example (Priya
 * Verma, three memberships over two years, freeze record on the active one) and
 * a realistic mix of the other statuses. All dates are computed relative to
 * "today" so the demo stays evergreen. This is the transactional source of
 * truth; the directory and memberships pages derive read models from it.
 */

const DAY = 86_400_000
const now = Date.now()
const d = (offsetDays: number): string => new Date(now + offsetDays * DAY).toISOString()

function freeze(input: Omit<MembershipFreeze, 'createdAt'>): MembershipFreeze {
  return { createdAt: d(-2), ...input }
}

type MembershipInput = Pick<
  Membership,
  'id' | 'plan' | 'price' | 'startDate' | 'endDate' | 'status'
> &
  Partial<Omit<Membership, 'id' | 'plan' | 'price' | 'startDate' | 'endDate' | 'status'>>

function membership(input: MembershipInput): Membership {
  return {
    customerId: '',
    discount: 0,
    billingFrequency: 'MONTHLY',
    registrationFee: 0,
    freezes: [],
    createdAt: d(-1),
    ...input
  }
}

function customer(
  input: Partial<Customer> & Pick<Customer, 'id' | 'name' | 'memberships'>
): Customer {
  const ms = input.memberships.map((m) => ({ ...m, customerId: input.id }))
  const joined = input.joinedAt ?? d(-30)
  return {
    createdAt: joined,
    joinedAt: joined,
    ...input,
    memberships: ms
  }
}

const SEED: Customer[] = [
  customer({
    id: 'C-001',
    name: 'Priya Verma',
    phone: '98200 11223',
    email: 'priya.verma@gmail.com',
    dateOfBirth: '1991-05-14',
    gender: 'Female',
    address: 'B-204, Sunrise Apartments, Andheri West, Mumbai',
    emergencyContact: 'Rajesh Verma (spouse) · 98211 00987',
    notes: 'Loyal since 2025 — refer neighbours for a discount.',
    source: 'Existing member referral',
    ownerId: 'arjun',
    ownerName: 'Arjun Mehta',
    joinedAt: d(-580),
    memberships: [
      membership({
        id: 'M-101',
        plan: 'Monthly Basic',
        planId: 'p-basic',
        price: 1500,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(-580),
        endDate: d(-549),
        status: 'EXPIRED',
        createdAt: d(-580)
      }),
      membership({
        id: 'M-102',
        plan: 'Quarterly Premium',
        planId: 'p-quarterly',
        price: 5400,
        billingFrequency: 'QUARTERLY',
        startDate: d(-520),
        endDate: d(-488),
        status: 'EXPIRED',
        createdAt: d(-520)
      }),
      membership({
        id: 'M-103',
        plan: 'Annual Unlimited',
        planId: 'p-unlimited',
        price: 30000,
        billingFrequency: 'ANNUAL',
        startDate: d(-412),
        endDate: d(19),
        status: 'ACTIVE',
        createdAt: d(-412),
        createdBy: 'Arjun Mehta',
        freezes: [
          freeze({
            id: 'F-1',
            membershipId: 'M-103',
            startDate: d(-258),
            endDate: d(-243),
            reason: 'Medical',
            fee: 0,
            billingBehavior: 'SUSPEND_BILLING',
            accessBehavior: 'NO_ACCESS',
            extensionDays: 15,
            createdBy: 'Arjun Mehta'
          })
        ]
      })
    ]
  }),
  customer({
    id: 'C-002',
    name: 'Neha Gupta',
    phone: '98200 22334',
    email: 'neha.gupta@gmail.com',
    dateOfBirth: '1996-11-02',
    gender: 'Female',
    notes: 'Marathon prep — prefers 6 AM slots.',
    leadId: 'L-013',
    source: 'Instagram',
    ownerId: 'priya',
    ownerName: 'Priya Verma',
    joinedAt: d(-6),
    memberships: [
      membership({
        id: 'M-201',
        plan: 'Annual Premium',
        planId: 'p-annual',
        price: 24000,
        billingFrequency: 'ANNUAL',
        startDate: d(-6),
        endDate: d(359),
        status: 'ACTIVE',
        createdAt: d(-6),
        createdBy: 'Priya Verma'
      })
    ]
  }),
  customer({
    id: 'C-003',
    name: 'Amit Desai',
    phone: '98200 66554',
    email: 'amit.desai@gmail.com',
    notes: 'Prefers evening batches.',
    leadId: 'L-014',
    source: 'Website',
    ownerId: 'arjun',
    ownerName: 'Arjun Mehta',
    joinedAt: d(-15),
    memberships: [
      membership({
        id: 'M-301',
        plan: 'Monthly Basic',
        planId: 'p-basic',
        price: 1500,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(-15),
        endDate: d(10),
        status: 'ACTIVE',
        createdAt: d(-15),
        createdBy: 'Arjun Mehta'
      })
    ]
  }),
  customer({
    id: 'C-004',
    name: 'Rohan Kulkarni',
    phone: '98200 44771',
    email: 'rohan.k@gmail.com',
    dateOfBirth: '1993-01-20',
    gender: 'Male',
    source: 'Walk-in',
    ownerId: 'sana',
    ownerName: 'Sana Shaikh',
    joinedAt: d(-40),
    memberships: [
      membership({
        id: 'M-401',
        plan: 'Half-Yearly',
        planId: 'p-half-yearly',
        price: 9600,
        billingFrequency: 'HALF_YEARLY',
        startDate: d(-40),
        endDate: d(143),
        status: 'ACTIVE',
        createdAt: d(-40),
        createdBy: 'Sana Shaikh'
      })
    ]
  }),
  customer({
    id: 'C-005',
    name: 'Sneha Patil',
    phone: '98200 88992',
    email: 'sneha.patil@gmail.com',
    notes: 'On travel freeze (10 Aug – 23 Aug).',
    source: 'Referral',
    ownerId: 'priya',
    ownerName: 'Priya Verma',
    joinedAt: d(-20),
    memberships: [
      membership({
        id: 'M-501',
        plan: 'Monthly Premium',
        planId: 'p-premium',
        price: 2000,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(-20),
        endDate: d(10),
        status: 'ACTIVE',
        createdAt: d(-20),
        createdBy: 'Priya Verma',
        freezes: [
          freeze({
            id: 'F-2',
            membershipId: 'M-501',
            startDate: d(-5),
            endDate: d(8),
            reason: 'Travel',
            fee: 0,
            billingBehavior: 'SUSPEND_BILLING',
            accessBehavior: 'NO_ACCESS',
            extensionDays: 13,
            createdBy: 'Priya Verma'
          })
        ]
      })
    ]
  }),
  customer({
    id: 'C-006',
    name: 'Vikram Singh',
    phone: '98200 33778',
    email: 'vikram.singh@gmail.com',
    notes: 'Missed renewal — last visited 3 weeks ago.',
    source: 'Walk-in',
    ownerId: 'arjun',
    ownerName: 'Arjun Mehta',
    joinedAt: d(-45),
    memberships: [
      membership({
        id: 'M-601',
        plan: 'Monthly Basic',
        planId: 'p-basic',
        price: 1500,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(-45),
        endDate: d(-15),
        status: 'EXPIRED',
        createdAt: d(-45),
        createdBy: 'Arjun Mehta'
      })
    ]
  }),
  customer({
    id: 'C-007',
    name: 'Anita Joshi',
    phone: '98200 55667',
    email: 'anita.joshi@gmail.com',
    dateOfBirth: '1990-08-09',
    gender: 'Female',
    source: 'Instagram',
    ownerId: 'sana',
    ownerName: 'Sana Shaikh',
    joinedAt: d(-10),
    memberships: [
      membership({
        id: 'M-701',
        plan: 'Quarterly Premium',
        planId: 'p-quarterly',
        price: 5400,
        billingFrequency: 'QUARTERLY',
        startDate: d(-10),
        endDate: d(80),
        status: 'ACTIVE',
        createdAt: d(-10),
        createdBy: 'Sana Shaikh'
      })
    ]
  }),
  customer({
    id: 'C-008',
    name: 'Farhan Qureshi',
    phone: '98200 77440',
    email: 'farhan.q@gmail.com',
    address: '12, Marina Court, Bandra West, Mumbai',
    emergencyContact: 'Zoya Qureshi (wife) · 98200 11884',
    notes: 'Two referrals signed up — 3 months free for him.',
    source: 'Existing member referral',
    ownerId: 'priya',
    ownerName: 'Priya Verma',
    joinedAt: d(-200),
    memberships: [
      membership({
        id: 'M-801',
        plan: 'Annual Unlimited',
        planId: 'p-unlimited',
        price: 30000,
        billingFrequency: 'ANNUAL',
        startDate: d(-200),
        endDate: d(165),
        status: 'ACTIVE',
        createdAt: d(-200),
        createdBy: 'Priya Verma'
      })
    ]
  }),
  customer({
    id: 'C-009',
    name: 'Ritika Malhotra',
    phone: '98200 99221',
    email: 'ritika.m@gmail.com',
    notes: 'Cancelled on price — offered quarterly upgrade, declined.',
    source: 'Phone',
    ownerId: 'arjun',
    ownerName: 'Arjun Mehta',
    joinedAt: d(-90),
    memberships: [
      membership({
        id: 'M-901',
        plan: 'Monthly Premium',
        planId: 'p-premium',
        price: 2000,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(-90),
        endDate: d(-60),
        status: 'CANCELLED',
        createdAt: d(-90),
        createdBy: 'Arjun Mehta'
      })
    ]
  }),
  customer({
    id: 'C-010',
    name: 'Aditya Menon',
    phone: '98200 11990',
    email: 'aditya.menon@gmail.com',
    notes: 'Policy violation — access revoked.',
    source: 'Walk-in',
    ownerId: 'sana',
    ownerName: 'Sana Shaikh',
    joinedAt: d(-300),
    memberships: [
      membership({
        id: 'M-1001',
        plan: 'Annual Premium',
        planId: 'p-annual',
        price: 24000,
        billingFrequency: 'ANNUAL',
        startDate: d(-300),
        endDate: d(65),
        status: 'TERMINATED',
        createdAt: d(-300),
        createdBy: 'Sana Shaikh'
      })
    ]
  }),
  customer({
    id: 'C-011',
    name: 'Pallavi Iyer',
    phone: '98200 44332',
    email: 'pallavi.iyer@gmail.com',
    notes: 'Paid online — awaiting first visit to activate.',
    source: 'WhatsApp',
    ownerId: 'priya',
    ownerName: 'Priya Verma',
    joinedAt: d(-2),
    memberships: [
      membership({
        id: 'M-1101',
        plan: 'Monthly Premium',
        planId: 'p-premium',
        price: 2000,
        registrationFee: 500,
        billingFrequency: 'MONTHLY',
        startDate: d(1),
        endDate: d(31),
        status: 'PENDING',
        createdAt: d(-2),
        createdBy: 'Priya Verma'
      })
    ]
  }),
  customer({
    id: 'C-012',
    name: 'Sameer Bhatt',
    phone: '98200 66778',
    email: 'sameer.bhatt@gmail.com',
    notes: 'Couple plan — wife also enrolled.',
    source: 'Existing member referral',
    ownerId: 'arjun',
    ownerName: 'Arjun Mehta',
    joinedAt: d(-30),
    memberships: [
      membership({
        id: 'M-1201',
        plan: 'Couple Annual',
        planId: 'p-couple',
        price: 42000,
        billingFrequency: 'ANNUAL',
        startDate: d(-30),
        endDate: d(335),
        status: 'ACTIVE',
        createdAt: d(-30),
        createdBy: 'Arjun Mehta'
      })
    ]
  }),
  customer({
    id: 'C-013',
    name: 'Shreya Nair',
    phone: '98200 33119',
    email: 'shreya.nair@gmail.com',
    dateOfBirth: '2004-03-25',
    gender: 'Female',
    notes: 'Student plan — verified college ID.',
    source: 'Website',
    ownerId: 'sana',
    ownerName: 'Sana Shaikh',
    joinedAt: d(-3),
    memberships: [
      membership({
        id: 'M-1301',
        plan: 'Student Monthly',
        planId: 'p-student',
        price: 1000,
        billingFrequency: 'MONTHLY',
        startDate: d(-3),
        endDate: d(28),
        status: 'ACTIVE',
        createdAt: d(-3),
        createdBy: 'Sana Shaikh'
      })
    ]
  }),
  customer({
    id: 'C-014',
    name: 'Deepak Chauhan',
    phone: '98200 90551',
    email: 'deepak.chauhan@gmail.com',
    notes: 'Walked in for a free trial — no plan yet.',
    source: 'Walk-in',
    ownerId: 'priya',
    ownerName: 'Priya Verma',
    joinedAt: d(-100),
    memberships: []
  })
]

export class CustomerStore {
  #rows: Customer[]

  constructor(seed: Customer[] = SEED) {
    this.#rows = seed
  }

  all(): Customer[] {
    return this.#rows
  }

  byId(id: string): Customer | undefined {
    return this.#rows.find((c) => c.id === id)
  }
}
