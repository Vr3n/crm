import { useMemo } from 'react'
import { ReceiptText } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/features/leads/format'
import { formatMoney } from '@/features/dashboard/format'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Invoice', key: 'invoiceNo', format: 'text' },
  { header: 'Line', key: 'line', format: 'text' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Issued', key: 'issuedAt', format: 'date' },
  { header: 'Billed', key: 'total', format: 'money' },
  { header: 'Paid', key: 'paid', format: 'money' },
  { header: 'Outstanding', key: 'outstanding', format: 'money' },
  { header: 'Status', key: 'status', format: 'text' }
]
import { INVOICE_STATUS_META } from '../constants'
import { invoiceDue } from '../build'
import type { FinanceInvoice } from '../types'

const helper = createColumnHelper<DashboardFeatures, FinanceInvoice>()

function buildColumns(): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.invoiceNo, {
      id: 'invoiceNo',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Invoice
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{row.original.invoiceNo}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.line}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
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
    helper.accessor('issuedAt', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Issued
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{formatDate(row.original.issuedAt)}</span>
      ),
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.total, {
      id: 'total',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Billed
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{formatMoney(row.original.total)}</span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.paid, {
      id: 'paid',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Paid
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{formatMoney(row.original.paid)}</span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => invoiceDue(row), {
      id: 'due',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Outstanding
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold text-destructive tabular-nums">
          {formatMoney(invoiceDue(row.original))}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.status, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => {
        const meta = INVOICE_STATUS_META[row.original.status]
        return <Badge variant={meta.tone}>{meta.label}</Badge>
      }
    })
  ])
}

/**
 * Receivables (Module 09 §62). Every open or partially-paid invoice with the
 * amount still owed — the "what we are owed" half of the financial read.
 */
export function ReceivablesTable({
  invoices,
  isLoading
}: {
  invoices: FinanceInvoice[]
  isLoading: boolean
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(), [])
  const rows = useMemo(() => invoices.filter((i) => i.status !== 'VOID'), [invoices])

  const exportData = useMemo(
    () =>
      rows.map((r) => ({
        invoiceNo: r.invoiceNo,
        line: r.line,
        customer: r.customer.name,
        phone: r.customer.phone,
        issuedAt: r.issuedAt,
        total: r.total,
        paid: r.paid,
        outstanding: invoiceDue(r),
        status: r.status
      })),
    [rows]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ReceiptText className="size-5" />
          </span>
          <span className="font-heading text-lg">Receivables</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          initialSorting={[{ id: 'due', desc: true }]}
          initialPageSize={8}
          pageSizeOptions={[8, 16, 32]}
          headerTone="primary"
          toolbar={
            <ExportExcelButton
              columns={EXPORT_COLUMNS}
              rows={exportData}
              sheetName="Receivables"
            />
          }
          searchPlaceholder="Search invoice, customer…"
          emptyIcon={ReceiptText}
          emptyTitle="Nothing outstanding"
          emptyDescription="Open and partially paid invoices will appear here."
        />
      </CardContent>
    </Card>
  )
}
