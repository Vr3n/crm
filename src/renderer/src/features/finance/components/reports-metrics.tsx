import { CalendarClock, Landmark, ReceiptText, Undo2 } from 'lucide-react'
import { isSameDay, isSameMonth, sum } from '../build'
import { formatMoney } from '@/features/dashboard/format'
import { FinanceMetric } from './finance-metric'
import type { FinanceInvoice, Payment, Refund } from '../types'

/**
 * Reports headline (Module 09 §62). Collections today and this month, what is
 * still owed across open invoices, and what left the business in refunds.
 */
export function ReportsMetrics({
  payments,
  invoices,
  refunds
}: {
  payments: Payment[]
  invoices: FinanceInvoice[]
  refunds: Refund[]
}): React.JSX.Element {
  const now = new Date()
  const today = payments.filter((p) => isSameDay(p.paymentDate, now))
  const month = payments.filter((p) => isSameMonth(p.paymentDate, now))
  const monthRefunds = refunds.filter((r) => isSameMonth(r.refundDate, now))
  const dues = invoices.reduce((s, i) => s + i.total - i.paid, 0)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FinanceMetric
        icon={CalendarClock}
        label="Collected today"
        value={formatMoney(sum(today))}
        hint={`${today.length} payments`}
      />
      <FinanceMetric
        icon={Landmark}
        label="Collected this month"
        value={formatMoney(sum(month))}
        hint={`${month.length} payments`}
      />
      <FinanceMetric
        icon={ReceiptText}
        label="Outstanding dues"
        value={formatMoney(dues)}
        hint="Open + partially paid invoices"
        tone="destructive"
      />
      <FinanceMetric
        icon={Undo2}
        label="Refunds this month"
        value={`-${formatMoney(sum(monthRefunds))}`}
        hint={`${monthRefunds.length} refunds`}
        tone="muted"
      />
    </div>
  )
}
