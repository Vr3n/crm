import { createPublicKey, verify } from 'node:crypto'
import { canonicalPayload } from './canonical'

export { canonicalPayload }

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
