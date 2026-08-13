/**
 * Lightweight client-side validation mirroring the main-process domain rules.
 * The renderer is process-isolated from the main layer, so these repeat the
 * checks for instant UX feedback; the authoritative validation still happens
 * in the application layer (src/main/domain/phone.ts, etc.).
 */

const MOBILE_RE = /^(?:\+91|0091|91|0)?([6-9][0-9]{9})$/
const MOBILE_MAX = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8

/** Strips formatting separators and optional country-code prefix; requires 10 digits starting 6-9. */
export function isValidIndianMobile(value: string): boolean {
  if (!value || value.trim().length === 0) return false
  return MOBILE_RE.test(value.trim().replace(/[\s()-]/g, ''))
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN
}

/**
 * Granular mobile-number error. Returns the *specific* reason the value is
 * invalid so the UI can guide the user, or `undefined` when the value is valid
 * (or still too incomplete to judge).
 */
export function mobileError(value: string): string | undefined {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return 'Mobile number is required'
  if (digits.length < MOBILE_MAX) return 'Enter all 10 digits'
  if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8, or 9'
  return undefined
}

/** Granular organization-name error. */
export function organizationNameError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Organization name is required'
  if (trimmed.length < 2) return 'Organization name must be at least 2 characters'
  return undefined
}

/** Granular full-name error. */
export function fullNameError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Owner full name is required'
  if (trimmed.length < 2) return 'Enter the owner\u2019s full name'
  return undefined
}

/** Granular email error; `requiredMessage` is used when the field is empty. */
export function emailError(value: string, requiredMessage: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return requiredMessage
  if (!trimmed.includes('@')) return 'Email must contain an @'
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email like jane@example.com'
  return undefined
}

/** Setup-password error: non-empty and at least 8 characters. */
export function passwordError(value: string): string | undefined {
  if (value.length === 0) return 'Create a password'
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  return undefined
}

/** Login-password error: non-empty. */
export function loginPasswordError(value: string): string | undefined {
  return value ? undefined : 'Enter your password'
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
