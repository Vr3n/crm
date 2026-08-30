import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Wallet } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/features/leads/format'
import { formatMoney } from '../format'
import { PAGE_SIZE_OPTIONS } from '../constants'
import { usePaymentsDue } from '../queries'
import type { PaymentDue } from '../types'
import { DataTable, type DashboardFeatures } from './data-table'
import { DateRangePicker, type DateRangePreset } from './date-range-picker'
import { ContactCell } from './contact-cell'
import { MemberDetailsSheet } from './member-details-sheet'
import { NameCell } from './name-cell'
import { RowActions } from './row-actions'
import { SortButton } from './sort-button'
import { ExportExcelButton } from './export-excel-button'

const helper = createColumnHelper<DashboardFeatures, PaymentDue>()

function buildColumns(
  onView: (row: PaymentDue) => void,
  onMakePayment: (row: PaymentDue) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.member.name, {
      id: 'memberName',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Client
        </SortButton>
      ),
      cell: ({ row }) => <NameCell name={row.original.member.name} />,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.member, {
      id: 'contact',
      header: () => 'Contact',
      enableSorting: false,
      cell: ({ row }) => (
        <ContactCell phone={row.original.member.phone} email={row.original.member.email} />
      )
    }),
    helper.accessor('amountDue', {
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Amount due
        </SortButton>
      ),
      cell: ({ row }) => (
        <AmountCell amountDue={row.original.amountDue} total={row.original.total} />
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row, {
      id: 'plan',
      header: () => <span className="block w-full text-right">Plan</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.plan.replace(/\s*\(.*$/, '')
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              Bought {formatDate(row.original.purchasedAt)}
            </span>
          </div>
        )
      }
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <RowActions
          memberName={row.original.member.name}
          onView={() => onView(row.original)}
          onMakePayment={() => onMakePayment(row.original)}
        />
      )
    })
  ])
}

/** Money cell, right-aligned, success tone, with the total as muted context. */
function AmountCell({ amountDue, total }: { amountDue: number; total: number }): React.JSX.Element {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-sm font-semibold tabular-nums text-success">
        {formatMoney(amountDue)}
      </span>
      <span className="text-xs text-muted-foreground">of {formatMoney(total)}</span>
    </div>
  )
}

/**
 * Unpaid member obligations (Module 09 §58) — the collection queue. A data
 * table with date-range filter + search, sortable by amount due (largest
 * first by default), pagination and icon-only actions.
 */
export function PaymentsDueTable({
  onMakePayment
}: {
  onMakePayment: (invoiceId: string) => void
}): React.JSX.Element {
  const { data, isLoading } = usePaymentsDue()
  const navigate = useNavigate()
  const location = useLocation()
  const [range, setRange] = useState<DateRange>()
  const [row, setRow] = useState<PaymentDue | null>(null)
  const [open, setOpen] = useState(false)

  const handleView = useCallback((selected: PaymentDue) => {
    setRow(selected)
    setOpen(true)
  }, [])

  const handleRowClick = useCallback(
    (row: PaymentDue) => {
      navigate(`/invoices/${row.id}`, { state: { from: location.pathname } })
    },
    [navigate, location.pathname]
  )

  const handleMakePayment = useCallback(
    (selected: PaymentDue) => {
      onMakePayment(selected.id)
    },
    [onMakePayment]
  )

  const columns = useMemo(
    () => buildColumns(handleView, handleMakePayment),
    [handleView, handleMakePayment]
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Last 7d', from: subDays(now, 7) },
      { label: 'Last 30d', from: subDays(now, 30) },
      { label: 'Last 90d', from: subDays(now, 90) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.amountDue > 0)
    if (!range?.from && !range?.to) return rows
    const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
    const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
    return rows.filter((r) => {
      const t = new Date(r.purchasedAt).getTime()
      return t >= from && t <= to
    })
  }, [data, range])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <Wallet className="size-5" />
            </span>
            <div>
              <span className="font-heading text-lg">Payments due</span>
              <p className="text-xs font-normal text-muted-foreground">
                Outstanding member obligations awaiting collection
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'amountDue', desc: true }]}
            initialPageSize={6}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onRowClick={handleRowClick}
            toolbar={
              <>
                <DateRangePicker
                  presets={presets}
                  value={range}
                  onValueChange={setRange}
                  placeholder="Filter by purchase"
                />
                <ExportExcelButton />
              </>
            }
            searchPlaceholder="Search members…"
            emptyIcon={Wallet}
            emptyTitle="Nothing outstanding"
            emptyDescription="Members with unpaid dues in this range will appear here."
          />
        </CardContent>
      </Card>
      <MemberDetailsSheet row={row} open={open} onOpenChange={setOpen} />
    </>
  )
}
