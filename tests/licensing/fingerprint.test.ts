import { describe, it, expect } from 'vitest'
import {
  hashComponents,
  compareFingerprints,
  meetsThreshold,
  MATCH_THRESHOLD,
  type RawFingerprint,
  type DeviceFingerprint
} from '../../src/main/licensing/fingerprint'

describe('MATCH_THRESHOLD', () => {
  it('is 3 (majority of 4 components)', () => {
    expect(MATCH_THRESHOLD).toBe(3)
  })
})

describe('hashComponents', () => {
  const raw: RawFingerprint = {
    machineGuid: 'abc-123',
    motherboard: 'MB-SERIAL-001',
    systemDisk: 'DISK-SERIAL-002',
    cpu: 'CPU-ID-003'
  }

  it('produces 32-character hex strings (SHA-256)', () => {
    const fp = hashComponents(raw)
    for (const value of Object.values(fp)) {
      expect(value).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('normalizes before hashing (trim + uppercase)', () => {
    const a = hashComponents({ ...raw, machineGuid: '  abc-123  ' })
    const b = hashComponents({ ...raw, machineGuid: 'ABC-123' })
    expect(a.machineGuid).toBe(b.machineGuid)
  })

  it('different raw values produce different hashes', () => {
    const a = hashComponents(raw)
    const b = hashComponents({ ...raw, cpu: 'DIFFERENT' })
    expect(a.cpu).not.toBe(b.cpu)
    expect(a.machineGuid).toBe(b.machineGuid)
  })
})

describe('compareFingerprints', () => {
  const base: DeviceFingerprint = {
    machineGuid: 'a',
    motherboard: 'b',
    systemDisk: 'c',
    cpu: 'd'
  }

  it('returns 4 for identical fingerprints', () => {
    expect(compareFingerprints(base, base)).toBe(4)
  })

  it('returns 3 when one component differs', () => {
    const diff = { ...base, cpu: 'x' }
    expect(compareFingerprints(base, diff)).toBe(3)
  })

  it('returns 2 when two components differ', () => {
    const diff = { ...base, cpu: 'x', systemDisk: 'y' }
    expect(compareFingerprints(base, diff)).toBe(2)
  })

  it('returns 0 when all components differ', () => {
    const diff: DeviceFingerprint = { machineGuid: '1', motherboard: '2', systemDisk: '3', cpu: '4' }
    expect(compareFingerprints(base, diff)).toBe(0)
  })
})

describe('meetsThreshold', () => {
  const base: DeviceFingerprint = {
    machineGuid: 'a',
    motherboard: 'b',
    systemDisk: 'c',
    cpu: 'd'
  }

  it('returns true for 4/4 match', () => {
    expect(meetsThreshold(base, base)).toBe(true)
  })

  it('returns true for 3/4 match', () => {
    expect(meetsThreshold(base, { ...base, cpu: 'x' })).toBe(true)
  })

  it('returns false for 2/4 match', () => {
    expect(meetsThreshold(base, { ...base, cpu: 'x', systemDisk: 'y' })).toBe(false)
  })

  it('returns false for 1/4 match', () => {
    const diff: DeviceFingerprint = { machineGuid: '1', motherboard: '2', systemDisk: '3', cpu: '4' }
    expect(meetsThreshold(base, diff)).toBe(false)
  })

  it('returns false for 0/4 match', () => {
    const diff: DeviceFingerprint = { machineGuid: '1', motherboard: '2', systemDisk: '3', cpu: '4' }
    expect(meetsThreshold({ machineGuid: 'a', motherboard: 'b', systemDisk: 'c', cpu: 'd' }, diff)).toBe(false)
  })
})
