/**
 * Money presentation — the single place rupees are formatted for the UI.
 *
 * The domain stores money as integer minor units (paise) and never computes
 * with floats (docs/modules 04 §34). This prototype ships whole-rupee numbers
 * on its read models, formatted here with `en-IN` grouping so columns scan on
 * a single edge. Components must never do money arithmetic — read models ship
 * finished numbers.
 */

const INDIAN_RUPEE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
})

export function formatMoney(amount: number): string {
  return INDIAN_RUPEE.format(amount)
}

const INDIAN_RUPEE_EXACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
})

/** Formats an amount given in whole rupees, keeping up to 2 decimals. */
export function formatMoneyExact(amount: number): string {
  return INDIAN_RUPEE_EXACT.format(amount)
}

/**
 * Formats a stored minor-unit (paise) amount for display — the single place
 * paise convert back to rupees on the way out (Module 04 §34).
 */
export function formatMinor(amountMinor: number): string {
  return formatMoneyExact(amountMinor / 100)
}

/**
 * Parses a decimal-rupees string ("19200", "19200.5", "19,200.50") into
 * integer paise. Returns `undefined` when the input is not a valid
 * non-negative amount with at most 2 decimals — the caller shows the error.
 */
export function rupeesToMinor(value: string): number | undefined {
  const cleaned = value.replace(/[,\s₹]/g, '')
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}
