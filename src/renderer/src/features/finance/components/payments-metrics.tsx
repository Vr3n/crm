import { CalendarRange, Landmark, Split, Undo2 } from 'lucide-react'
import { isSameDay, isSameMonth, sum, unallocatedAmount } from '../build'
import { formatMoney } from '@/features/dashboard/format'
import { FinanceMetric } from './finance-metric'
import type { Payment, Refund } from '../types'

/**
 * Payments page headline (Module 05 / Module 09 §62). Four figures derived live
 * from the payment + refund records: today's and this month's collections, the
 * money recorded but not yet spread over invoices (advance / unallocated), and
 * this month's refunds.
 */
export function PaymentsMetrics({
  payments,
  refunds
}: {
  payments: Payment[]
  refunds: Refund[]
}): React.JSX.Element {
  const now = new Date()
  const today = payments.filter((p) => isSameDay(p.paymentDate, now))
  const month = payments.filter((p) => isSameMonth(p.paymentDate, now))
  const monthRefunds = refunds.filter((r) => isSameMonth(r.refundDate, now))
  const unallocated = payments.reduce((s, p) => s + unallocatedAmount(p), 0)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FinanceMetric
        icon={Landmark}
        label="Collected today"
        value={formatMoney(sum(today))}
        hint={`${today.length} payments`}
      />
      <FinanceMetric
        icon={CalendarRange}
        label="Collected this month"
        value={formatMoney(sum(month))}
        hint={`${month.length} payments`}
      />
      <FinanceMetric
        icon={Split}
        label="Unallocated"
        value={formatMoney(unallocated)}
        hint="Not yet spread over invoices"
        tone="warning"
      />
      <FinanceMetric
        icon={Undo2}
        label="Refunds this month"
        value={`-${formatMoney(sum(monthRefunds))}`}
        hint={`${monthRefunds.length} refunds`}
        tone="destructive"
      />
    </div>
  )
}
