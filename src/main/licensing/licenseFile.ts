import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const LICENSE_FILENAME = 'license.dat'

export function getLicensePath(userDataPath: string): string {
  return join(userDataPath, LICENSE_FILENAME)
}

export function licenseFileExists(userDataPath: string): boolean {
  return existsSync(getLicensePath(userDataPath))
}

export function readLicenseFile(userDataPath: string): string | null {
  const path = getLicensePath(userDataPath)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}

export function writeLicenseFile(userDataPath: string, content: string): void {
  writeFileSync(getLicensePath(userDataPath), content, 'utf-8')
}
