/** Local types for the renderer — mirrors the shared contract shapes. */

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

export interface LicenseSupportInfo {
  organization: string | null
  fingerprint: {
    machineGuid: string
    motherboard: string
    systemDisk: string
    cpu: string
  }
}
