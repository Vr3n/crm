import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Dumbbell,
  FileText,
  History,
  MapPin,
  MessageCircle,
  PhoneCall,
  Tag,
  Users,
  XCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ACTIVITY_LABELS } from '../../constants'
import { formatDateTime, timeAgo } from '../../format'
import type { ActivityTypeKey, Lead } from '../../types'

const ICONS: Partial<Record<ActivityTypeKey, LucideIcon>> = {
  LEAD_CREATED: Users,
  PHONE_CALL: PhoneCall,
  WALK_IN: MapPin,
  WHATSAPP: MessageCircle,
  GYM_TOUR: Dumbbell,
  TRIAL: Dumbbell,
  NO_SHOW: XCircle,
  PRICE_DISCUSSION: Tag,
  MEMBERSHIP_PROPOSAL: Tag,
  STAGE_CHANGE: ArrowRight,
  FOLLOW_UP_CREATED: BellRing,
  FOLLOW_UP_DONE: CheckCircle2,
  NOTE: FileText,
  LOST: XCircle,
  WON: CheckCircle2
}

const TONE: Record<ActivityTypeKey, string> = {
  LEAD_CREATED: 'bg-muted text-muted-foreground',
  PHONE_CALL: 'bg-primary/10 text-primary',
  WALK_IN: 'bg-muted text-muted-foreground',
  WHATSAPP: 'bg-primary/10 text-primary',
  GYM_TOUR: 'bg-primary/10 text-primary',
  TRIAL: 'bg-success/15 text-success',
  NO_SHOW: 'bg-warning/15 text-warning',
  PRICE_DISCUSSION: 'bg-muted text-muted-foreground',
  MEMBERSHIP_PROPOSAL: 'bg-primary/10 text-primary',
  STAGE_CHANGE: 'bg-muted text-muted-foreground',
  FOLLOW_UP_CREATED: 'bg-muted text-muted-foreground',
  FOLLOW_UP_DONE: 'bg-success/15 text-success',
  NOTE: 'bg-muted text-muted-foreground',
  LOST: 'bg-destructive/10 text-destructive',
  WON: 'bg-success/15 text-success'
}

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
              const Icon = ICONS[act.type] ?? FileText
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
                      TONE[act.type]
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
