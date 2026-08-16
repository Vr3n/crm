/** Presentational helpers for the dashboard — money, day deltas, cold-lead math. */

const MONEY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
})

export function formatMoney(amount: number): string {
  return MONEY.format(amount)
}

/** Whole days from "now" to the given timestamp (negative when past). */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

/** Whole days elapsed since the given timestamp (never below 0 for display). */
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}