import { describe, it, expect } from 'vitest'
import { verifySignature, canonicalPayload } from '../../src/main/licensing/crypto'

// The test keypair's public key is embedded in crypto.ts.
// These tests sign with a known payload using the private key via a helper.
import { generateKeyPairSync, sign } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ed25519')

function signPayload(payload: string): string {
  return sign(null, Buffer.from(payload, 'utf-8'), privateKey).toString('hex')
}

describe('canonicalPayload', () => {
  it('sorts keys and removes whitespace', () => {
    const obj = { z: 1, a: 2, m: 3 }
    expect(canonicalPayload(obj)).toBe('{"a":2,"m":3,"z":1}')
  })

  it('excludes the signature field', () => {
    const obj = { a: 1, signature: 'abc', b: 2 }
    expect(canonicalPayload(obj)).toBe('{"a":1,"b":2}')
  })

  it('handles nested objects', () => {
    const obj = { b: { z: 1, a: 2 }, a: 1 }
    const result = canonicalPayload(obj)
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}')
  })
})

describe('verifySignature', () => {
  // Note: these tests sign with a DIFFERENT keypair than what's embedded
  // in crypto.ts. We test the function's behavior by verifying against
  // the embedded key. A signature from a foreign key will fail.

  it('returns false for a signature from a different key', () => {
    const payload = 'hello world'
    const foreignSig = signPayload(payload)
    expect(verifySignature(payload, foreignSig)).toBe(false)
  })

  it('returns false for an invalid hex string', () => {
    expect(verifySignature('test', 'not-hex')).toBe(false)
  })

  it('returns false for an empty signature', () => {
    expect(verifySignature('test', '')).toBe(false)
  })

  it('returns false for a signature that is too short', () => {
    expect(verifySignature('test', 'abcd')).toBe(false)
  })
})
