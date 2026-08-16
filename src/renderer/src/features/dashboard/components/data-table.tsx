import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  createSortedRowModel,
  createPaginatedRowModel,
  createFilteredRowModel,
  sortFns,
  filterFns,
  type ColumnDef,
  type RowData,
  type SortingState
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { SearchInput } from './search-input'
import { useDebouncedValue } from './use-debounced-value'
import { DataTablePagination } from './data-table-pagination'

/**
 * TanStack Table v9 (feature-based) data table wired for the dashboard cards:
 * sortable headers, a debounced global search, client-side pagination and a
 * skeleton loading state. The date-range filter is applied upstream in the
 * card (the data passed in is already range-filtered), so this component stays
 * generic and reusable.
 *
 * Column definitions must be created with `createColumnHelper<DashboardFeatures, T>()`
 * so they share the same feature type as this table instance.
 */
const tableFeaturesInstance = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns,
  filterFns
})

/** The exact feature set this table uses — bind column helpers to it. */
export type DashboardFeatures = typeof tableFeaturesInstance

const HEAD = 'px-0 py-2 align-middle whitespace-nowrap text-muted-foreground'
const CELL = 'px-0 py-2 align-middle whitespace-nowrap'

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DashboardFeatures, TData, unknown>[]
  data: TData[]
  getRowId: (row: TData) => string
  isLoading?: boolean
  skeletonRows?: number
  initialSorting?: SortingState
  initialPageSize?: number
  pageSizeOptions?: number[]
  toolbar?: React.ReactNode
  searchPlaceholder?: string
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  isLoading = false,
  skeletonRows = 5,
  initialSorting,
  initialPageSize = 6,
  pageSizeOptions = [6, 12, 24],
  toolbar,
  searchPlaceholder = 'Search…',
  emptyIcon = Inbox,
  emptyTitle = 'No results',
  emptyDescription
}: DataTableProps<TData>): React.JSX.Element {
  const [search, setSearch] = useState('')
  const globalFilter = useDebouncedValue(search, 300)

  const columnDefs = useMemo(() => columns, [columns])
  const rowsData = useMemo(() => data, [data])

  const table = useTable({
    features: tableFeaturesInstance,
    columns: columnDefs,
    data: rowsData,
    getRowId,
    globalFilterFn: 'includesString',
    initialState: {
      sorting: initialSorting,
      pagination: { pageIndex: 0, pageSize: initialPageSize }
    },
    state: { globalFilter },
    onGlobalFilterChange: () => {
      // global filter is derived from the debounced search value
    }
  })

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-2">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.state.pagination

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="ml-auto min-w-0 flex-1 sm:max-w-56">
          <SearchInput value={search} onChange={setSearch} placeholder={searchPlaceholder} />
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className={HEAD}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer transition-colors">
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={CELL}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="px-0 py-6">
                <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <DataTablePagination
        pageIndex={pageIndex}
        pageCount={table.getPageCount()}
        pageSize={pageSize}
        rowCount={total}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={table.setPageSize}
        onPageIndexChange={table.setPageIndex}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
      />
    </div>
  )
}
