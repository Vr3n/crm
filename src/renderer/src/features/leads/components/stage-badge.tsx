import { cn } from '@/lib/utils'
import { stageConfig } from '../constants'
import type { StageKey } from '../types'

const toneClass: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  destructive: 'bg-destructive/10 text-destructive'
}

export function StageBadge({
  stage,
  className
}: {
  stage: StageKey
  className?: string
}): React.JSX.Element {
  const cfg = stageConfig(stage)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[cfg.tone],
        className
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', {
          'bg-current': true
        })}
      />
      {cfg.label}
    </span>
  )
}
