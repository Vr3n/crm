import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
import { useNow } from '@/lib/use-now'
import { buildCustomerRow } from '../build'
import { CustomerFilters } from '../components/customer-filters'
import { CustomerMetrics } from '../components/customer-metrics'
import { CustomerTable } from '../components/customer-table'
import { filterCustomers, sortCustomerRows } from '../filters'
import { useCustomers } from '../queries'
import type { CustomerFilters as CustomerFilterState } from '../types'

const DEFAULT_FILTERS: CustomerFilterState = {
  search: '',
  status: 'ALL',
  plan: 'ALL',
  ownerId: 'ALL'
}

/**
 * Customers (Module 02) — the directory. Every row is a derived read model over
 * the membership history (Customer ≠ Active Member, docs/02 §4): status comes
 * from dates + open freezes, never a cached column. Row-click opens the 360
 * view.
 */
export function CustomersPage(): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const now = useNow()
  const { data, isLoading } = useCustomers()
  const [filters, setFilters] = useState<CustomerFilterState>(DEFAULT_FILTERS)

  const rows = useMemo(() => {
    if (!data) return []
    const derived = data.map((c) => buildCustomerRow(c, now))
    return sortCustomerRows(filterCustomers(derived, filters))
  }, [data, filters, now])

  function openCustomer(customerId: string): void {
    navigate(`/customers/${customerId}`, { state: { from: '/customers' } })
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Customers"
        description={`${session.organizationName} · customer directory`}
      />

      <CustomerMetrics rows={rows} now={now} />

      <CustomerFilters filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {rows.length} customer{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <CustomerTable rows={rows} now={now} isLoading={isLoading} onOpen={openCustomer} />
    </div>
  )
}
