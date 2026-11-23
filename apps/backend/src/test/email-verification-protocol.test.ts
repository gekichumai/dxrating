import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Sent mail goes to an in-memory outbox, and tokens are verified against a fixture issuer instead of real DNS and HTTPS
vi.mock('../services/mailer', async (importOriginal) =>
  (await import('./memory-mailer')).withMemoryMailer(await importOriginal()),
)
vi.mock('../services/email-verification-protocol', async (importOriginal) =>
  (await import('./evp-fixture-issuer')).withFixtureIssuer(await importOriginal()),
)

import { FIXTURE_EMAIL_DOMAIN, fixtureIssuer } from './evp-fixture-issuer'
import { memoryOutbox } from './memory-mailer'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, teardownTestServer } from './setup'
import { ORIGIN, register } from './webauthn'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(async () => {
  await cleanDatabase()
  memoryOutbox.clear()
  fixtureIssuer.reset()
})
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${getBaseUrl()}/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })

const newNonce = async () => {
  const response = await fetch(`${getBaseUrl()}/api/auth/email-verification-protocol/nonce`, {
    headers: { Origin: ORIGIN },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  return ((await response.json()) as { nonce: string }).nonce
}

const signUp = (email: string, evp?: { token: string; nonce: string }) =>
  post('/sign-up/email', {
    email,
    password: 'password123',
    name: 'Player',
    ...(evp ? { emailVerificationToken: evp.token, emailVerificationNonce: evp.nonce } : {}),
  })

/** Waits a moment longer than a background send takes */
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

const mailTo = async (address: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (memoryOutbox.to(address).length > 0) return memoryOutbox.to(address)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${address} received no mail`)
}

const recordOf = async (email: string) =>
  (
    await pool.query<{
      email_verified: boolean
      email_verified_at: Date | null
      email_verification_method: string | null
    }>('SELECT email_verified, email_verified_at, email_verification_method FROM "user" WHERE email = $1', [email])
  ).rows[0]

describe('Email Verification Protocol on sign-up', () => {
  it('verifies the address from a valid token and mails nothing', async () => {
    const email = `new@${FIXTURE_EMAIL_DOMAIN}`
    const nonce = await newNonce()
    const token = await fixtureIssuer.mint({ email, audience: ORIGIN, nonce })

    const response = await signUp(email, { token, nonce })
    expect(response.status).toBe(200)
    const record = await recordOf(email)
    expect(record).toMatchObject({ email_verified: true, email_verification_method: 'email_verification_protocol' })
    expect(record!.email_verified_at).toBeInstanceOf(Date)
    await settle()
    expect(memoryOutbox.to(email)).toEqual([])

    const session = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: extractSessionCookie(response) },
    })
    expect(((await session.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true)
  })

  it('signs up unverified and mails the link when the token does not hold', async () => {
    const email = `bad@${FIXTURE_EMAIL_DOMAIN}`
    const nonce = await newNonce()
    // Bound to another form
    const token = await fixtureIssuer.mint({ email, audience: ORIGIN, nonce: await newNonce() })

    const response = await signUp(email, { token, nonce })
    expect(response.status).toBe(200)
    expect(await recordOf(email)).toMatchObject({ email_verified: false, email_verification_method: null })
    expect(await mailTo(email)).toHaveLength(1)
  })

  it('ignores garbage in the fields, a nonce it did not issue, and an issuer it cannot reach', async () => {
    const garbage = `garbage@${FIXTURE_EMAIL_DOMAIN}`
    expect((await signUp(garbage, { token: 'not-a-token', nonce: 'nonce' })).status).toBe(200)
    expect(await recordOf(garbage)).toMatchObject({ email_verified: false })

    const forged = `forged@${FIXTURE_EMAIL_DOMAIN}`
    const token = await fixtureIssuer.mint({ email: forged, audience: ORIGIN, nonce: 'v1.made-up' })
    expect((await signUp(forged, { token, nonce: 'v1.made-up' })).status).toBe(200)
    expect(await recordOf(forged)).toMatchObject({ email_verified: false })

    const offline = `offline@${FIXTURE_EMAIL_DOMAIN}`
    fixtureIssuer.dns.clear()
    const nonce = await newNonce()
    const offlineToken = await fixtureIssuer.mint({ email: offline, audience: ORIGIN, nonce })
    expect((await signUp(offline, { token: offlineToken, nonce })).status).toBe(200)
    expect(await recordOf(offline)).toMatchObject({ email_verified: false })
    await mailTo(offline)
  })

  it('accepts a form nonce once', async () => {
    const nonce = await newNonce()
    const first = `first@${FIXTURE_EMAIL_DOMAIN}`
    await signUp(first, { token: await fixtureIssuer.mint({ email: first, audience: ORIGIN, nonce }), nonce })
    expect(await recordOf(first)).toMatchObject({ email_verified: true })

    const second = `second@${FIXTURE_EMAIL_DOMAIN}`
    await signUp(second, { token: await fixtureIssuer.mint({ email: second, audience: ORIGIN, nonce }), nonce })
    expect(await recordOf(second)).toMatchObject({ email_verified: false })
    await mailTo(second)
  })
})

describe('verifying a signed-in account with the browser', () => {
  it("verifies a passkey sign-up's address", async () => {
    const email = `passkey@${FIXTURE_EMAIL_DOMAIN}`
    const created = await register({ email })
    expect(created.status).toBe(200)
    const cookie = extractSessionCookie(created)

    const nonce = await newNonce()
    const token = await fixtureIssuer.mint({ email, audience: ORIGIN, nonce })
    const verified = await post('/email-verification-protocol/verify', { token, nonce }, cookie)
    expect(verified.status).toBe(200)
    expect(await verified.json()).toEqual({ verified: true })
    expect(await recordOf(email)).toMatchObject({
      email_verified: true,
      email_verification_method: 'email_verification_protocol',
    })

    // The same token again: the nonce is used
    const replayed = await post('/email-verification-protocol/verify', { token, nonce }, cookie)
    expect(await replayed.json()).toEqual({ verified: false })
  })

  it("won't verify another account's address, or anyone without a session", async () => {
    const email = `mine@${FIXTURE_EMAIL_DOMAIN}`
    const cookie = extractSessionCookie(await signUp(email))
    const nonce = await newNonce()
    const token = await fixtureIssuer.mint({ email: `theirs@${FIXTURE_EMAIL_DOMAIN}`, audience: ORIGIN, nonce })
    expect(await (await post('/email-verification-protocol/verify', { token, nonce }, cookie)).json()).toEqual({
      verified: false,
    })
    expect(await recordOf(email)).toMatchObject({ email_verified: false })

    const anonymous = await post('/email-verification-protocol/verify', { token, nonce })
    expect(anonymous.status).toBe(401)
  })
})