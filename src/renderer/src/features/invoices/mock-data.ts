import type { CustomerRef, Invoice, InvoiceAllocation, InvoiceLine, PaymentMethod } from './types'

/**
 * Seed data for the invoice register (Modules 04–05).
 *
 * Timestamps are relative to "now" so the register feels live and the daily
 * collection report (Module 09 §63) has real "today" payments to aggregate.
 * Amounts are whole rupees; totals are always derived from lines and
 * allocations by `buildInvoice` so the seeds can't drift from their parts.
 *
 * The status mix mirrors a real front-desk month: mostly settled, a few open,
 * a couple of partials, one voided and one written off.
 */

const TAX = 18

const daysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString()

/** Deterministic-ish local timestamp: n days back, hour set, minute from seed. */
function stamp(daysBack: number, hour: number, minute: number): string {
  const d = new Date(Date.now() - daysBack * 86400000)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const P = (id: string, name: string, phone: string, email?: string): CustomerRef => ({
  id,
  name,
  phone,
  email
})

const customers: Record<string, CustomerRef> = {
  c1: P('c1', 'Rohit Sharma', '+91 98220 11445', 'rohit.sharma@example.com'),
  c2: P('c2', 'Anjali Mehta', '+91 99870 55231', 'anjali.mehta@example.com'),
  c3: P('c3', 'Vikram Singh', '+91 98110 22098', 'vikram.s@example.com'),
  c4: P('c4', 'Sneha Kulkarni', '+91 99200 77889', 'sneha.k@example.com'),
  c5: P('c5', 'Arjun Nair', '+91 90040 33211', 'arjun.nair@example.com'),
  c6: P('c6', 'Kavya Reddy', '+91 97010 66544', 'kavya.r@example.com'),
  c7: P('c7', 'Manoj Verma', '+91 98490 12780', 'manoj.v@example.com'),
  c8: P('c8', 'Priya Deshmukh', '+91 98989 09090', 'priya.d@example.com'),
  c9: P('c9', 'Deepak Patel', '+91 98765 43210', 'deepak.p@example.com'),
  c10: P('c10', 'Meera Nambiar', '+91 97531 24680', 'meera.n@example.com'),
  c11: P('c11', 'Farhan Ansari', '+91 97000 12345', 'farhan.a@example.com'),
  c12: P('c12', 'Divya Menon', '+91 95313 57911', 'divya.m@example.com'),
  c13: P('c13', 'Isha Bhatt', '+91 90090 80807', 'isha.b@example.com'),
  c14: P('c14', 'Tarun Khanna', '+91 96420 13579')
}

const AP = 'Annual Premium Membership (15 Aug 2026 – 14 Aug 2027)'
const APLUS = 'Annual Plus Membership (1 Jul 2026 – 30 Jun 2027)'
const HY = 'Half-Yearly Membership (10 Aug 2026 – 9 Feb 2027)'
const QF = 'Quarterly Flex Membership (5 Aug 2026 – 4 Nov 2026)'
const PT = 'Personal Training — 12 sessions'
const REG = 'Registration Fee'
const LOCKER = 'Locker Rental (12 months)'
const DAYPASS = 'Day Pass'

function line(
  id: string,
  description: string,
  unitPrice: number,
  opts: { qty?: number; discount?: number; taxRate?: number } = {}
): InvoiceLine {
  const qty = opts.qty ?? 1
  const discount = opts.discount ?? 0
  const taxRate = opts.taxRate ?? TAX
  const base = (unitPrice - discount) * qty
  const taxAmount = Math.round((base * taxRate) / 100)
  return {
    id,
    description,
    quantity: qty,
    unitPrice,
    discountAmount: discount,
    taxRate,
    taxAmount,
    lineTotal: base + taxAmount
  }
}

function alloc(
  id: string,
  amount: number,
  method: PaymentMethod,
  reference: string,
  daysBack: number,
  hour: number,
  minute: number,
  receivedBy: string
): InvoiceAllocation {
  return { id, amount, method, reference, receivedAt: stamp(daysBack, hour, minute), receivedBy }
}

interface Seed extends Omit<
  Invoice,
  'subtotal' | 'taxTotal' | 'total' | 'paidAmount' | 'outstanding'
> {}

/** Issued today's seed invoices. */
export const SEED_INVOICES: Seed[] = [
  {
    id: 'inv-0001',
    invoiceNo: 'INV-2026-0001',
    customer: customers.c1,
    issuedAt: daysAgo(95),
    dueAt: daysAgo(88),
    status: 'PAID',
    createdBy: 'Priya Verma',
    lines: [line('l-0001', AP, 19200), line('l-0001b', REG, 500)],
    allocations: [alloc('a-0001', 23246, 'CASH', 'PYMT-2026-0102', 94, 11, 30, 'Priya Verma')]
  },
  {
    id: 'inv-0002',
    invoiceNo: 'INV-2026-0002',
    customer: customers.c2,
    issuedAt: daysAgo(82),
    dueAt: daysAgo(75),
    status: 'PAID',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0002', HY, 8400)],
    allocations: [alloc('a-0002', 9912, 'UPI', 'PYMT-2026-0103', 81, 10, 15, 'Sana Shaikh')]
  },
  {
    id: 'inv-0003',
    invoiceNo: 'INV-2026-0003',
    customer: customers.c5,
    issuedAt: daysAgo(72),
    dueAt: daysAgo(65),
    status: 'PAID',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0003', PT, 9600)],
    allocations: [alloc('a-0003', 11328, 'CARD', 'PYMT-2026-0104', 71, 16, 45, 'Arjun Mehta')]
  },
  {
    id: 'inv-0004',
    invoiceNo: 'INV-2026-0004',
    customer: customers.c6,
    issuedAt: daysAgo(65),
    dueAt: daysAgo(58),
    status: 'PAID',
    createdBy: 'Priya Verma',
    lines: [line('l-0004', AP, 19200)],
    allocations: [alloc('a-0004', 22656, 'CASH', 'PYMT-2026-0105', 64, 12, 10, 'Priya Verma')]
  },
  {
    id: 'inv-0005',
    invoiceNo: 'INV-2026-0005',
    customer: customers.c12,
    issuedAt: daysAgo(60),
    status: 'UNCOLLECTIBLE',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0005', PT, 9600)],
    allocations: []
  },
  {
    id: 'inv-0006',
    invoiceNo: 'INV-2026-0006',
    customer: customers.c9,
    issuedAt: daysAgo(55),
    dueAt: daysAgo(48),
    status: 'PAID',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0006', APLUS, 24000)],
    allocations: [alloc('a-0006', 28320, 'UPI', 'PYMT-2026-0106', 54, 13, 25, 'Sana Shaikh')]
  },
  {
    id: 'inv-0007',
    invoiceNo: 'INV-2026-0007',
    customer: customers.c11,
    issuedAt: daysAgo(45),
    status: 'VOID',
    createdBy: 'Priya Verma',
    lines: [line('l-0007', AP, 19200)],
    allocations: []
  },
  {
    id: 'inv-0008',
    invoiceNo: 'INV-2026-0008',
    customer: customers.c10,
    issuedAt: daysAgo(40),
    dueAt: daysAgo(33),
    status: 'PAID',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0008', APLUS, 24000), line('l-0008b', REG, 500)],
    allocations: [alloc('a-0008', 28910, 'UPI', 'PYMT-2026-0107', 21, 11, 40, 'Arjun Mehta')]
  },
  {
    id: 'inv-0009',
    invoiceNo: 'INV-2026-0009',
    customer: customers.c14,
    issuedAt: daysAgo(35),
    dueAt: daysAgo(28),
    status: 'PAID',
    createdBy: 'Priya Verma',
    lines: [line('l-0009', AP, 19200), line('l-0009b', LOCKER, 1200)],
    allocations: [
      alloc('a-0009', 24072, 'BANK_TRANSFER', 'PYMT-2026-0108', 34, 12, 5, 'Priya Verma')
    ]
  },
  {
    id: 'inv-0010',
    invoiceNo: 'INV-2026-0010',
    customer: customers.c2,
    issuedAt: daysAgo(30),
    dueAt: daysAgo(23),
    status: 'PAID',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0010', QF, 4200)],
    allocations: [alloc('a-0010', 4956, 'CASH', 'PYMT-2026-0109', 29, 17, 20, 'Sana Shaikh')]
  },
  {
    id: 'inv-0011',
    invoiceNo: 'INV-2026-0011',
    customer: customers.c3,
    issuedAt: daysAgo(28),
    dueAt: daysAgo(21),
    status: 'PAID',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0011', PT, 9600)],
    allocations: [alloc('a-0011', 11328, 'CARD', 'PYMT-2026-0110', 27, 11, 50, 'Arjun Mehta')]
  },
  {
    id: 'inv-0012',
    invoiceNo: 'INV-2026-0012',
    customer: customers.c6,
    issuedAt: daysAgo(22),
    dueAt: daysAgo(15),
    status: 'PAID',
    createdBy: 'Priya Verma',
    lines: [line('l-0012', QF, 4200)],
    allocations: [alloc('a-0012', 4956, 'UPI', 'PYMT-2026-0111', 21, 15, 10, 'Priya Verma')]
  },
  {
    id: 'inv-0013',
    invoiceNo: 'INV-2026-0013',
    customer: customers.c7,
    issuedAt: daysAgo(18),
    dueAt: daysAgo(11),
    status: 'PAID',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0013', AP, 19200)],
    allocations: [
      alloc('a-0013', 22656, 'BANK_TRANSFER', 'PYMT-2026-0112', 17, 14, 40, 'Sana Shaikh')
    ]
  },
  {
    id: 'inv-0014',
    invoiceNo: 'INV-2026-0014',
    customer: customers.c4,
    issuedAt: daysAgo(12),
    dueAt: daysAgo(5),
    status: 'OPEN',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0014', QF, 4200), line('l-0014b', REG, 500)],
    allocations: []
  },
  {
    id: 'inv-0015',
    invoiceNo: 'INV-2026-0015',
    customer: customers.c10,
    issuedAt: daysAgo(10),
    dueAt: daysAgo(3),
    status: 'PARTIALLY_PAID',
    createdBy: 'Priya Verma',
    lines: [line('l-0015', PT, 9600)],
    allocations: [alloc('a-0015', 6000, 'CARD', 'PYMT-2026-0113', 0, 14, 15, 'Arjun Mehta')]
  },
  {
    id: 'inv-0016',
    invoiceNo: 'INV-2026-0016',
    customer: customers.c8,
    issuedAt: daysAgo(9),
    dueAt: daysAgo(2),
    status: 'OPEN',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0016', HY, 8400), line('l-0016b', DAYPASS, 300)],
    allocations: []
  },
  {
    id: 'inv-0017',
    invoiceNo: 'INV-2026-0017',
    customer: customers.c3,
    issuedAt: daysAgo(7),
    dueAt: daysAgo(0),
    status: 'PARTIALLY_PAID',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0017', APLUS, 24000), line('l-0017b', LOCKER, 1200)],
    allocations: [alloc('a-0017', 15000, 'UPI', 'PYMT-2026-0114', 0, 13, 20, 'Priya Verma')]
  },
  {
    id: 'inv-0018',
    invoiceNo: 'INV-2026-0018',
    customer: customers.c13,
    issuedAt: daysAgo(6),
    dueAt: daysAgo(1),
    status: 'OPEN',
    createdBy: 'Priya Verma',
    lines: [line('l-0018', PT, 9600), line('l-0018b', REG, 500)],
    allocations: []
  },
  {
    id: 'inv-0019',
    invoiceNo: 'INV-2026-0019',
    customer: customers.c7,
    issuedAt: daysAgo(4),
    dueAt: daysAgo(3),
    status: 'PARTIALLY_PAID',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0019', AP, 19200)],
    allocations: [alloc('a-0019', 8000, 'CASH', 'PYMT-2026-0115', 0, 12, 40, 'Sana Shaikh')]
  },
  {
    id: 'inv-0020',
    invoiceNo: 'INV-2026-0020',
    customer: customers.c8,
    issuedAt: daysAgo(3),
    dueAt: daysAgo(4),
    status: 'PARTIALLY_PAID',
    createdBy: 'Arjun Mehta',
    lines: [line('l-0020', QF, 4200)],
    allocations: [alloc('a-0020', 2000, 'UPI', 'PYMT-2026-0116', 0, 10, 30, 'Arjun Mehta')]
  },
  {
    id: 'inv-0021',
    invoiceNo: 'INV-2026-0021',
    customer: customers.c5,
    issuedAt: daysAgo(3),
    dueAt: daysAgo(4),
    status: 'OPEN',
    createdBy: 'Sana Shaikh',
    lines: [line('l-0021', HY, 8400)],
    allocations: []
  }
]

export { customers }
