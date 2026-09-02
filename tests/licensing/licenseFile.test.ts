import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  readLicenseFile,
  writeLicenseFile,
  licenseFileExists,
  getLicensePath
} from '../../src/main/licensing/licenseFile'

const TEST_DIR = join(import.meta.dirname, '..', '.tmp-license-test')

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('getLicensePath', () => {
  it('returns a path ending in license.dat', () => {
    expect(getLicensePath(TEST_DIR)).toBe(join(TEST_DIR, 'license.dat'))
  })
})

describe('readLicenseFile', () => {
  it('returns null when file does not exist', () => {
    expect(readLicenseFile(TEST_DIR)).toBeNull()
  })

  it('returns file contents when it exists', () => {
    writeFileSync(join(TEST_DIR, 'license.dat'), '{"test":true}', 'utf-8')
    expect(readLicenseFile(TEST_DIR)).toBe('{"test":true}')
  })
})

describe('writeLicenseFile', () => {
  it('creates the license file', () => {
    writeLicenseFile(TEST_DIR, '{"org":"test"}')
    const content = readFileSync(join(TEST_DIR, 'license.dat'), 'utf-8')
    expect(content).toBe('{"org":"test"}')
  })

  it('overwrites an existing license file', () => {
    writeLicenseFile(TEST_DIR, '{"old":true}')
    writeLicenseFile(TEST_DIR, '{"new":true}')
    expect(readLicenseFile(TEST_DIR)).toBe('{"new":true}')
  })
})

describe('licenseFileExists', () => {
  it('returns false when file does not exist', () => {
    expect(licenseFileExists(TEST_DIR)).toBe(false)
  })

  it('returns true when file exists', () => {
    writeFileSync(join(TEST_DIR, 'license.dat'), '{}', 'utf-8')
    expect(licenseFileExists(TEST_DIR)).toBe(true)
  })
})
