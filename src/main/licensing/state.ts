import { app } from 'electron'
import type { LicenseStatus } from '../../shared/contracts/license'
import { verifyLicense } from './verify'
import { resetFingerprintCache } from './fingerprint'

let cachedStatus: LicenseStatus | null = null

/**
 * Get the current license status, computing on first call and caching.
 * Use `refreshLicenseStatus()` to invalidate the cache (e.g., after activate).
 */
export function getLicenseStatus(): LicenseStatus {
  if (cachedStatus) return cachedStatus
  cachedStatus = verifyLicense(app.getPath('userData'))
  return cachedStatus
}

/**
 * Re-run verification (e.g., after writing a new license.dat).
 * Returns the fresh status.
 */
export function refreshLicenseStatus(): LicenseStatus {
  resetFingerprintCache()
  cachedStatus = verifyLicense(app.getPath('userData'))
  return cachedStatus
}
