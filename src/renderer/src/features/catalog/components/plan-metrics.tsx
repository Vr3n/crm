import { BadgeCheck, Clock3, Crown, IndianRupee, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMinor, type CurrencyCode } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Plan } from '../types'

interface Metric {
  key: 'active' | 'timed' | 'entry' | 'flagship'
  label: string
  icon: LucideIcon
  chip: string
  value: (plans: Plan[], currency: CurrencyCode) => string
}

const METRICS: Metric[] = [
  {
    key: 'active',
    label: 'Active plans',
    icon: BadgeCheck,
    chip: 'bg-success/15 text-success',
    value: (plans) => String(plans.filter((p) => p.isActive).length)
  },
  {
    key: 'timed',
    label: 'Timed window',
    icon: Clock3,
    chip: 'bg-primary/10 text-primary',
    value: (plans) => String(plans.filter((p) => p.accessWindow === 'TIMED').length)
  },
  {
    key: 'entry',
    label: 'Cheapest entry',
    icon: IndianRupee,
    chip: 'bg-muted text-muted-foreground',
    value: (plans, currency) => {
      const active = plans.filter((p) => p.isActive)
      if (active.length === 0) return '—'
      return formatMinor(Math.min(...active.map((p) => p.basePriceMinor)), currency)
    }
  },
  {
    key: 'flagship',
    label: 'Flagship plan',
    icon: Crown,
    chip: 'bg-warning/15 text-warning',
    value: (plans, currency) => {
      const active = plans.filter((p) => p.isActive)
      if (active.length === 0) return '—'
      return formatMinor(Math.max(...active.map((p) => p.basePriceMinor)), currency)
    }
  }
]

/**
 * Catalog pricing headline: active plans, timed-window plans, and the price
 * range (cheapest entry → flagship). Every number is derived from the rows.
 */
export function PlanMetrics({ plans }: { plans: Plan[] }): React.JSX.Element {
  const currency = useCurrency()
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {METRICS.map((m) => (
        <div
          key={m.key}
          className="flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <div
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', m.chip)}
          >
            <m.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-lg leading-none font-semibold tabular-nums">
              {m.value(plans, currency)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
