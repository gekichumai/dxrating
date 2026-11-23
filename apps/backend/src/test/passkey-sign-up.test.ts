import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signUp, teardownTestServer } from './setup'

const ORIGIN = 'http://localhost:5173'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

// --- A software authenticator: just enough CBOR and WebAuthn to answer a registration ceremony ---

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

const registerOptions = (query: Record<string, string>, cookie = '') =>
  fetch(`${getBaseUrl()}/api/auth/passkey/generate-register-options?${new URLSearchParams(query)}`, {
    headers: { Origin: ORIGIN, Cookie: cookie },
  })

/** Runs a whole registration ceremony and returns the verify-registration response */
const register = async ({ email, cookie = '' }: { email?: string; cookie?: string }) => {
  const optionsResponse = await registerOptions(email ? { context: email } : {}, cookie)
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

describe('passkey-first sign-up', () => {
  it('creates an account, its passkey and a session in one ceremony', async () => {
    const response = await register({ email: '  New.Player@Example.com ' })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user: { id: string; email: string; name: string; emailVerified: boolean }
    }
    expect(body.user).toMatchObject({ email: 'new.player@example.com', name: 'new.player', emailVerified: false })

    const passkeys = await pool.query('SELECT user_id FROM passkey')
    expect(passkeys.rows).toEqual([{ user_id: body.user.id }])

    const session = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: extractSessionCookie(response) },
    })
    expect((await session.json()).user.id).toBe(body.user.id)
  })

  it('creates nothing when the ceremony is never finished', async () => {
    expect((await registerOptions({ context: 'abandoned@example.com' })).status).toBe(200)
    expect((await pool.query('SELECT id FROM "user"')).rowCount).toBe(0)
  })

  it('refuses an email that already has an account, and never attaches a passkey to it', async () => {
    await signUp('taken@example.com', 'password123', 'Taken')
    const response = await registerOptions({ context: 'Taken@example.com' })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'USER_ALREADY_EXISTS' })
    expect((await pool.query('SELECT id FROM passkey')).rowCount).toBe(0)
  })

  it('refuses a missing or malformed email', async () => {
    expect((await registerOptions({})).status).toBe(400)
    expect((await registerOptions({ context: 'not-an-email' })).status).toBe(400)
  })
})

describe('adding a passkey while signed in', () => {
  const signedIn = async () => {
    const response = await signUp('owner@example.com', 'password123', 'Owner')
    const { user } = (await response.json()) as { user: { id: string } }
    return { id: user.id, cookie: extractSessionCookie(response) }
  }

  it('adds it to the signed-in account and creates no other', async () => {
    const owner = await signedIn()
    const response = await register({ cookie: owner.cookie })
    expect(response.status).toBe(200)
    expect((await pool.query('SELECT user_id FROM passkey')).rows).toEqual([{ user_id: owner.id }])
    expect((await pool.query('SELECT id FROM "user"')).rowCount).toBe(1)
  })

  it('still needs a fresh session', async () => {
    const owner = await signedIn()
    await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [owner.id])
    const response = await registerOptions({}, owner.cookie)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
  })
})