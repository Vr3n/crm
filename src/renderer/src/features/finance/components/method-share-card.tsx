import { ChartPie } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/features/dashboard/format'
import { METHOD_ICON } from '../constants'
import { collectionsByMethod } from '../build'
import type { Payment } from '../types'

/**
 * Method share (Module 09 §63). Where the money in range actually came from —
 * a single stacked bar plus a per-method breakdown with percentage of total.
 */
export function MethodShareCard({
  payments,
  from,
  to
}: {
  payments: Payment[]
  from?: Date
  to?: Date
}): React.JSX.Element {
  const methods = collectionsByMethod(payments, from, to)
  const total = methods.reduce((s, m) => s + m.amount, 0)

  return (
    <Card
      className="crm-gradient-border"
      style={{ '--gradient-start': 'var(--primary)', '--gradient-end': 'var(--primary)' } as React.CSSProperties}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-success/10 text-success">
            <ChartPie className="size-5" />
          </span>
          <span className="font-heading text-lg">Payment method share</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total > 0 ? (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
              {methods.map((m) => {
                const Icon = METHOD_ICON[m.key as keyof typeof METHOD_ICON]
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-center bg-primary transition-[flex-basis]"
                    style={{ flexBasis: `${(m.amount / total) * 100}%` }}
                    title={`${m.label} — ${formatMoney(m.amount)}`}
                  >
                    {Icon ? <Icon className="size-2.5 text-primary-foreground" /> : null}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-2.5">
              {methods.map((m) => {
                const Icon = METHOD_ICON[m.key as keyof typeof METHOD_ICON]
                return (
                  <div key={m.key} className="flex items-center gap-2.5">
                    {Icon ? (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-3.5" />
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.label}</span>
                    <span className="font-mono text-xs tabular-nums">{formatMoney(m.amount)}</span>
                    <span className="w-12 text-right font-mono text-xs font-semibold tabular-nums">
                      {Math.round((m.amount / total) * 100)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No payments in range to break down by method.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
