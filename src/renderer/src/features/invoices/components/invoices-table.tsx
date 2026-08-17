import { useCallback, useMemo, useState } from 'react'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Eye, ReceiptText } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/features/leads/format'
import { formatMoney } from '@/lib/money'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import {
  DateRangePicker,
  type DateRangePreset
} from '@/features/dashboard/components/date-range-picker'
import { ExportExcelButton } from '@/features/dashboard/components/export-excel-button'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { INVOICE_PAGE_SIZES, INVOICE_STATUS_META, INVOICE_STATUS_OPTIONS } from '../constants'
import { useInvoices } from '../queries'
import type { Invoice, InvoiceStatus } from '../types'
import { InvoiceCustomerCell } from './invoice-customer-cell'
import { InvoiceDetailsSheet } from './invoice-details-sheet'
import { InvoiceStatusBadge } from './invoice-status-badge'

const helper = createColumnHelper<DashboardFeatures, Invoice>()

/** The paid/due line under Total, communicating settlement without a second column. */
function AmountContext({ invoice }: { invoice: Invoice }): React.JSX.Element {
  if (invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') {
    return <span className="text-xs text-muted-foreground">Not collected</span>
  }
  if (invoice.outstanding > 0) {
    return (
      <span className="text-xs font-medium text-destructive tabular-nums">
        Due {formatMoney(invoice.outstanding)}
      </span>
    )
  }
  return <span className="text-xs text-success tabular-nums">Settled</span>
}

function buildColumns(onView: (row: Invoice) => void): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor('issuedAt', {
      id: 'issuedAt',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Invoice
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {row.original.invoiceNo}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(row.original.issuedAt)}</span>
        </div>
      ),
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer',
      cell: ({ row }) => <InvoiceCustomerCell customer={row.original.customer} />,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.lines.map((l) => l.description).join(' '), {
      id: 'description',
      header: () => 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="block max-w-64 truncate text-sm font-medium">
            {row.original.lines[0]?.description}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.lines.length} {row.original.lines.length === 1 ? 'line' : 'lines'} ·{' '}
            {formatMoney(row.original.subtotal)} pre-tax
          </span>
        </div>
      )
    }),
    helper.accessor('total', {
      id: 'total',
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Total
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(row.original.total)}
          </span>
          <AmountContext invoice={row.original} />
        </div>
      ),
      sortFn: 'basic'
    }),
    helper.accessor('paidAmount', {
      id: 'paidAmount',
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Paid
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatMoney(row.original.paidAmount)}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.allocations.length}{' '}
            {row.original.allocations.length === 1 ? 'payment' : 'payments'}
          </span>
        </div>
      ),
      sortFn: 'basic'
    }),
    helper.accessor('status', {
      id: 'status',
      header: () => 'Status',
      cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      sortFn: 'text'
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
                aria-label={`View ${row.original.invoiceNo}`}
                onClick={() => onView(row.original)}
              >
                <Eye className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">View invoice</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * Invoice register (Module 04 / 09 §62) — the authoritative list of finalized
 * obligations. Data table with issued-date range + status filters, search,
 * sortable totals and a details drawer on every row.
 */
export function InvoicesTable(): React.JSX.Element {
  const { data, isLoading } = useInvoices()
  const [range, setRange] = useState<DateRange>()
  const [status, setStatus] = useState<InvoiceStatus | undefined>()
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [open, setOpen] = useState(false)

  const handleView = useCallback((row: Invoice) => {
    setSelected(row)
    setOpen(true)
  }, [])
  const columns = useMemo(() => buildColumns(handleView), [handleView])

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Today', from: startOfDay(now), to: now },
      { label: 'Last 7d', from: subDays(now, 6) },
      { label: 'Last 30d', from: subDays(now, 29) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(() => {
    const rows = data ?? []
    const byStatus = status ? rows.filter((r) => r.status === status) : rows
    if (!range?.from && !range?.to) return byStatus
    const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
    const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
    return byStatus.filter((r) => {
      const t = new Date(r.issuedAt).getTime()
      return t >= from && t <= to
    })
  }, [data, range, status])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ReceiptText className="size-5" />
            </span>
            <span className="font-heading text-lg">Invoice register</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'issuedAt', desc: true }]}
            initialPageSize={10}
            pageSizeOptions={INVOICE_PAGE_SIZES}
            headerTone="primary"
            toolbar={
              <>
                <DateRangePicker
                  presets={presets}
                  value={range}
                  onValueChange={setRange}
                  placeholder="Filter by issued"
                />
                <Select
                  value={status ?? 'ALL'}
                  onValueChange={(v) => setStatus(v === 'ALL' ? undefined : (v as InvoiceStatus))}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-40 gap-2 rounded-md px-3 text-xs shadow-sm"
                  >
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {INVOICE_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {INVOICE_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ExportExcelButton />
              </>
            }
            searchPlaceholder="Search invoices…"
            emptyIcon={ReceiptText}
            emptyTitle="No invoices"
            emptyDescription="Invoices in this range and status will appear here."
            onRowClick={(row) => handleView(row)}
          />
        </CardContent>
      </Card>
      <InvoiceDetailsSheet invoice={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
