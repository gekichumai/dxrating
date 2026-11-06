/** Deepest nesting {@link canonicalJson} accepts; hashed values are validated records, a few levels deep */
export const CANONICAL_MAX_DEPTH = 32

/**
 * The canonical JSON of `value` (§4.2 `raw_payload_sha256`): object keys sorted, recursively; arrays in their own
 * order; `undefined` properties left out. Shared by the server, which hashes it with `node:crypto`, and the web
 * client, which hashes it with SubtleCrypto, so both hash the same bytes. Only for validated, normalized values:
 * anything nested deeper than {@link CANONICAL_MAX_DEPTH} levels throws instead of recursing.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, 0))
}

function canonicalize(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= CANONICAL_MAX_DEPTH) {
    throw new RangeError(`canonicalJson: value nested deeper than ${CANONICAL_MAX_DEPTH} levels`)
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, depth + 1))
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key], depth + 1)]),
  )
}