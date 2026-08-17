/** Presentational helpers for the dashboard — day deltas and cold-lead math. */

export { formatMoney } from '@/lib/money'

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
