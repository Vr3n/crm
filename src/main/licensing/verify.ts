import { verifySignature, canonicalPayload } from './crypto'
import { collectFingerprint, meetsThreshold, type DeviceFingerprint } from './fingerprint'
import { readLicenseFile } from './licenseFile'

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

/** Parsed license structure (all fields except `signature`). */
export interface License {
  organization: string
  product: string
  license_id: string
  issued: string
  device_fingerprint: DeviceFingerprint
  signature: string
}

/**
 * Parse a raw license.dat string into a License.
 * Returns null if JSON is invalid or required fields are missing.
 */
export function parseLicense(content: string): License | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (
      typeof parsed.organization !== 'string' ||
      typeof parsed.product !== 'string' ||
      typeof parsed.license_id !== 'string' ||
      typeof parsed.issued !== 'string' ||
      typeof parsed.signature !== 'string'
    ) {
      return null
    }
    const fp = parsed.device_fingerprint as Record<string, unknown> | undefined
    if (
      !fp ||
      typeof fp.machine_guid !== 'string' ||
      typeof fp.motherboard !== 'string' ||
      typeof fp.system_disk !== 'string' ||
      typeof fp.cpu !== 'string'
    ) {
      return null
    }
    return {
      organization: parsed.organization,
      product: parsed.product,
      license_id: parsed.license_id,
      issued: parsed.issued,
      device_fingerprint: {
        machineGuid: fp.machine_guid,
        motherboard: fp.motherboard,
        systemDisk: fp.system_disk,
        cpu: fp.cpu
      },
      signature: parsed.signature
    }
  } catch {
    return null
  }
}

/**
 * Verify the Ed25519 signature on a parsed license.
 * The signature covers every field except `signature`, serialized with
 * sorted keys and no whitespace (canonical payload).
 */
export function verifyLicenseSignature(license: License): boolean {
  const raw: Record<string, unknown> = {
    organization: license.organization,
    product: license.product,
    license_id: license.license_id,
    issued: license.issued,
    device_fingerprint: {
      machine_guid: license.device_fingerprint.machineGuid,
      motherboard: license.device_fingerprint.motherboard,
      system_disk: license.device_fingerprint.systemDisk,
      cpu: license.device_fingerprint.cpu
    }
  }
  return verifySignature(canonicalPayload(raw), license.signature)
}

/**
 * Full verification: read license file → parse → verify signature →
 * compare local fingerprint → return status.
 */
export function verifyLicense(userDataPath: string): LicenseStatus {
  const content = readLicenseFile(userDataPath)
  if (content === null) {
    return { state: 'UNLICENSED', reason: 'NO_LICENSE' }
  }

  const license = parseLicense(content)
  if (!license) {
    return { state: 'INVALID', reason: 'CORRUPT' }
  }

  if (!verifyLicenseSignature(license)) {
    return { state: 'INVALID', reason: 'BAD_SIGNATURE' }
  }

  let localFingerprint: DeviceFingerprint
  try {
    localFingerprint = collectFingerprint()
  } catch {
    return { state: 'INVALID', reason: 'FINGERPRINT_MISMATCH' }
  }
  if (!meetsThreshold(localFingerprint, license.device_fingerprint)) {
    return { state: 'INVALID', reason: 'FINGERPRINT_MISMATCH' }
  }

  return {
    state: 'ACTIVE',
    organization: license.organization,
    product: license.product,
    issued: license.issued,
    licenseId: license.license_id
  }
}
