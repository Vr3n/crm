import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

const KEYS_DIR = join(import.meta.dirname, '..', 'keys')
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'private.pem')
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'public.pem')

export interface KeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

export function keysExist(): boolean {
  return existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)
}

export function loadKeys(): KeyPair {
  if (!keysExist()) {
    throw new Error(
      'No keypair found. Run `npx tsx tools/license/issue.ts generate-keypair` first.'
    )
  }
  return {
    privateKeyPem: readFileSync(PRIVATE_KEY_PATH, 'utf-8'),
    publicKeyPem: readFileSync(PUBLIC_KEY_PATH, 'utf-8')
  }
}

export function generateKeypair(): KeyPair {
  mkdirSync(KEYS_DIR, { recursive: true })
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  writeFileSync(PRIVATE_KEY_PATH, privateKeyPem, 'utf-8')
  writeFileSync(PUBLIC_KEY_PATH, publicKeyPem, 'utf-8')
  return { privateKeyPem, publicKeyPem }
}
