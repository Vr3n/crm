import { useMemo } from 'react'
import { Undo2 } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { formatMoney } from '@/features/dashboard/format'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { PAYMENT_METHODS } from '../constants'
import { PaymentMethodBadge } from './payment-method-badge'
import type { PaymentMethod, Refund } from '../types'

const helper = createColumnHelper<DashboardFeatures, Refund>()

function buildColumns(): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.refundNo, {
      id: 'refundNo',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Refund
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{row.original.refundNo}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('refundDate', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Date
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-medium tabular-nums">
            {formatDateTime(row.original.refundDate)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(row.original.refundDate)}</span>
        </div>
      ),
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.customer.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {row.original.customer.phone}
          </p>
        </div>
      )
    }),
    helper.accessor('sourcePaymentNo', {
      header: () => 'Against',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.sourcePaymentNo}
        </span>
      )
    }),
    helper.accessor('amount', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Amount
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold text-destructive tabular-nums">
          −{formatMoney(row.original.amount)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.reason, {
      id: 'reason',
      header: () => 'Reason',
      enableSorting: false,
      cell: ({ row }) => (
        <p className="max-w-52 truncate text-sm text-muted-foreground">{row.original.reason}</p>
      )
    }),
    helper.accessor('method', {
      header: () => 'Method',
      enableSorting: false,
      cell: ({ row }) => <PaymentMethodBadge method={row.original.method} />
    })
  ])
}

/**
 * The refunds table (Module 05 §17). Every refund is a separate, dated, reasoned
 * record layered on top of the source payment — the original payment is never
 * edited, and the "against" column keeps the audit trail visible.
 */
export function RefundsTable({
  refunds,
  isLoading,
  method,
  onMethodChange,
  onOpen
}: {
  refunds: Refund[]
  isLoading: boolean
  method: PaymentMethod | 'ALL'
  onMethodChange: (m: PaymentMethod | 'ALL') => void
  onOpen: (refund: Refund) => void
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(), [])

  return (
    <DataTable
      columns={columns}
      data={refunds}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'refundDate', desc: true }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search refund, customer, reason…"
      onRowClick={onOpen}
      emptyIcon={Undo2}
      emptyTitle="No refunds issued"
      emptyDescription="Refunds you issue from the button above will appear here."
      card
      headerTone="primary"
      toolbar={
        <Select value={method} onValueChange={(v) => onMethodChange(v as PaymentMethod | 'ALL')}>
          <SelectTrigger size="sm" className="h-8 w-40 gap-1 rounded-md text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="ALL">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}
