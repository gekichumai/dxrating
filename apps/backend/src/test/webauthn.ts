import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { getBaseUrl } from './setup'

/**
 * A software authenticator: just enough CBOR and WebAuthn to answer a registration ceremony, for tests that need an
 * account created with a passkey.
 */

export const ORIGIN = 'http://localhost:5173'

const head = (major: number, length: number) => {
  if (length < 24) return Buffer.from([(major << 5) | length])
  if (length < 256) return Buffer.from([(major << 5) | 24, length])
  return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff])
}

const cbor = (value: unknown): Buffer => {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)])
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value])
  if (value instanceof Map) {
    return Buffer.concat([head(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])])
  }
  throw new Error(`Can't encode ${typeof value}`)
}

const base64url = (bytes: Buffer) => bytes.toString('base64url')

const attestation = (challenge: string, rpId: string) => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const coseKey = cbor(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, 'base64url')],
      [-3, Buffer.from(jwk.y!, 'base64url')],
    ]),
  )
  const credentialId = randomBytes(16)
  const length = Buffer.alloc(2)
  length.writeUInt16BE(credentialId.length)
  const authData = Buffer.concat([
    createHash('sha256').update(rpId).digest(),
    Buffer.from([0x45]), // user present, user verified, attested credential data
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    credentialId,
    coseKey,
  ])
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN }))
  const attestationObject = cbor(
    new Map<string, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  )
  return {
    id: base64url(credentialId),
    rawId: base64url(credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: base64url(clientDataJSON),
      attestationObject: base64url(attestationObject),
      transports: ['internal'],
    },
    clientExtensionResults: {},
  }
}

const cookiesOf = (response: Response) =>
  (response.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(';')[0]).join('; ')

export const registerOptions = (query: Record<string, string>, cookie = '') =>
  fetch(`${getBaseUrl()}/api/auth/passkey/generate-register-options?${new URLSearchParams(query)}`, {
    headers: { Origin: ORIGIN, Cookie: cookie },
  })

/** Runs a whole registration ceremony and returns the verify-registration response */
export const register = async ({ email, cookie = '' }: { email?: string; cookie?: string }) => {
  const optionsResponse = await registerOptions(email ? { context: JSON.stringify({ email }) } : {}, cookie)
  if (optionsResponse.status !== 200) return optionsResponse
  const options = (await optionsResponse.json()) as { challenge: string; rp: { id: string }; user: { id: string } }
  const challengeCookie = cookiesOf(optionsResponse)
  return fetch(`${getBaseUrl()}/api/auth/passkey/verify-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Cookie: [cookie, challengeCookie].filter(Boolean).join('; '),
    },
    body: JSON.stringify({ response: attestation(options.challenge, options.rp.id), createSession: !cookie }),
  })
}