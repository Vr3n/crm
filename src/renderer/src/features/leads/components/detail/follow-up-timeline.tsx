import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline, type TimelineEntry } from '@/components/timeline'
import { formatDateTime } from '../../format'
import { dueLabel } from '../../format'
import type { FollowUp } from '../../types'

/**
 * Maps a FollowUp array into generic TimelineEntry[] for the universal
 * Timeline component. Open follow-ups are shown first (overdue first),
 * then completed, then cancelled.
 */
export function mapFollowUpsToEntries(followUps: FollowUp[]): TimelineEntry[] {
  const open = followUps
    .filter((f) => !f.completedAt && !f.cancelledAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))

  const done = followUps
    .filter((f) => f.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))

  const cancelled = followUps
    .filter((f) => f.cancelledAt)
    .sort((a, b) => b.cancelledAt!.localeCompare(a.cancelledAt!))

  const entries: TimelineEntry[] = []

  for (const f of open) {
    const d = dueLabel(f.dueAt)
    entries.push({
      id: f.id,
      label: f.title,
      date: f.dueAt,
      description: d.overdue ? 'This follow-up is overdue.' : undefined,
      icon: CalendarClock,
      iconTone: d.overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
      badge: {
        label: d.overdue ? 'Overdue' : 'Upcoming',
        variant: d.overdue ? 'destructive' : 'default'
      },
      meta: `Due ${d.text}`
    })
  }

  for (const f of done) {
    entries.push({
      id: f.id,
      label: f.title,
      date: f.completedAt!,
      icon: CheckCircle2,
      iconTone: 'bg-success/15 text-success',
      badge: { label: 'Done', variant: 'success' },
      meta: f.extensionReason ? `Extended: ${f.extensionReason}` : undefined
    })
  }

  for (const f of cancelled) {
    entries.push({
      id: f.id,
      label: f.title,
      date: f.cancelledAt!,
      icon: XCircle,
      iconTone: 'bg-destructive/10 text-destructive',
      badge: { label: 'Cancelled', variant: 'destructive' }
    })
  }

  return entries
}

/**
 * Follow-ups as a timeline — every scheduled, completed, and cancelled
 * follow-up rendered chronologically using the universal Timeline component.
 */
export function FollowUpTimeline({ followUps }: { followUps: FollowUp[] }): React.JSX.Element {
  const entries = mapFollowUpsToEntries(followUps)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" />
          Follow-ups
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} event{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups scheduled yet.</p>
        ) : (
          <Timeline entries={entries} formatDate={formatDateTime} />
        )}
      </CardContent>
    </Card>
  )
}
