/**
 * Lightweight client-side validation mirroring the main-process domain rules.
 * The renderer is process-isolated from the main layer, so these repeat the
 * checks for instant UX feedback; the authoritative validation still happens
 * in the application layer (src/main/domain/phone.ts, etc.).
 */

const MOBILE_RE = /^(?:\+91|0091|91|0)?([6-9][0-9]{9})$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Strips formatting separators and optional country-code prefix; requires 10 digits starting 6-9. */
export function isValidIndianMobile(value: string): boolean {
  if (!value || value.trim().length === 0) return false
  return MOBILE_RE.test(value.trim().replace(/[\s()-]/g, ''))
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
