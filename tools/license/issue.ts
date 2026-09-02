#!/usr/bin/env node

/**
 * Vendor CLI for issuing and managing CrownCRM licenses.
 *
 * Commands:
 *   generate-keypair           Generate a new Ed25519 keypair
 *   issue <org> <mguid> <mb> <disk> <cpu>   Issue a new license
 *   reissue <org> <mguid> <mb> <disk> <cpu> Reissue (increment reactivation)
 *   list                      List all issued licenses
 *   fingerprint               Show local machine fingerprint
 */

import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { loadKeys, generateKeypair } from './lib/keys'
import { signLicense, createLicenseData, licenseToFile } from './lib/sign'
import { loadLedger, recordLicense, getOrgEntry, remainingReactivations } from './lib/ledger'
import {
  collectRawComponents,
  hashComponents,
  MATCH_THRESHOLD
} from '../../src/main/licensing/fingerprint'

const args = process.argv.slice(2)
const command = args[0]

function usage(): never {
  console.log(`
Usage: npx tsx tools/license/issue.ts <command> [args]

Commands:
  generate-keypair
      Generate a new Ed25519 keypair in tools/license/keys/

  issue <organization> <machineGuid> <motherboard> <systemDisk> <cpu>
      Issue a new license for the given organization and fingerprint.
      Prints the license to stdout. Also writes to tools/license/issued/<license_id>.dat

  reissue <organization> <machineGuid> <motherboard> <systemDisk> <cpu>
      Reissue a license for an organization (consumes a reactivation).
      Checks remaining budget before issuing.

  list
      List all organizations and their license history.

  fingerprint
      Show the local machine's raw hardware identifiers and their hashes.
  `)
  process.exit(1)
}

function cmdGenerateKeypair(): void {
  const { publicKeyPem } = generateKeypair()
  console.log('Keypair generated in tools/license/keys/')
  console.log()
  console.log('Public key (embed in src/main/licensing/crypto.ts):')
  console.log(publicKeyPem)
}

function cmdIssue(): void {
  const [org, mguid, mb, disk, cpu] = args.slice(1)
  if (!org || !mguid || !mb || !disk || !cpu) {
    console.error('Usage: issue <org> <machineGuid> <motherboard> <systemDisk> <cpu>')
    process.exit(1)
  }

  const { privateKeyPem } = loadKeys()
  const ledger = loadLedger()

  const data = createLicenseData(org, {
    machineGuid: mguid,
    motherboard: mb,
    systemDisk: disk,
    cpu
  })

  const license = signLicense(data, privateKeyPem)
  recordLicense(ledger, org, license.license_id, 'initial')

  // Write to issued directory
  const issuedDir = join(import.meta.dirname, 'issued')
  mkdirSync(issuedDir, { recursive: true })
  writeFileSync(join(issuedDir, `${license.license_id}.dat`), licenseToFile(license), 'utf-8')

  console.log(`License issued: ${license.license_id}`)
  console.log(`Organization: ${org}`)
  console.log(`File: tools/license/issued/${license.license_id}.dat`)
  console.log()
  console.log(licenseToFile(license))
}

function cmdReissue(): void {
  const [org, mguid, mb, disk, cpu] = args.slice(1)
  if (!org || !mguid || !mb || !disk || !cpu) {
    console.error('Usage: reissue <org> <machineGuid> <motherboard> <systemDisk> <cpu>')
    process.exit(1)
  }

  const ledger = loadLedger()
  const remaining = remainingReactivations(ledger, org)

  if (remaining <= 0) {
    console.error(`ERROR: No reactivations remaining for "${org}".`)
    console.error(`Contact the gym to discuss additional reactivation options.`)
    process.exit(1)
  }

  const { privateKeyPem } = loadKeys()
  const data = createLicenseData(org, {
    machineGuid: mguid,
    motherboard: mb,
    systemDisk: disk,
    cpu
  })

  const license = signLicense(data, privateKeyPem)
  recordLicense(ledger, org, license.license_id, 'reissue')

  const issuedDir = join(import.meta.dirname, 'issued')
  mkdirSync(issuedDir, { recursive: true })
  writeFileSync(join(issuedDir, `${license.license_id}.dat`), licenseToFile(license), 'utf-8')

  console.log(`License reissued: ${license.license_id}`)
  console.log(`Organization: ${org}`)
  console.log(`Reactivations used: ${getOrgEntry(ledger, org).reactivation_used}/${getOrgEntry(ledger, org).reactivation_limit}`)
  console.log(`File: tools/license/issued/${license.license_id}.dat`)
  console.log()
  console.log(licenseToFile(license))
}

function cmdList(): void {
  const ledger = loadLedger()
  const orgs = Object.keys(ledger.organizations)

  if (orgs.length === 0) {
    console.log('No licenses issued yet.')
    return
  }

  for (const org of orgs) {
    const entry = getOrgEntry(ledger, org)
    console.log(`${org}`)
    console.log(`  Reactivations: ${entry.reactivation_used}/${entry.reactivation_limit} used`)
    for (const lic of entry.licenses) {
      console.log(`  - ${lic.license_id} (${lic.type}, ${lic.issued})`)
    }
    console.log()
  }
}

function cmdFingerprint(): void {
  console.log('Collecting local hardware fingerprint...')
  console.log()
  const raw = collectRawComponents()
  const hashed = hashComponents(raw)

  console.log('Raw identifiers:')
  console.log(`  Machine GUID : ${raw.machineGuid}`)
  console.log(`  Motherboard  : ${raw.motherboard}`)
  console.log(`  System Disk  : ${raw.systemDisk}`)
  console.log(`  CPU          : ${raw.cpu}`)
  console.log()
  console.log('Hashed components (for license):')
  console.log(`  machine_guid : ${hashed.machineGuid}`)
  console.log(`  motherboard  : ${hashed.motherboard}`)
  console.log(`  system_disk  : ${hashed.systemDisk}`)
  console.log(`  cpu          : ${hashed.cpu}`)
  console.log()
  console.log(`Match threshold: ${MATCH_THRESHOLD} of 4`)
}

// --- Main ---
switch (command) {
  case 'generate-keypair':
    cmdGenerateKeypair()
    break
  case 'issue':
    cmdIssue()
    break
  case 'reissue':
    cmdReissue()
    break
  case 'list':
    cmdList()
    break
  case 'fingerprint':
    cmdFingerprint()
    break
  default:
    usage()
}
