/**
 * Money presentation — the single place money is formatted for the UI.
 *
 * Delegates to the shared contracts module for currency-aware logic.
 * Legacy functions accept major units (whole rupees) for backward compat.
 */

import {
  formatMinor as sharedFormatMinor,
  parseToMinor as sharedParseToMinor,
  exponentFor,
  type CurrencyCode
} from '../../../shared/contracts/money'

// ── Re-export shared module ────────────────────────────────────────────────

export {
  parseToMinor,
  minorToMajor,
  formatRate,
  exponentFor,
  CURRENCIES,
  type CurrencyCode,
  type Money,
  type MoneyInput,
  moneySchema,
  currencyCodeSchema
} from '../../../shared/contracts/money'

// ── Legacy wrappers (major-unit interface) ─────────────────────────────────

/**
 * Format a whole-major-unit amount (e.g. 19200 → ₹19,200).
 * No fractional digits — used for whole-rupee display in tables/cards.
 */
export function formatMoney(amount: number, currency: CurrencyCode = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * Format a whole-major-unit amount, keeping up to 2 fractional digits.
 * Legacy alias — same as `formatMoney` for most currencies.
 */
export function formatMoneyExact(amount: number, currency: CurrencyCode = 'INR'): string {
  return sharedFormatMinor(
    Math.round(amount * 10 ** exponentFor(currency)),
    currency
  )
}

/**
 * Format a stored minor-unit (paise) amount for display.
 * Wraps the shared `formatMinor` with INR default for backward compat.
 */
export function formatMinor(amountMinor: number, currency: CurrencyCode = 'INR'): string {
  return sharedFormatMinor(amountMinor, currency)
}

/**
 * Parse a decimal-rupees string ("19200", "19200.5", "19,200.50") into
 * integer minor units. Returns `undefined` when the input is invalid.
 * Wraps the shared `parseToMinor` with INR default for backward compat.
 */
export function rupeesToMinor(value: string, currency: CurrencyCode = 'INR'): number | undefined {
  return sharedParseToMinor(value, currency)
}

/**
 * Sanitize a free-text money input into a plain decimal string that a
 * `type="text"` input can hold (digits + at most one `.`). Strips every
 * non-digit/non-dot character and truncates the fractional part to
 * `maxFractionDigits` (2 for minor-unit currencies). Returns the empty string
 * when there is nothing representable, so the field can be cleared.
 *
 * Mirrors the sale-page's `restrictToTwoDecimals` so every money input across
 * the app behaves identically and is never subject to `type="number"`'s
 * default `step="1"` validation.
 */
export function sanitizeMoneyInput(value: string, maxFractionDigits = 2): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  const before = cleaned.slice(0, dot + 1)
  const after = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, maxFractionDigits)
  return before + after
}
