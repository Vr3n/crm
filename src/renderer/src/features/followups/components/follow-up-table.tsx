import { useCallback, useMemo } from 'react'
import { Check, CheckCircle2, Inbox } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCompleteFollowUp } from '@/features/leads/queries'
import { StageBadge } from '@/features/leads/components/stage-badge'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { cn } from '@/lib/utils'
import { bucketOf } from '../build'
import type { FollowUpBucket, FollowUpRow } from '../types'

const helper = createColumnHelper<DashboardFeatures, FollowUpRow>()

function CompleteFollowUpButton({
  followUpId,
  onDone
}: {
  followUpId: string
  onDone: () => void
}): React.JSX.Element {
  const complete = useCompleteFollowUp()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="text-success hover:bg-success/10 hover:text-success"
          aria-label="Mark follow-up done"
          disabled={complete.isPending}
          onClick={(e) => {
            e.stopPropagation()
            complete.mutate(followUpId, { onSuccess: onDone })
          }}
        >
          <Check className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Mark done</TooltipContent>
    </Tooltip>
  )
}

/** Due column: mono date, urgency-tinted relative line. */
function DueCell({ row }: { row: FollowUpRow }): React.JSX.Element {
  const bucket = bucketOf(row)
  const relative = row.completedAt ? timeAgo(row.completedAt) : timeAgo(row.dueAt)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-medium tabular-nums">
        {formatDateTime(row.dueAt)}
      </span>
      <span
        className={cn(
          'text-xs',
          bucket === 'overdue' && 'text-destructive',
          bucket === 'today' && 'text-primary',
          (bucket === 'upcoming' || bucket === 'done') && 'text-muted-foreground'
        )}
      >
        {row.completedAt
          ? `Done ${relative}`
          : bucket === 'overdue'
            ? `Overdue ${relative}`
            : `Due ${relative}`}
      </span>
    </div>
  )
}

/** Urgency badge for the status column. */
function StatusBadge({ row }: { row: FollowUpRow }): React.JSX.Element {
  const bucket = bucketOf(row)
  const variant =
    bucket === 'overdue'
      ? 'destructive'
      : bucket === 'today'
        ? 'default'
        : bucket === 'done'
          ? 'success'
          : 'outline'
  const label =
    bucket === 'done'
      ? 'Done'
      : bucket === 'overdue'
        ? 'Overdue'
        : bucket === 'today'
          ? 'Today'
          : 'Upcoming'
  return (
    <Badge variant={variant} className="rounded-full px-2.5 py-0.5">
      {bucket === 'done' ? <CheckCircle2 className="size-3" /> : null}
      {label}
    </Badge>
  )
}

function buildColumns(
  bucket: FollowUpBucket,
  onDone: () => void
): ReturnType<typeof helper.columns> {
  return helper
    .columns([
      helper.accessor((row) => row.leadName, {
        id: 'leadName',
        header: ({ column }) => (
          <SortButton
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            Lead
          </SortButton>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.leadName}</p>
            <StageBadge stage={row.original.stage} className="mt-0.5" />
          </div>
        ),
        sortFn: 'alphanumeric'
      }),
      helper.accessor((row) => row.title, {
        id: 'title',
        header: ({ column }) => (
          <SortButton
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            What to do
          </SortButton>
        ),
        cell: ({ row }) => (
          <div className="min-w-0 max-w-56">
            <p className="truncate text-sm font-medium">{row.original.title}</p>
            {row.original.note ? (
              <p className="truncate text-xs text-muted-foreground">{row.original.note}</p>
            ) : null}
          </div>
        ),
        sortFn: 'alphanumeric'
      }),
      helper.accessor('dueAt', {
        header: ({ column }) => (
          <SortButton
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            Due
          </SortButton>
        ),
        cell: ({ row }) => <DueCell row={row.original} />,
        sortFn: 'datetime'
      }),
      helper.accessor((row) => row.ownerName ?? '', {
        id: 'ownerName',
        header: () => 'Owner',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.ownerName ?? 'Unassigned'}
          </span>
        )
      }),
      helper.accessor((row) => bucketOf(row), {
        id: 'status',
        header: () => 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge row={row.original} />
      }),
      helper.display({
        id: 'actions',
        header: () => null,
        cell: ({ row }) =>
          row.original.completedAt ? null : (
            <div className="flex items-center justify-end">
              <CompleteFollowUpButton followUpId={row.original.id} onDone={onDone} />
            </div>
          )
      })
    ])
    .filter((c) => !(bucket === 'done' && c.id === 'actions'))
}

/**
 * The follow-up queue table: every open follow-up across leads, sorted by
 * urgency, with an inline "mark done" verb and row-click through to the lead.
 */
export function FollowUpTable({
  rows,
  bucket,
  isLoading,
  onOpenLead
}: {
  rows: FollowUpRow[]
  bucket: FollowUpBucket
  isLoading: boolean
  onOpenLead: (leadId: string) => void
}): React.JSX.Element {
  const handleDone = useCallback(() => {
    // nothing extra — the leads query invalidation refreshes this table
  }, [])
  const columns = useMemo(() => buildColumns(bucket, handleDone), [bucket, handleDone])

  const emptyCopy: Record<FollowUpBucket, { title: string; description: string }> = {
    all: {
      title: 'No follow-ups scheduled',
      description: 'Schedule one from any lead or the button above.'
    },
    overdue: {
      title: 'Nothing overdue',
      description: 'No follow-up is past its due time. Clear queue.'
    },
    today: { title: 'Nothing due today', description: 'No follow-up is due today.' },
    upcoming: { title: 'No upcoming follow-ups', description: 'Nothing scheduled past today.' },
    done: { title: 'Nothing completed', description: 'Follow-ups you mark done will appear here.' }
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'dueAt', desc: false }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      onRowClick={(row) => onOpenLead(row.leadId)}
      showSearch={false}
      emptyIcon={bucket === 'done' ? CheckCircle2 : Inbox}
      emptyTitle={emptyCopy[bucket].title}
      emptyDescription={emptyCopy[bucket].description}
      card
      headerTone="primary"
    />
  )
}
