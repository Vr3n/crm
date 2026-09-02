import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { parseLicense, verifyLicenseSignature, verifyLicense } from '../../src/main/licensing/verify'

// --- Test keypair (different from the one embedded in crypto.ts) ---
// We need to create a license signed with the EMBEDDED key, so we use a
// child process that imports crypto.ts's key and signs.
// For unit tests of parseLicense and signature verification, we create
// licenses signed with the embedded key by calling the vendor CLI logic.

// Actually, since the embedded public key in crypto.ts is fixed, we need
// a license signed by that specific private key.  We don't have the private
// key in tests.  Instead, we test:
//   1. parseLicense with valid/invalid JSON
//   2. verifyLicenseSignature returns false for tampered/wrong signatures
//   3. verifyLicense with mocked collectFingerprint

const TEST_DIR = join(import.meta.dirname, '..', '.tmp-verify-test')

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('parseLicense', () => {
  it('parses a valid license JSON', () => {
    const license = {
      organization: 'Test Gym',
      product: 'CrownCRM',
      license_id: 'abc-123',
      issued: '2026-09-01',
      device_fingerprint: {
        machine_guid: 'a',
        motherboard: 'b',
        system_disk: 'c',
        cpu: 'd'
      },
      signature: 'deadbeef'
    }
    const result = parseLicense(JSON.stringify(license))
    expect(result).not.toBeNull()
    expect(result!.organization).toBe('Test Gym')
    expect(result!.device_fingerprint.machineGuid).toBe('a')
  })

  it('returns null for missing required fields', () => {
    const partial = { organization: 'Test', product: 'CrownCRM' }
    expect(parseLicense(JSON.stringify(partial))).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseLicense('not json')).toBeNull()
  })

  it('returns null when device_fingerprint is missing', () => {
    const noFp = {
      organization: 'Test',
      product: 'CrownCRM',
      license_id: 'abc',
      issued: '2026-01-01',
      signature: 'aa'
    }
    expect(parseLicense(JSON.stringify(noFp))).toBeNull()
  })

  it('returns null when device_fingerprint has wrong shape', () => {
    const badFp = {
      organization: 'Test',
      product: 'CrownCRM',
      license_id: 'abc',
      issued: '2026-01-01',
      device_fingerprint: { machine_guid: 'a' },
      signature: 'aa'
    }
    expect(parseLicense(JSON.stringify(badFp))).toBeNull()
  })
})

describe('verifyLicenseSignature', () => {
  it('returns false for a license with a random signature', () => {
    const result = verifyLicenseSignature({
      organization: 'Test',
      product: 'CrownCRM',
      license_id: 'abc',
      issued: '2026-01-01',
      device_fingerprint: { machineGuid: 'a', motherboard: 'b', systemDisk: 'c', cpu: 'd' },
      signature: 'deadbeef'.repeat(8)
    })
    expect(result).toBe(false)
  })

  it('returns false for a signature that is not valid hex', () => {
    const result = verifyLicenseSignature({
      organization: 'Test',
      product: 'CrownCRM',
      license_id: 'abc',
      issued: '2026-01-01',
      device_fingerprint: { machineGuid: 'a', motherboard: 'b', systemDisk: 'c', cpu: 'd' },
      signature: 'not-hex-at-all!'
    })
    expect(result).toBe(false)
  })
})

describe('verifyLicense', () => {
  it('returns UNLICENSED when no file exists', () => {
    const result = verifyLicense(TEST_DIR)
    expect(result.state).toBe('UNLICENSED')
    expect(result.reason).toBe('NO_LICENSE')
  })

  it('returns INVALID when file is corrupt', () => {
    writeFileSync(join(TEST_DIR, 'license.dat'), 'not json', 'utf-8')
    const result = verifyLicense(TEST_DIR)
    expect(result.state).toBe('INVALID')
    expect(result.reason).toBe('CORRUPT')
  })

  it('returns INVALID with BAD_SIGNATURE when file has valid JSON but wrong signature', () => {
    const license = {
      organization: 'Test',
      product: 'CrownCRM',
      license_id: 'abc',
      issued: '2026-01-01',
      device_fingerprint: {
        machine_guid: 'a',
        motherboard: 'b',
        system_disk: 'c',
        cpu: 'd'
      },
      signature: 'ff'.repeat(64)
    }
    writeFileSync(join(TEST_DIR, 'license.dat'), JSON.stringify(license), 'utf-8')
    const result = verifyLicense(TEST_DIR)
    expect(result.state).toBe('INVALID')
    expect(result.reason).toBe('BAD_SIGNATURE')
  })
})
