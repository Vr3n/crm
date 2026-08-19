import { CalendarClock, PhoneCall, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompleteFollowUp } from '../../queries'
import { dueLabel } from '../../format'
import type { Lead } from '../../types'

/**
 * Follow-ups panel (Module 01 §25): pending / overdue / upcoming and completed.
 * Completing one marks it done and logs a Follow-up done activity.
 */
export function FollowUpPanel({ lead }: { lead: Lead }): React.JSX.Element {
  const complete = useCompleteFollowUp()
  const open = lead.followUps
    .filter((f) => !f.completedAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const done = lead.followUps
    .filter((f) => f.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))

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
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => complete.mutate({ followupId: f.id })}
                disabled={complete.isPending}
                title="Mark done"
              >
                <Check />
              </Button>
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
      </CardContent>
    </Card>
  )
}