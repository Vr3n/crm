import type { PersonRef } from '@/features/dashboard/types'
import type { Credit, FinanceInvoice, Payment, Refund } from './types'

/**
 * Seed records for the finance read model (Modules 05 + 09).
 *
 * Timestamps are relative to "now" so the "today" / "this month" collection
 * figures stay alive and the date-range filters behave. The dataset mirrors
 * the docs' worked examples on purpose: Priya's ₹25,000 bank transfer spread
 * over two invoices with a layered-on refund (Module 05 §"worked example"), and
 * a realistic mix of fully/partially allocated payments, advance payments,
 * refunds and credits.
 *
 * This is mock data standing in for the future SQLite-backed transactional
 * layer. Amounts are integer rupees here; the real layer stores integer paise
 * (Module 04).
 */

const daysAgo = (n: number, h = 11): string => {
  const d = new Date(Date.now() - n * 86400000)
  d.setHours(h, 18, 0, 0)
  return d.toISOString()
}

const P = (name: string, phone: string, email?: string): PersonRef => ({
  id: `f${name.replace(/\s+/g, '').toLowerCase()}`,
  name,
  phone,
  email
})

const people: Record<string, PersonRef> = {
  rohit: P('Rohit Sharma', '+91 98220 11445', 'rohit.sharma@example.com'),
  priya: P('Priya Deshmukh', '+91 98989 09090', 'priya.d@example.com'),
  anjali: P('Anjali Mehta', '+91 99870 55231', 'anjali.mehta@example.com'),
  vikram: P('Vikram Singh', '+91 98110 22098', 'vikram.s@example.com'),
  sneha: P('Sneha Kulkarni', '+91 99200 77889', 'sneha.k@example.com'),
  arjun: P('Arjun Nair', '+91 90040 33211', 'arjun.nair@example.com'),
  kavya: P('Kavya Reddy', '+91 97010 66544', 'kavya.r@example.com'),
  manoj: P('Manoj Verma', '+91 98490 12780', 'manoj.v@example.com'),
  deepak: P('Deepak Patel', '+91 98765 43210', 'deepak.p@example.com'),
  rekha: P('Rekha Iyer', '+91 99876 54321'),
  siddharth: P('Siddharth Rao', '+91 98654 32109', 'sid.rao@example.com'),
  meera: P('Meera Nambiar', '+91 97531 24680', 'meera.n@example.com')
}

export const FINANCE_CUSTOMERS: PersonRef[] = [
  people.rohit,
  people.priya,
  people.anjali,
  people.vikram,
  people.sneha,
  people.arjun,
  people.kavya,
  people.manoj,
  people.deepak,
  people.rekha,
  people.siddharth,
  people.meera
]

export const SEED_INVOICES: FinanceInvoice[] = [
  {
    id: 'inv-1001',
    invoiceNo: 'INV-1001',
    customer: people.rohit,
    line: 'Annual Premium Membership',
    issuedAt: daysAgo(28),
    total: 23246,
    paid: 23246,
    status: 'PAID'
  },
  {
    id: 'inv-1002',
    invoiceNo: 'INV-1002',
    customer: people.priya,
    line: 'Annual Premium Membership',
    issuedAt: daysAgo(27),
    total: 23246,
    paid: 23246,
    status: 'PAID'
  },
  {
    id: 'inv-1003',
    invoiceNo: 'INV-1003',
    customer: people.priya,
    line: 'Personal Training (12 sessions)',
    issuedAt: daysAgo(27),
    total: 6000,
    paid: 0,
    status: 'OPEN'
  },
  {
    id: 'inv-1004',
    invoiceNo: 'INV-1004',
    customer: people.anjali,
    line: 'Half-Yearly Membership',
    issuedAt: daysAgo(24),
    total: 7600,
    paid: 2000,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1005',
    invoiceNo: 'INV-1005',
    customer: people.vikram,
    line: 'Annual Plus Membership',
    issuedAt: daysAgo(22),
    total: 15000,
    paid: 12500,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1006',
    invoiceNo: 'INV-1006',
    customer: people.sneha,
    line: 'Quarterly Flex',
    issuedAt: daysAgo(20),
    total: 3900,
    paid: 2400,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1007',
    invoiceNo: 'INV-1007',
    customer: people.arjun,
    line: 'Annual Premium Membership',
    issuedAt: daysAgo(19),
    total: 23246,
    paid: 23246,
    status: 'PAID'
  },
  {
    id: 'inv-1008',
    invoiceNo: 'INV-1008',
    customer: people.kavya,
    line: 'Registration + Annual Premium',
    issuedAt: daysAgo(17),
    total: 12000,
    paid: 0,
    status: 'OPEN'
  },
  {
    id: 'inv-1009',
    invoiceNo: 'INV-1009',
    customer: people.manoj,
    line: 'Half-Yearly Membership',
    issuedAt: daysAgo(15),
    total: 7600,
    paid: 7600,
    status: 'PAID'
  },
  {
    id: 'inv-1010',
    invoiceNo: 'INV-1010',
    customer: people.deepak,
    line: 'Annual Plus Membership',
    issuedAt: daysAgo(13),
    total: 15000,
    paid: 3750,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1011',
    invoiceNo: 'INV-1011',
    customer: people.rekha,
    line: 'Quarterly Flex',
    issuedAt: daysAgo(11),
    total: 3900,
    paid: 0,
    status: 'VOID'
  },
  {
    id: 'inv-1012',
    invoiceNo: 'INV-1012',
    customer: people.siddharth,
    line: 'Annual Premium Membership',
    issuedAt: daysAgo(9),
    total: 23246,
    paid: 5000,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1013',
    invoiceNo: 'INV-1013',
    customer: people.meera,
    line: 'Half-Yearly Membership',
    issuedAt: daysAgo(8),
    total: 7600,
    paid: 7600,
    status: 'PAID'
  },
  {
    id: 'inv-1014',
    invoiceNo: 'INV-1014',
    customer: people.rohit,
    line: 'Personal Training (10 sessions)',
    issuedAt: daysAgo(7),
    total: 8800,
    paid: 7400,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1015',
    invoiceNo: 'INV-1015',
    customer: people.sneha,
    line: 'Annual Premium (renewal)',
    issuedAt: daysAgo(3),
    total: 23246,
    paid: 0,
    status: 'OPEN'
  },
  {
    id: 'inv-1016',
    invoiceNo: 'INV-1016',
    customer: people.kavya,
    line: 'Quarterly Flex',
    issuedAt: daysAgo(1),
    total: 3900,
    paid: 3900,
    status: 'PAID'
  }
]

export const SEED_PAYMENTS: Payment[] = [
  {
    id: 'pay-9001',
    paymentNo: 'P-9001',
    customer: people.priya,
    paymentDate: daysAgo(26),
    amount: 25000,
    method: 'BANK_TRANSFER',
    reference: 'HDFC NEFT · 88421',
    notes: 'One transfer covering annual membership + PT.',
    createdBy: 'Ananya',
    allocations: [
      { invoiceId: 'inv-1002', invoiceNo: 'INV-1002', amount: 23246 },
      { invoiceId: 'inv-1003', invoiceNo: 'INV-1003', amount: 1754 }
    ],
    refundIds: ['ref-201']
  },
  {
    id: 'pay-9002',
    paymentNo: 'P-9002',
    customer: people.rohit,
    paymentDate: daysAgo(25),
    amount: 23246,
    method: 'UPI',
    reference: 'rohit@okhdfc · UTR 90211',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1001', invoiceNo: 'INV-1001', amount: 23246 }],
    refundIds: []
  },
  {
    id: 'pay-9003',
    paymentNo: 'P-9003',
    customer: people.arjun,
    paymentDate: daysAgo(20),
    amount: 23246,
    method: 'CARD',
    reference: 'VISA ····4412',
    createdBy: 'Varun',
    allocations: [{ invoiceId: 'inv-1007', invoiceNo: 'INV-1007', amount: 23246 }],
    refundIds: []
  },
  {
    id: 'pay-9004',
    paymentNo: 'P-9004',
    customer: people.manoj,
    paymentDate: daysAgo(16),
    amount: 7600,
    method: 'CASH',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1009', invoiceNo: 'INV-1009', amount: 7600 }],
    refundIds: ['ref-203']
  },
  {
    id: 'pay-9005',
    paymentNo: 'P-9005',
    customer: people.meera,
    paymentDate: daysAgo(14),
    amount: 7600,
    method: 'UPI',
    reference: 'meera@ybl · UTR 89120',
    createdBy: 'Rahul',
    allocations: [{ invoiceId: 'inv-1013', invoiceNo: 'INV-1013', amount: 7600 }],
    refundIds: ['ref-206']
  },
  {
    id: 'pay-9006',
    paymentNo: 'P-9006',
    customer: people.vikram,
    paymentDate: daysAgo(12),
    amount: 7500,
    method: 'CHEQUE',
    reference: 'CHQ · 782341',
    createdBy: 'Varun',
    allocations: [{ invoiceId: 'inv-1005', invoiceNo: 'INV-1005', amount: 7500 }],
    refundIds: ['ref-204']
  },
  {
    id: 'pay-9007',
    paymentNo: 'P-9007',
    customer: people.deepak,
    paymentDate: daysAgo(10),
    amount: 3750,
    method: 'BANK_TRANSFER',
    reference: 'ICICI IMPS · 77625',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1010', invoiceNo: 'INV-1010', amount: 3750 }],
    refundIds: []
  },
  {
    id: 'pay-9008',
    paymentNo: 'P-9008',
    customer: people.rohit,
    paymentDate: daysAgo(9),
    amount: 4400,
    method: 'UPI',
    reference: 'rohit@oksbi · UTR 88490',
    createdBy: 'Rahul',
    allocations: [{ invoiceId: 'inv-1014', invoiceNo: 'INV-1014', amount: 4400 }],
    refundIds: ['ref-205']
  },
  {
    id: 'pay-9009',
    paymentNo: 'P-9009',
    customer: people.kavya,
    paymentDate: daysAgo(8),
    amount: 3900,
    method: 'CARD',
    reference: 'RUPAY ····9901',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1016', invoiceNo: 'INV-1016', amount: 3900 }],
    refundIds: ['ref-202']
  },
  {
    id: 'pay-9010',
    paymentNo: 'P-9010',
    customer: people.siddharth,
    paymentDate: daysAgo(6),
    amount: 5000,
    method: 'UPI',
    reference: 'sid.rao@apl · UTR 87712',
    createdBy: 'Rahul',
    allocations: [{ invoiceId: 'inv-1012', invoiceNo: 'INV-1012', amount: 5000 }],
    refundIds: []
  },
  {
    id: 'pay-9011',
    paymentNo: 'P-9011',
    customer: people.anjali,
    paymentDate: daysAgo(4),
    amount: 2000,
    method: 'UPI',
    reference: 'anjali@paytm · UTR 86190',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1004', invoiceNo: 'INV-1004', amount: 2000 }],
    refundIds: []
  },
  {
    id: 'pay-9012',
    paymentNo: 'P-9012',
    customer: people.rohit,
    paymentDate: daysAgo(3),
    amount: 3000,
    method: 'CASH',
    createdBy: 'Rahul',
    allocations: [{ invoiceId: 'inv-1014', invoiceNo: 'INV-1014', amount: 3000 }],
    refundIds: []
  },
  {
    id: 'pay-9013',
    paymentNo: 'P-9013',
    customer: people.sneha,
    paymentDate: daysAgo(2),
    amount: 2400,
    method: 'UPI',
    reference: 'sneha@okaxis · UTR 84567',
    createdBy: 'Ananya',
    allocations: [{ invoiceId: 'inv-1006', invoiceNo: 'INV-1006', amount: 2400 }],
    refundIds: []
  },
  {
    id: 'pay-9014',
    paymentNo: 'P-9014',
    customer: people.vikram,
    paymentDate: daysAgo(1),
    amount: 6000,
    method: 'CARD',
    reference: 'VISA ····1093',
    notes: 'Advance toward the remaining Annual Plus balance.',
    createdBy: 'Varun',
    allocations: [{ invoiceId: 'inv-1005', invoiceNo: 'INV-1005', amount: 5000 }],
    refundIds: []
  },
  {
    id: 'pay-9015',
    paymentNo: 'P-9015',
    customer: people.meera,
    paymentDate: daysAgo(0, 9),
    amount: 2600,
    method: 'UPI',
    reference: 'meera@ybl · UTR 81234',
    notes: 'Advance payment toward next renewal.',
    createdBy: 'Ananya',
    allocations: [],
    refundIds: []
  },
  {
    id: 'pay-9016',
    paymentNo: 'P-9016',
    customer: people.kavya,
    paymentDate: daysAgo(0, 11),
    amount: 4800,
    method: 'CASH',
    notes: 'Cash received toward registration + annual invoice.',
    createdBy: 'Rahul',
    allocations: [],
    refundIds: []
  },
  {
    id: 'pay-9017',
    paymentNo: 'P-9017',
    customer: people.deepak,
    paymentDate: daysAgo(0, 12),
    amount: 6000,
    method: 'UPI',
    reference: 'deepak@okhdfc · UTR 80988',
    notes: 'Advance toward Annual Plus balance.',
    createdBy: 'Ananya',
    allocations: [],
    refundIds: []
  }
]

export const SEED_REFUNDS: Refund[] = [
  {
    id: 'ref-201',
    refundNo: 'R-201',
    customer: people.priya,
    refundDate: daysAgo(24),
    amount: 1754,
    sourcePaymentId: 'pay-9001',
    sourcePaymentNo: 'P-9001',
    method: 'BANK_TRANSFER',
    reason: 'PT package cancelled — full refund of unused sessions',
    createdBy: 'Ananya'
  },
  {
    id: 'ref-202',
    refundNo: 'R-202',
    customer: people.kavya,
    refundDate: daysAgo(6),
    amount: 900,
    sourcePaymentId: 'pay-9009',
    sourcePaymentNo: 'P-9009',
    method: 'CASH',
    reason: 'Registration fee reversed after plan downgrade',
    createdBy: 'Rahul'
  },
  {
    id: 'ref-203',
    refundNo: 'R-203',
    customer: people.manoj,
    refundDate: daysAgo(15),
    amount: 1200,
    sourcePaymentId: 'pay-9004',
    sourcePaymentNo: 'P-9004',
    method: 'UPI',
    reason: 'Overcharged on joining — price correction',
    createdBy: 'Varun'
  },
  {
    id: 'ref-204',
    refundNo: 'R-204',
    customer: people.vikram,
    refundDate: daysAgo(9),
    amount: 750,
    sourcePaymentId: 'pay-9006',
    sourcePaymentNo: 'P-9006',
    method: 'CHEQUE',
    reason: 'Guest pass bundled in error',
    createdBy: 'Ananya'
  },
  {
    id: 'ref-205',
    refundNo: 'R-205',
    customer: people.rohit,
    refundDate: daysAgo(4),
    amount: 1800,
    sourcePaymentId: 'pay-9008',
    sourcePaymentNo: 'P-9008',
    method: 'CARD',
    reason: 'PT session batch partially cancelled',
    createdBy: 'Rahul'
  },
  {
    id: 'ref-206',
    refundNo: 'R-206',
    customer: people.meera,
    refundDate: daysAgo(0, 10),
    amount: 500,
    sourcePaymentId: 'pay-9005',
    sourcePaymentNo: 'P-9005',
    method: 'UPI',
    reason: 'Locker fee adjustment',
    createdBy: 'Ananya'
  }
]

export const SEED_CREDITS: Credit[] = [
  {
    id: 'crd-301',
    creditNo: 'C-301',
    customer: people.rohit,
    issuedAt: daysAgo(18),
    amount: 2000,
    reason: 'Unused membership time after early renewal',
    source: 'Membership credit',
    createdBy: 'Ananya',
    applications: []
  },
  {
    id: 'crd-302',
    creditNo: 'C-302',
    customer: people.anjali,
    issuedAt: daysAgo(12),
    amount: 3000,
    reason: 'Downgrade adjustment',
    source: 'Plan change',
    createdBy: 'Varun',
    applications: [{ invoiceNo: 'INV-1004', amount: 1500, appliedAt: daysAgo(10) }]
  },
  {
    id: 'crd-303',
    creditNo: 'C-303',
    customer: people.sneha,
    issuedAt: daysAgo(7),
    amount: 1000,
    reason: 'Trial credit toward first renewal',
    source: 'Trial credit',
    createdBy: 'Rahul',
    applications: []
  },
  {
    id: 'crd-304',
    creditNo: 'C-304',
    customer: people.kavya,
    issuedAt: daysAgo(5),
    amount: 800,
    reason: 'Referral bonus credit',
    source: 'Referral',
    createdBy: 'Ananya',
    applications: [{ invoiceNo: 'INV-1008', amount: 800, appliedAt: daysAgo(3) }]
  },
  {
    id: 'crd-305',
    creditNo: 'C-305',
    customer: people.deepak,
    issuedAt: daysAgo(2),
    amount: 1200,
    reason: 'Freeze compensation credit',
    source: 'Membership freeze',
    createdBy: 'Varun',
    applications: []
  },
  {
    id: 'crd-306',
    creditNo: 'C-306',
    customer: people.rekha,
    issuedAt: daysAgo(0, 10),
    amount: 650,
    reason: 'Voided invoice adjustment',
    source: 'Invoice void',
    createdBy: 'Ananya',
    applications: []
  }
]
