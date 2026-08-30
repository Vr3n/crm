import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCustomer } from '@/features/customers/queries'
import { InvoiceOverviewCard } from '@/features/customers/components/detail/invoice-overview-card'
import { MembershipOverviewCard } from '@/features/customers/components/detail/membership-overview-card'
import type { Lead } from '../../types'

/**
 * Rich commercial-history block for a converted lead: full membership cards
 * plus invoice cards, identical to what the Customer detail page shows.
 */
export function LeadCommerceCard({ lead }: { lead: Lead }): React.JSX.Element | null {
  const customerId = lead.customerId
  const { data: customer } = useCustomer(customerId !== undefined ? String(customerId) : undefined)

  if (!customer) return null

  const hasMemberships = customer.memberships.length > 0
  const hasInvoices = (customer.invoices ?? []).length > 0
  if (!hasMemberships && !hasInvoices) return null

  const now = Date.now()

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold tracking-tight">Commercial history</h3>
        <Button asChild size="sm" variant="outline">
          <Link to={`/customers/${String(customerId)}`}>
            Open customer <ExternalLink className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-6 md:flex-row">
        {hasMemberships ? (
          <div className="flex-1 space-y-4 rounded-lg border border-dashed p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Memberships
            </h4>
            <div className="grid gap-3">
              {[...customer.memberships]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((m) => (
                  <MembershipOverviewCard key={m.id} membership={m} now={now} />
                ))}
            </div>
          </div>
        ) : null}

        {hasInvoices ? (
          <div className="flex-1 space-y-4 rounded-lg border border-dashed p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invoices
            </h4>
            <div className="grid gap-3">
              {[...(customer.invoices ?? [])]
                .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
                .map((inv) => (
                  <InvoiceOverviewCard key={inv.id} invoice={inv} customerId={String(customerId)} />
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
