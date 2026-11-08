/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then random bits. Outbox mutation IDs are UUIDv7 (design §5.5),
 * so the server's idempotency table stays roughly ordered by creation.
 */
export function uuidv7(now: number = Date.now(), random: (bytes: Uint8Array) => void = fillRandom): string {
  const bytes = new Uint8Array(16)
  random(bytes)
  let timestamp = Math.max(0, Math.floor(now))
  for (let index = 5; index >= 0; index--) {
    bytes[index] = timestamp % 256
    timestamp = Math.floor(timestamp / 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function fillRandom(bytes: Uint8Array) {
  globalThis.crypto.getRandomValues(bytes)
}