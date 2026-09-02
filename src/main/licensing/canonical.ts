/**
 * Canonical JSON serialization for license signing and verification.
 *
 * Both the vendor CLI (signing) and the app (verification) must produce
 * the exact same JSON string for the same license fields. This module
 * is the single source of truth for that format: sorted keys at every
 * nesting level, no whitespace, `signature` field stripped if present.
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
