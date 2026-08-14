import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Composed empty state: an inviting, actionable invitation rather than a void.
 * Used across modules until their read models land (Module 09: the dashboard is a
 * read model over the transactional tables, so these are honest placeholders).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center', className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-heading text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
