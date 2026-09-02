import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const LEDGER_PATH = join(import.meta.dirname, '..', 'ledger.json')

export interface OrganizationEntry {
  licenses: {
    license_id: string
    issued: string
    type: 'initial' | 'reissue'
  }[]
  reactivation_used: number
  reactivation_limit: number
}

export interface Ledger {
  organizations: Record<string, OrganizationEntry>
}

const EMPTY_LEDGER: Ledger = { organizations: {} }

function ensureDir(): void {
  mkdirSync(join(import.meta.dirname, '..', 'keys'), { recursive: true })
}

export function loadLedger(): Ledger {
  if (!existsSync(LEDGER_PATH)) return EMPTY_LEDGER
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
}

export function saveLedger(ledger: Ledger): void {
  ensureDir()
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf-8')
}

export function getOrgEntry(ledger: Ledger, org: string): OrganizationEntry {
  if (!ledger.organizations[org]) {
    ledger.organizations[org] = {
      licenses: [],
      reactivation_used: 0,
      reactivation_limit: 2
    }
  }
  return ledger.organizations[org]
}

export function recordLicense(
  ledger: Ledger,
  org: string,
  licenseId: string,
  type: 'initial' | 'reissue'
): void {
  const entry = getOrgEntry(ledger, org)
  entry.licenses.push({
    license_id: licenseId,
    issued: new Date().toISOString().split('T')[0],
    type
  })
  if (type === 'reissue') {
    entry.reactivation_used++
  }
  saveLedger(ledger)
}

export function remainingReactivations(ledger: Ledger, org: string): number {
  const entry = getOrgEntry(ledger, org)
  return entry.reactivation_limit - entry.reactivation_used
}
