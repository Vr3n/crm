import { useCallback, useMemo, useState } from 'react'
import { Eye, HandCoins } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTime } from '@/features/leads/format'
import { PAYMENT_METHOD_META } from '@/lib/payment-methods'
import { formatMoney } from '@/lib/money'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { ExportExcelButton } from '@/features/dashboard/components/export-excel-button'
import { PaymentDetailsSheet } from './payment-details-sheet'
import type { PaymentRecord } from '../types'

const helper = createColumnHelper<DashboardFeatures, PaymentRecord>()

function buildColumns(onView: (row: PaymentRecord) => void): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor('reference', {
      id: 'reference',
      header: () => 'Reference',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {row.original.reference}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(row.original.receivedAt)}
          </span>
        </div>
      ),
      sortFn: 'text'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{row.original.customer.name}</span>
          {row.original.customer.phone ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.original.customer.phone}
            </span>
          ) : null}
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('method', {
      id: 'method',
      header: () => 'Method',
      cell: ({ row }) => {
        const meta = PAYMENT_METHOD_META[row.original.method]
        const Icon = meta.icon
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
            <Icon className="size-3.5" style={{ color: meta.color }} />
            {meta.label}
          </span>
        )
      },
      sortFn: 'text'
    }),
    helper.accessor((row) => row.allocations[0]?.invoiceNo ?? '', {
      id: 'allocatedTo',
      header: () => 'Allocated to',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          {row.original.allocations.length > 0 ? (
            <span className="font-mono text-sm font-medium tabular-nums">
              {row.original.allocations[0].invoiceNo}
              {row.original.allocations.length > 1
                ? ` +${row.original.allocations.length - 1}`
                : ''}
            </span>
          ) : (
            <span className="text-sm font-medium text-primary">On account</span>
          )}
          {row.original.notes && (
            <span className="max-w-48 truncate text-xs text-muted-foreground">
              {row.original.notes}
            </span>
          )}
        </div>
      ),
      sortFn: 'text'
    }),
    helper.accessor('amount', {
      id: 'amount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="xs"
          className="w-full justify-end rounded-md"
          onClick={() => column.toggleSorting()}
        >
          Amount
        </Button>
      ),
      cell: ({ row }) => (
        <span className="block w-full text-right font-mono text-sm font-semibold tabular-nums">
          {formatMoney(row.original.amount)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor('receivedBy', {
      id: 'receivedBy',
      header: () => 'Recorded by',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.receivedBy}</span>
      )
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="text-primary hover:bg-primary/10 hover:text-primary"
                aria-label={`View ${row.original.reference}`}
                onClick={() => onView(row.original)}
              >
                <Eye className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">View payment</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The day's payment ledger (Module 09 §63) — every rupee recorded on the
 * selected day, newest first. Rows open a drawer with the method, counterfoil
 * reference and allocation details.
 */
export function CollectionsTable({
  payments,
  isLoading
}: {
  payments: PaymentRecord[]
  isLoading: boolean
}): React.JSX.Element {
  const [selected, setSelected] = useState<PaymentRecord | null>(null)
  const [open, setOpen] = useState(false)

  const handleView = useCallback((row: PaymentRecord) => {
    setSelected(row)
    setOpen(true)
  }, [])
  const columns = useMemo(() => buildColumns(handleView), [handleView])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HandCoins className="size-5" />
            </span>
            <span className="font-heading text-lg">Payment ledger</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={payments}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'reference', desc: false }]}
            initialPageSize={10}
            pageSizeOptions={[10, 20, 50]}
            headerTone="primary"
            toolbar={<ExportExcelButton />}
            searchPlaceholder="Search payments…"
            emptyIcon={HandCoins}
            emptyTitle="No payments this day"
            emptyDescription="Nothing was recorded on this date."
            onRowClick={(row) => handleView(row)}
          />
        </CardContent>
      </Card>
      <PaymentDetailsSheet payment={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
