import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'success' | 'destructive' | 'warning' | 'muted'

const TONE_CHIP: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground'
}

/**
 * Identity headline tile — mono tabular figure with a tone-coded icon chip,
 * matching the metric language used across the pipeline and finance pages.
 */
export function IdentityMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default'
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  tone?: Tone
}): React.JSX.Element {
  return (
    <div className="flex min-w-40 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          TONE_CHIP[tone]
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xl leading-none font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
      {hint ? <p className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
