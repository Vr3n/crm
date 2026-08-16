import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGES } from '../constants'
import type { Lead } from '../types'

/**
 * Pipeline metrics: how many leads sit in each stage, plus how many were
 * acquired (WON), within the active filter/date range. Configured by the
 * filters above — a natural stepping stone to the owner's exportable report.
 * Counts are computed from the (sample) data; nothing is fabricated.
 */
export function LeadMetrics({ leads }: { leads: Lead[] }): React.JSX.Element {
  const totals = useMemo(() => {
    const map = new Map<string, number>()
    STAGES.forEach((s) => map.set(s.key, 0))
    leads.forEach((l) => map.set(l.stage, (map.get(l.stage) ?? 0) + 1))
    return map
  }, [leads])

  const won = totals.get('WON') ?? 0

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <div className="flex min-w-40 items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
        <div className="flex size-9 items-center justify-center rounded-md bg-success/15 text-success">
          <Trophy className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xl leading-none font-semibold tabular-nums">{won}</p>
          <p className="text-xs text-muted-foreground">Acquired</p>
        </div>
      </div>

      {STAGES.map((stage) => {
        const count = totals.get(stage.key) ?? 0
        return (
          <div
            key={stage.key}
            className="flex min-w-20 flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 py-2"
          >
            <p
              className={cn(
                'font-mono text-xl leading-none font-semibold tabular-nums',
                stage.tone === 'success' && 'text-success',
                stage.tone === 'destructive' && 'text-destructive',
                stage.tone === 'primary' && 'text-primary'
              )}
            >
              {count}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">{stage.label}</p>
          </div>
        )
      })}
    </div>
  )
}