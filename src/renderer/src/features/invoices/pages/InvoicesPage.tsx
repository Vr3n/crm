import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { useInvoices } from '../queries'
import { InvoiceMetrics } from '../components/invoice-metrics'
import { InvoicesTable } from '../components/invoices-table'

/**
 * Invoices (Module 04 · Billing) — the authoritative register of finalized
 * obligations. KPIs are derived from the read model, the table carries
 * status/date/search filtering, and every row opens the immutable billing
 * snapshot (lines, tax, allocations) in a drawer. "New invoice" is an honest
 * placeholder: invoice creation is a module 04 command, not a UI mock.
 */
export function InvoicesPage(): React.JSX.Element {
  const { data } = useInvoices()

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Invoices"
        description="Finalized obligations with immutable lines, tax and numbering."
        actions={
          <>
            <Badge variant="secondary" className="rounded-none">
              Module 04 · Billing
            </Badge>
            <Button
              onClick={() =>
                toast('New invoice', {
                  description: 'Invoice creation arrives with the Billing module command layer.'
                })
              }
            >
              <Plus />
              New invoice
            </Button>
          </>
        }
      />

      <InvoiceMetrics invoices={data ?? []} />

      <InvoicesTable />
    </div>
  )
}
