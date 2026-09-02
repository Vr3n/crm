import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'

const MATCH_THRESHOLD = 3

export { MATCH_THRESHOLD }

export interface RawFingerprint {
  machineGuid: string
  motherboard: string
  systemDisk: string
  cpu: string
}

export interface DeviceFingerprint {
  machineGuid: string
  motherboard: string
  systemDisk: string
  cpu: string
}

let cachedFingerprint: DeviceFingerprint | null = null

/**
 * Collect the four raw hardware identifiers via PowerShell WMI/registry,
 * normalize (trim + uppercase), and SHA-256 each into a component hash.
 * The result is cached for the lifetime of the process — hardware is
 * immutable within a session.
 */
export function collectFingerprint(): DeviceFingerprint {
  if (cachedFingerprint) return cachedFingerprint
  const raw = collectRawComponents()
  cachedFingerprint = hashComponents(raw)
  return cachedFingerprint
}

/** Exposed for retry — clears the cache so the next call re-collects. */
export function resetFingerprintCache(): void {
  cachedFingerprint = null
}

/** Hash a raw fingerprint (used by the vendor CLI and tests). */
export function hashComponents(raw: RawFingerprint): DeviceFingerprint {
  return {
    machineGuid: sha256(raw.machineGuid),
    motherboard: sha256(raw.motherboard),
    systemDisk: sha256(raw.systemDisk),
    cpu: sha256(raw.cpu)
  }
}

/** Count how many of the four component hashes match. */
export function compareFingerprints(
  local: DeviceFingerprint,
  license: DeviceFingerprint
): number {
  let matches = 0
  if (local.machineGuid === license.machineGuid) matches++
  if (local.motherboard === license.motherboard) matches++
  if (local.systemDisk === license.systemDisk) matches++
  if (local.cpu === license.cpu) matches++
  return matches
}

export function meetsThreshold(
  local: DeviceFingerprint,
  license: DeviceFingerprint
): boolean {
  return compareFingerprints(local, license) >= MATCH_THRESHOLD
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

/**
 * Spawn a single PowerShell process that reads all four identifiers and
 * returns them as JSON. Using `-EncodedCommand` with a UTF-16LE base64
 * payload avoids every cmd.exe / PowerShell quoting pitfall.
 *
 * Each WMI/registry call uses `-ErrorAction SilentlyContinue` so a
 * missing value returns null rather than throwing; the hashes will simply
 * be SHA-256 of an empty string, which won't match the license.
 */
export function collectRawComponents(): RawFingerprint {
  const script = [
    '$ProgressPreference = "SilentlyContinue"',
    '$r = [ordered]@{',
    '  machineGuid = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Cryptography" -ErrorAction SilentlyContinue).MachineGuid',
    '  motherboard = (Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue).SerialNumber',
    "  systemDisk = (Get-CimInstance Win32_DiskDrive -Filter \"MediaType='Fixed hard disk media'\" -ErrorAction SilentlyContinue | Select-Object -First 1).SerialNumber",
    '  cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue).ProcessorId',
    '}',
    '$r | ConvertTo-Json -Compress'
  ].join('\n')

  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  const stdout = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { encoding: 'utf-8', timeout: 5_000, windowsHide: true }
  )

  // Extract JSON — PowerShell may prepend CLIXML progress messages.
  const jsonLine = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))[0]

  if (!jsonLine) {
    throw new Error(`Failed to parse PowerShell output: ${stdout.slice(0, 200)}`)
  }

  const parsed = JSON.parse(jsonLine) as Record<string, string | null>
  return {
    machineGuid: parsed.machineGuid ?? '',
    motherboard: parsed.motherboard ?? '',
    systemDisk: parsed.systemDisk ?? '',
    cpu: parsed.cpu ?? ''
  }
}
