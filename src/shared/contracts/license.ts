import { z } from 'zod'

/**
 * Licensing contracts — shared between main, preload, and renderer.
 * Zod schemas validate at the IPC boundary; derived types are the
 * single source of truth for all three layers.
 */

// --- License status ---

export type LicenseState = 'ACTIVE' | 'UNLICENSED' | 'INVALID'

export type LicenseReason =
  | 'NO_LICENSE'
  | 'BAD_SIGNATURE'
  | 'FINGERPRINT_MISMATCH'
  | 'CORRUPT'

export interface LicenseStatus {
  state: LicenseState
  reason?: LicenseReason
  organization?: string
  product?: string
  issued?: string
  licenseId?: string
}

// --- IPC inputs ---

export const activateLicenseInputSchema = z.object({
  licenseContent: z.string().min(1).max(4096)
})
export type ActivateLicenseInput = z.infer<typeof activateLicenseInputSchema>

// --- Support info (for "copy support info" button) ---

export interface LicenseSupportInfo {
  organization: string | null
  fingerprint: {
    machineGuid: string
    motherboard: string
    systemDisk: string
    cpu: string
  }
}
