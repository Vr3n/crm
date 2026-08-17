import { FileText, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ACTIVITY_ICONS, ACTIVITY_TONE } from '../../activity-visuals'
import { ACTIVITY_LABELS } from '../../constants'
import { formatDateTime, timeAgo } from '../../format'
import type { Lead } from '../../types'

/**
 * The lead's discussion history as a timeline (Module 01 §24) — every call,
 * visit, tour, follow-up and stage change, newest first, joined by a continuous
 * hairline rail. This is the single place a staff member reads "what has
 * happened" without digging.
 */
export function Timeline({ lead }: { lead: Lead }): React.JSX.Element {
  const entries = [...lead.activities].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Timeline
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} event{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ol className="relative">
            {entries.map((act, i) => {
              const Icon = ACTIVITY_ICONS[act.type] ?? FileText
              const isLast = i === entries.length - 1
              return (
                <li key={act.id} className={cn('relative flex gap-3', isLast ? 'pb-0' : 'pb-5')}>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute top-8 bottom-0 left-[13px] w-px bg-border"
                    />
                  )}
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md',
                      ACTIVITY_TONE[act.type]
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{ACTIVITY_LABELS[act.type]}</p>
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(act.at)}
                      </p>
                    </div>
                    {act.note ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{act.note}</p>
                    ) : null}
                    {act.by ? (
                      <p className="mt-0.5 text-xs text-muted-foreground/70">
                        by {act.by} · {timeAgo(act.at)}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
