import { useMemo } from 'react'
import {
  CalendarClock,
  DoorOpen,
  Dumbbell,
  Handshake,
  Heart,
  PhoneCall,
  Sparkles,
  Trophy,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGES } from '../constants'
import type { Lead, StageKey } from '../types'

/** One icon per pipeline stage, so the strip reads as a funnel at a glance. */
const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  NEW: Sparkles,
  CONTACTED: PhoneCall,
  INTERESTED: Heart,
  VISIT_SCHEDULED: CalendarClock,
  VISITED: DoorOpen,
  TRIAL: Dumbbell,
  NEGOTIATION: Handshake,
  WON: Trophy,
  LOST: XCircle
}

/** Stage tone → tinted icon chip, mirroring the stage badges. */
const TONE_CHIP: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  destructive: 'bg-destructive/10 text-destructive'
}

/**
 * Pipeline metrics, ordered by stage so the strip maps 1:1 to the funnel:
 * neutral early stages → cyan engaged → green won → red lost. Each card carries
 * its own icon + tone. Counts reflect the active filters above; nothing is
 * fabricated.
 */
export function LeadMetrics({ leads }: { leads: Lead[] }): React.JSX.Element {
  const totals = useMemo(() => {
    const map = new Map<StageKey, number>()
    STAGES.forEach((s) => map.set(s.key, 0))
    leads.forEach((l) => map.set(l.stage, (map.get(l.stage) ?? 0) + 1))
    return map
  }, [leads])

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {STAGES.map((stage) => {
        const Icon = STAGE_ICONS[stage.key]
        const count = totals.get(stage.key) ?? 0
        return (
          <div
            key={stage.key}
            className="flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md',
                TONE_CHIP[stage.tone]
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xl leading-none font-semibold tabular-nums">{count}</p>
              <p className="truncate text-xs text-muted-foreground">{stage.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
