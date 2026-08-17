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
