import { createPrivateKey, sign, createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

export interface LicenseData {
  organization: string
  product: string
  license_id: string
  issued: string
  device_fingerprint: {
    machine_guid: string
    motherboard: string
    system_disk: string
    cpu: string
  }
}

export interface SignedLicense extends LicenseData {
  signature: string
}

/**
 * Build the canonical payload (sorted keys, no whitespace) — must match
 * the verifier's canonicalPayload() in src/main/licensing/crypto.ts.
 */
export function canonicalPayload(data: LicenseData): string {
  return JSON.stringify(deepSort(data))
}

function deepSort(obj: unknown): unknown {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = deepSort((obj as Record<string, unknown>)[k])
    }
    return sorted
  }
  return obj
}

export function signLicense(data: LicenseData, privateKeyPem: string): SignedLicense {
  const key = createPrivateKey(privateKeyPem)
  const payload = canonicalPayload(data)
  const signature = sign(null, Buffer.from(payload, 'utf-8'), key).toString('hex')
  return { ...data, signature }
}

/**
 * Create license data. Raw hardware identifiers are SHA-256 hashed before
 * inclusion — only hashes ship in the license, never raw values.
 */
export function createLicenseData(
  organization: string,
  fingerprints: { machineGuid: string; motherboard: string; systemDisk: string; cpu: string },
  overrides?: Partial<LicenseData>
): LicenseData {
  return {
    organization,
    product: 'CrownCRM',
    license_id: overrides?.license_id ?? randomUUID(),
    issued: overrides?.issued ?? new Date().toISOString().split('T')[0],
    device_fingerprint: {
      machine_guid: sha256(fingerprints.machineGuid),
      motherboard: sha256(fingerprints.motherboard),
      system_disk: sha256(fingerprints.systemDisk),
      cpu: sha256(fingerprints.cpu)
    }
  }
}

export function licenseToFile(license: SignedLicense): string {
  return JSON.stringify(license, null, 2)
}
