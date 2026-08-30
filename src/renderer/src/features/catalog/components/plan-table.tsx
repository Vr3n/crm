import { useMemo } from 'react'
import { History, Package, Pencil, Trash2 } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatMoney } from '@/lib/money'
import { billingFrequencyLabel, durationLabel } from '../constants'
import { formatDate } from '../format'
import type { Plan } from '../types'
import { PlanStatusBadge } from './catalog-status-badge'

const helper = createColumnHelper<DashboardFeatures, Plan>()

function buildColumns(
  onEdit: (plan: Plan) => void,
  onDelete: (plan: Plan) => void,
  onHistory: (plan: Plan) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.name, {
      id: 'name',
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.duration, {
      id: 'duration',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Duration
        </SortButton>
      ),
      cell: ({ row }) => <span className="text-sm">{durationLabel(row.original.duration)}</span>,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.billing, {
      id: 'billing',
      header: () => 'Billing',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm">{billingFrequencyLabel(row.original.billing)}</span>
    }),
    helper.accessor((row) => row.basePrice, {
      id: 'price',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Price
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatMoney(row.original.basePrice)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.taxRate, {
      id: 'tax',
      header: () => 'Tax',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.taxRate > 0
            ? `${row.original.taxCode ?? 'GST'} · ${row.original.taxRate}%`
            : '—'}
        </span>
      )
    }),
    helper.accessor((row) => row.registrationFee, {
      id: 'registration',
      header: () => 'Registration',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.registrationFee > 0
            ? formatMoney(row.original.registrationFee)
            : '—'}
        </span>
      )
    }),
    helper.accessor((row) => (row.accessWindow === 'TIMED' ? row.startTime : ''), {
      id: 'access',
      header: () => 'Access',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.accessWindow === 'TIMED'
            ? `${row.original.startTime}–${row.original.endTime}`
            : 'All hours'}
        </span>
      )
    }),
    helper.accessor((row) => row.createdAt, {
      id: 'created',
      header: () => 'Created',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.createdAt)}
        </span>
      )
    }),
    helper.accessor((row) => row.isActive, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => <PlanStatusBadge isActive={row.original.isActive} />
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(row.original)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit plan</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Price history for ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={() => onHistory(row.original)}
              >
                <History className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Price history</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete plan</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The plans list — the current pricing catalog. Row-click opens the editor;
 * deleting a plan also detaches it from any offer that targeted it.
 */
export function PlanTable({
  plans,
  isLoading,
  onEdit,
  onDelete,
  onHistory
}: {
  plans: Plan[]
  isLoading: boolean
  onEdit: (plan: Plan) => void
  onDelete: (plan: Plan) => void
  onHistory: (plan: Plan) => void
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(onEdit, onDelete, onHistory), [onEdit, onDelete, onHistory])

  return (
    <DataTable
      columns={columns}
      data={plans}
      getRowId={(row) => String(row.id)}
      isLoading={isLoading}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      initialSorting={[{ id: 'price', desc: true }]}
      onRowClick={onEdit}
      showSearch={false}
      emptyIcon={Package}
      emptyTitle="No plans match"
      emptyDescription="Try clearing the filters, or add a new plan to the catalog."
      headerTone="primary"
    />
  )
}