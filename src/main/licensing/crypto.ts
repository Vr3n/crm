import { createPublicKey, verify } from 'node:crypto'

/**
 * Ed25519 public key for license signature verification.
 *
 * In production this is replaced with the real vendor key. The test keypair
 * lives in `tools/license/keys/` and is gitignored; this constant is the
 * public half, safe to embed.
 *
 * To rotate: generate a new keypair via the vendor CLI and paste the public
 * key PEM here.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEALmZu+Ez6/izXcVPEAP3fYyA2EBuGMMVAWumdONPscTc=
-----END PUBLIC KEY-----`

let cachedKey: ReturnType<typeof createPublicKey> | null = null

function getPublicKey(): ReturnType<typeof createPublicKey> {
  if (!cachedKey) cachedKey = createPublicKey(PUBLIC_KEY_PEM)
  return cachedKey
}

/**
 * Verify an Ed25519 signature over a UTF-8 payload.
 * Returns `true` if the signature is valid, `false` otherwise.
 */
export function verifySignature(payload: string, signatureHex: string): boolean {
  try {
    const sig = Buffer.from(signatureHex, 'hex')
    return verify(null, Buffer.from(payload, 'utf-8'), getPublicKey(), sig)
  } catch {
    return false
  }
}

/**
 * Build the canonical string that was signed. The signature covers every
 * field in the license *except* `signature`, serialized with sorted keys
 * and no whitespace — identical output on issuer and verifier.
 *
 * Recursively sorts keys at every nesting level so nested objects like
 * `device_fingerprint` are serialized deterministically.
 */
export function canonicalPayload(license: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally discard signature
  const { signature: _, ...rest } = license
  return JSON.stringify(deepSort(rest))
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
