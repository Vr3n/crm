import { endOfDay, startOfDay } from 'date-fns'
import type { DayCollection, PaymentRecord } from './types'

/**
 * Deterministic aggregation for the daily collection report (Module 09 §63).
 *
 * Pure function over the day's payments: total, count, the distinct staff who
 * recorded them and the per-method subtotals. The real system runs this as a
 * SQL aggregation over the `payments` table; here it's the same shape in
 * memory so the report can never drift from its source rows.
 */
export function buildDayCollection(payments: PaymentRecord[], day: Date): DayCollection {
  const from = startOfDay(day).getTime()
  const to = endOfDay(day).getTime()

  const rows = payments.filter((p) => {
    const t = new Date(p.receivedAt).getTime()
    return t >= from && t <= to
  })

  const byMethod = new Map<PaymentRecord['method'], { total: number; count: number }>()
  let total = 0
  for (const p of rows) {
    total += p.amount
    const bucket = byMethod.get(p.method) ?? { total: 0, count: 0 }
    bucket.total += p.amount
    bucket.count += 1
    byMethod.set(p.method, bucket)
  }

  const recordedBy = [...new Set(rows.map((p) => p.receivedBy))]

  return {
    date: startOfDay(day).toISOString(),
    total,
    paymentCount: rows.length,
    recordedBy,
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
  }
}
