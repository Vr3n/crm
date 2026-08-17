import { BadgeCheck, PiggyBank, Undo2 } from 'lucide-react'
import { creditApplied, creditRemaining, isSameMonth, sum } from '../build'
import { formatMoney } from '@/features/dashboard/format'
import { FinanceMetric } from './finance-metric'
import type { Credit, Refund } from '../types'

/**
 * Refunds & Credits headline (Module 05 §17–18). The two money-out flows stay
 * visually distinct: refunds leave the business (destructive tone), credits are
 * value kept inside it (cyan / green tones).
 */
export function RefundsMetrics({
  refunds,
  credits
}: {
  refunds: Refund[]
  credits: Credit[]
}): React.JSX.Element {
  const now = new Date()
  const monthRefunds = refunds.filter((r) => isSameMonth(r.refundDate, now))
  const available = credits.reduce((s, c) => s + creditRemaining(c), 0)
  const applied = credits.reduce((s, c) => s + creditApplied(c), 0)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FinanceMetric
        icon={Undo2}
        label="Refunds this month"
        value={`-${formatMoney(sum(monthRefunds))}`}
        hint={`${monthRefunds.length} refunds`}
        tone="destructive"
      />
      <FinanceMetric
        icon={Undo2}
        label="Refunds · all time"
        value={`-${formatMoney(sum(refunds))}`}
        hint={`${refunds.length} refunds`}
        tone="muted"
      />
      <FinanceMetric
        icon={PiggyBank}
        label="Credit available"
        value={formatMoney(available)}
        hint="Can be applied to future invoices"
      />
      <FinanceMetric
        icon={BadgeCheck}
        label="Credit applied"
        value={formatMoney(applied)}
        tone="success"
      />
    </div>
  )
}
