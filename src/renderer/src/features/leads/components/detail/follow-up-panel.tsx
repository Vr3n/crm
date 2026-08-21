import { useState } from 'react'
import { CalendarClock, PhoneCall, Check, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline } from '@/components/timeline'
import { useCancelFollowUp, useCompleteFollowUp } from '../../queries'
import { EditFollowUpDialog } from '../edit-follow-up-dialog'
import { mapFollowUpsToEntries } from './follow-up-timeline'
import { dueLabel, formatDateTime } from '../../format'
import type { FollowUp } from '../../types'

/**
 * Follow-ups panel (Module 01 §25): pending / overdue / upcoming, completed, and cancelled.
 * Completing one marks it done and logs a Follow-up done activity.
 */
export function FollowUpPanel({ lead }: { lead: { followUps: FollowUp[] } }): React.JSX.Element {
  const complete = useCompleteFollowUp()
  const cancel = useCancelFollowUp()
  const [editing, setEditing] = useState<FollowUp | null>(null)

  const open = lead.followUps
    .filter((f) => !f.completedAt && !f.cancelledAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const done = lead.followUps
    .filter((f) => f.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
  const cancelled = lead.followUps
    .filter((f) => f.cancelledAt)
    .sort((a, b) => b.cancelledAt!.localeCompare(a.cancelledAt!))

  if (lead.followUps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-ups</CardTitle>
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
        <CardTitle className="text-base">Follow-ups</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {open.map((f) => {
          const d = dueLabel(f.dueAt)
          return (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.title}</p>
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
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditing(f)}
                  title="Extend due date"
                >
                  <CalendarClock className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => complete.mutate({ followupId: f.id })}
                  disabled={complete.isPending}
                  title="Mark done"
                >
                  <Check />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => cancel.mutate({ followupId: f.id })}
                  disabled={cancel.isPending}
                  title="Cancel follow-up"
                >
                  <XCircle className="size-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
        {done.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground line-through">{f.title}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PhoneCall className="size-3" /> done
            </span>
          </div>
        ))}
        {cancelled.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground line-through">{f.title}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="size-3" /> cancelled
            </span>
          </div>
        ))}
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
      {editing && (
        <EditFollowUpDialog
          open={Boolean(editing)}
          onOpenChange={(o) => {
            if (!o) setEditing(null)
          }}
          followUp={{
            id: editing.id,
            leadId: lead.followUps[0]?.leadId ?? 0,
            leadName: '',
            stage: 'NEW' as const,
            title: editing.title,
            dueAt: editing.dueAt,
            extensionReason: editing.extensionReason,
            completedAt: editing.completedAt,
            cancelledAt: editing.cancelledAt
          }}
        />
      )}
    </Card>
  )
}