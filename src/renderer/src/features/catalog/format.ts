const MONEY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

/** INR money in the app's mono tabular style — ₹24,000 */
export const formatMoney = (amount: number): string => MONEY.format(amount)

/** Abbreviated day-month year — 16 Aug 2026 */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export const formatPercent = (value: number): string => `${value}%`

export const todayIso = (): string => new Date().toISOString().slice(0, 10)