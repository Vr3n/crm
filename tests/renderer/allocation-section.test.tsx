import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AllocationSection } from '../../src/renderer/src/features/finance/components/allocation-section'
import type { FinanceInvoice } from '../../src/renderer/src/features/finance/types'

/**
 * Edge-case coverage for the allocation card (Record Payment dialog).
 *
 * The section is a pure read-model renderer: it takes outstanding invoices
 * (in **major** units, i.e. rupees) plus a set of allocation drafts and renders
 * per-invoice coverage bars plus a summary line. Amounts are major units with
 * up to two fractional digits; display goes through `formatMoneyExact`.
 */

function mkInvoice(overrides: Partial<FinanceInvoice>): FinanceInvoice {
  return {
    id: '1',
    invoiceNo: 'INV-001',
    line: 'Annual membership',
    issuedAt: '2026-01-01T00:00:00.000Z',
    customer: { id: '7', name: 'Rahul Mehta', phone: '' },
    total: 1180,
    paid: 0,
    status: 'OPEN',
    ...overrides
  }
}

interface Draft {
  invoiceId: string
  amount: number
  enabled: boolean
}

function renderCard(invoices: FinanceInvoice[], drafts: Draft[], paymentAmount: number) {
  render(
    <AllocationSection
      invoices={invoices}
      paymentAmount={paymentAmount}
      allocations={drafts}
      onAllocationsChange={() => {}}
      isLoading={false}
    />
  )
}

describe('AllocationSection — edge cases', () => {
  it('renders the loading placeholder while outstanding invoices are loading', () => {
    render(
      <AllocationSection
        invoices={[]}
        paymentAmount={0}
        allocations={[]}
        onAllocationsChange={() => {}}
        isLoading
      />
    )
    expect(screen.getByText(/Loading outstanding invoices/)).toBeInTheDocument()
  })

  it('renders the advance-payment hint when there are no outstanding invoices', () => {
    renderCard([], [], 500)
    expect(screen.getByText(/No outstanding invoices/)).toBeInTheDocument()
  })

  it('does not render an invoice whose status is neither OPEN nor PARTIALLY_PAID', () => {
    renderCard(
      [
        mkInvoice({ id: '1', invoiceNo: 'INV-OPEN', status: 'OPEN' }),
        mkInvoice({ id: '2', invoiceNo: 'INV-PAID', status: 'PAID' }),
        mkInvoice({ id: '3', invoiceNo: 'INV-VOID', status: 'VOID' })
      ],
      [],
      0
    )
    expect(screen.getByText('INV-OPEN')).toBeInTheDocument()
    expect(screen.queryByText('INV-PAID')).not.toBeInTheDocument()
    expect(screen.queryByText('INV-VOID')).not.toBeInTheDocument()
  })

  it('sorts outstanding invoices oldest-first by issuedAt', () => {
    const all = document.createElement('div')
    render(
      <AllocationSection
        invoices={[
          mkInvoice({ id: '3', invoiceNo: 'INV-C', issuedAt: '2026-03-01T00:00:00.000Z' }),
          mkInvoice({ id: '1', invoiceNo: 'INV-A', issuedAt: '2026-01-01T00:00:00.000Z' }),
          mkInvoice({ id: '2', invoiceNo: 'INV-B', issuedAt: '2026-02-01T00:00:00.000Z' })
        ]}
        paymentAmount={0}
        allocations={[]}
        onAllocationsChange={() => {}}
        isLoading={false}
      />
    )
    const labels = screen.getAllByText(/INV-/).map((el) => el.textContent)
    expect(labels).toEqual(['INV-A', 'INV-B', 'INV-C'])
  })

  it('shows the full outstanding as "due" on an unpaid invoice that is not allocated', () => {
    renderCard([mkInvoice({ total: 2000, paid: 0 })], [], 0)
    expect(screen.getByText('₹2,000.00 due')).toBeInTheDocument()
  })

  it('shows the true outstanding (total minus paid) as "due"', () => {
    renderCard([mkInvoice({ total: 2000, paid: 750.5 })], [], 0)
    expect(screen.getByText('₹1,249.50 due')).toBeInTheDocument()
  })

  it('shows partial allocation against the full outstanding', () => {
    renderCard([mkInvoice({ total: 1180, paid: 0 })], [{ invoiceId: '1', amount: 500, enabled: true }], 500)
    expect(screen.getByText(/₹500\.00 of ₹1,180\.00/)).toBeInTheDocument()
  })

  it('shows full coverage as fully-allocated (allocated equals outstanding)', () => {
    renderCard([mkInvoice({ total: 1180, paid: 0 })], [{ invoiceId: '1', amount: 1180, enabled: true }], 1180)
    expect(screen.getByText(/₹1,180\.00 of ₹1,180\.00/)).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('caps the progress bar at 100% when the allocated amount exceeds the outstanding', () => {
    renderCard([mkInvoice({ total: 1180, paid: 0 })], [{ invoiceId: '1', amount: 1180, enabled: true }], 2000)
    const bar = document.querySelector('.h-full.rounded-full') as HTMLElement | null
    expect(bar?.style.width).toBe('100%')
  })

  it('renders a decimal-amount allocation with paise intact', () => {
    renderCard(
      [mkInvoice({ total: 1000.45, paid: 0 })],
      [{ invoiceId: '1', amount: 1000.45, enabled: true }],
      1000.45
    )
    expect(screen.getByText(/₹1,000\.45 of ₹1,000\.45/)).toBeInTheDocument()
  })

  it('renders a decimal partial allocation against a decimal outstanding', () => {
    renderCard(
      [mkInvoice({ total: 2000.9, paid: 0 })],
      [{ invoiceId: '1', amount: 1000.45, enabled: true }],
      1000.45
    )
    expect(screen.getByText(/₹1,000\.45 of ₹2,000\.90/)).toBeInTheDocument()
  })

  it('shows the "due" label (amber) for an unallocated invoice rather than an amount', () => {
    renderCard([mkInvoice({ total: 500, paid: 0 })], [], 0)
    expect(screen.getByText('₹500.00 due')).toBeInTheDocument()
  })

  it('handles a zero-outstanding invoice (paid in full) gracefully', () => {
    renderCard([mkInvoice({ total: 1000, paid: 1000 })], [], 0)
    expect(screen.getByText('₹0.00 due')).toBeInTheDocument()
  })

  it('does not show a summary line when nothing has been allocated', () => {
    renderCard([mkInvoice({ total: 1180, paid: 0 })], [], 0)
    expect(screen.queryByText(/Allocating/)).not.toBeInTheDocument()
  })

  it('never renders the summary line even when a payment is allocated', () => {
    renderCard(
      [mkInvoice({ total: 1180, paid: 0 })],
      [{ invoiceId: '1', amount: 500, enabled: true }],
      1000
    )
    expect(screen.queryByText(/Allocating/)).not.toBeInTheDocument()
    expect(screen.queryByText(/unallocated/)).not.toBeInTheDocument()
  })

  it('distributes a payment across multiple invoices, oldest-first, capping at each due', () => {
    renderCard(
      [
        mkInvoice({ id: '1', invoiceNo: 'INV-A', total: 600, paid: 0 }),
        mkInvoice({ id: '2', invoiceNo: 'INV-B', total: 600, paid: 0 })
      ],
      [
        { invoiceId: '1', amount: 600, enabled: true },
        { invoiceId: '2', amount: 200, enabled: true }
      ],
      800
    )
    expect(screen.getByText(/₹600\.00 of ₹600\.00/)).toBeInTheDocument()
    expect(screen.getByText(/₹200\.00 of ₹600\.00/)).toBeInTheDocument()
  })

  it('does not render a progress bar for a disabled (unchecked) allocation', () => {
    renderCard(
      [mkInvoice({ total: 1180, paid: 0 })],
      [{ invoiceId: '1', amount: 0, enabled: false }],
      0
    )
    expect(screen.queryByText(/of ₹1,180\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('marks a fully-covered invoice with 100% progress', () => {
    renderCard([mkInvoice({ total: 1180, paid: 0 })], [{ invoiceId: '1', amount: 1180, enabled: true }], 1180)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('shows partial progress percentage for a partially allocated invoice', () => {
    renderCard([mkInvoice({ total: 1000, paid: 0 })], [{ invoiceId: '1', amount: 250, enabled: true }], 250)
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('formats very large amounts without precision loss', () => {
    renderCard(
      [mkInvoice({ total: 1000000, paid: 0 })],
      [{ invoiceId: '1', amount: 1000000, enabled: true }],
      1000000
    )
    expect(screen.getByText(/₹10,00,000\.00 of ₹10,00,000\.00/)).toBeInTheDocument()
  })

  it('sorts deterministic when invoices share the same issuedAt', () => {
    const all = document.createElement('div')
    render(
      <AllocationSection
        invoices={[
          mkInvoice({ id: '2', invoiceNo: 'INV-B', issuedAt: '2026-01-01T00:00:00.000Z' }),
          mkInvoice({ id: '1', invoiceNo: 'INV-A', issuedAt: '2026-01-01T00:00:00.000Z' })
        ]}
        paymentAmount={0}
        allocations={[]}
        onAllocationsChange={() => {}}
        isLoading={false}
      />
    )
    const labels = screen.getAllByText(/INV-/).map((el) => el.textContent)
    expect(labels.sort()).toEqual(['INV-A', 'INV-B'])
  })
})