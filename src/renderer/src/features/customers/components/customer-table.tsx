import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { displayPhone } from '@/features/leads/format'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { cn } from '@/lib/utils'
import { EXPIRING_SOON_DAYS } from '../constants'
import { daysUntil, formatMonthYear, formatShortDate } from '../format'
import type { CustomerRow } from '../types'
import { CustomerStatusBadge } from './status-badge'
const helper = createColumnHelper<DashboardFeatures, CustomerRow>()

function ExpiresCell({ row, now }: { row: CustomerRow; now: number }): React.JSX.Element {
  if (!row.nextExpiry) {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const days = daysUntil(row.nextExpiry, now)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-medium tabular-nums">
        {formatShortDate(row.nextExpiry)}
      </span>
      <span
        className={cn(
          'text-xs',
          row.status === 'ACTIVE' && days <= EXPIRING_SOON_DAYS && 'text-warning',
          row.status === 'ACTIVE' && days > EXPIRING_SOON_DAYS && 'text-muted-foreground',
          row.status !== 'ACTIVE' && 'text-muted-foreground'
        )}
      >
        {row.status === 'ACTIVE' ? `${days}d left` : '—'}
      </span>
    </div>
  )
}

function buildColumns(now: number): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.customer.name, {
      id: 'name',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Customer
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.customer.name}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.customer.id}
          </p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.customer.phone ?? '', {
      id: 'contact',
      header: () => 'Contact',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground tabular-nums">
            {displayPhone(row.original.customer.phone)}
          </p>
          {row.original.customer.email ? (
            <p className="truncate text-xs text-muted-foreground/70">
              {row.original.customer.email}
            </p>
          ) : null}
        </div>
      )
    }),
    helper.accessor((row) => row.status, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => <CustomerStatusBadge status={row.original.status} />
    }),
    helper.accessor((row) => row.currentMembership?.plan ?? '', {
      id: 'plan',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Plan
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.currentMembership?.plan ?? 'No plan'}</span>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.nextExpiry ?? '', {
      id: 'expires',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Expires
        </SortButton>
      ),
      cell: ({ row }) => <ExpiresCell row={row.original} now={now} />,
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.customer.joinedAt, {
      id: 'joined',
      header: () => 'Joined',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatMonthYear(row.original.customer.joinedAt)}
        </span>
      )
    }),
    helper.accessor((row) => row.customer.ownerName ?? '', {
      id: 'owner',
      header: () => 'Owner',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.customer.ownerName ?? 'Unassigned'}
        </span>
      )
    })
  ])
}

/**
 * The customer directory table. Every column follows the table UI design guide:
 * primary-tinted header, bold record name, abbreviated dates, tabular mono
 * numbers, row-click through to the 360 view.
 */
export function CustomerTable({
  rows,
  now,
  isLoading,
  onOpen
}: {
  rows: CustomerRow[]
  now: number
  isLoading: boolean
  onOpen: (customerId: string) => void
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(now), [now])

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.customer.id}
      isLoading={isLoading}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      initialSorting={[{ id: 'status', desc: false }]}
      onRowClick={(row) => onOpen(row.customer.id)}
      showSearch={false}
      emptyIcon={Users}
      emptyTitle="No customers match"
      emptyDescription="Try widening the filters, or convert a won lead into a customer."
      headerTone="primary"
    />
  )
}
