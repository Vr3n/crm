import { useState } from 'react'
import { BellPlus, CalendarClock, Check, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline } from '@/components/timeline'
import { useCancelFollowUp, useCompleteFollowUp } from '../../queries'
import { EditFollowUpDialog } from '../edit-follow-up-dialog'
import { mapFollowUpsToEntries } from './follow-up-timeline'
import { dueLabel, formatDateTime } from '../../format'
import type { FollowUp } from '../../types'

function CurrentFollowUpRow({ followUp }: { followUp: FollowUp }) {
  const complete = useCompleteFollowUp()
  const cancel = useCancelFollowUp()
  const [editing, setEditing] = useState(false)
  const d = dueLabel(followUp.dueAt)

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{followUp.title}</p>
          <p
            className={cn(
              'flex items-center gap-1 text-xs',
              d.overdue ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            <CalendarClock className="size-3" />
            {d.overdue ? 'Overdue' : 'Due'} {d.text}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} title="Extend due date">
            <CalendarClock className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => complete.mutate({ followupId: followUp.id })}
            disabled={complete.isPending}
            title="Mark done"
          >
            <Check />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => cancel.mutate({ followupId: followUp.id })}
            disabled={cancel.isPending}
            title="Cancel follow-up"
          >
            <XCircle className="size-3.5" />
          </Button>
        </div>
      </div>
      <EditFollowUpDialog
        open={editing}
        onOpenChange={setEditing}
        followUp={{
          id: followUp.id,
          leadId: followUp.leadId,
          leadName: '',
          stage: 'NEW' as const,
          title: followUp.title,
          dueAt: followUp.dueAt,
          extensionReason: followUp.extensionReason,
          completedAt: followUp.completedAt,
          cancelledAt: followUp.cancelledAt
        }}
      />
    </>
  )
}

/**
 * Follow-ups panel (Module 01 §25): shows the current open follow-up with action buttons,
 * plus a timeline of all follow-up history. Previous/completed/cancelled rows are omitted
 * from the list since the timeline already covers them.
 */
export function FollowUpPanel({ lead }: { lead: { followUps: FollowUp[] } }): React.JSX.Element {
  const open = lead.followUps
    .filter((f) => !f.completedAt && !f.cancelledAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))

  const currentFollowUp = open[0] ?? null

  if (lead.followUps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BellPlus className="size-4" />
            </span>
            Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BellPlus className="size-4" />
          </span>
          Follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {currentFollowUp && <CurrentFollowUpRow followUp={currentFollowUp} />}
        {!currentFollowUp && (
          <p className="text-sm text-muted-foreground">All follow-ups completed.</p>
        )}
      </CardContent>
      {lead.followUps.length > 0 && (
        <>
          <div className="px-6">
            <div className="border-t border-border" />
          </div>
          <CardContent>
            <Timeline entries={mapFollowUpsToEntries(lead.followUps)} formatDate={formatDateTime} />
          </CardContent>
        </>
      )}
    </Card>
  )
}