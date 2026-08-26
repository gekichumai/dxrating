import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signUp,
  teardownTestServer,
} from './setup.js'
import { TEST_ADMIN_ACCESS_HEADERS } from './admin-access.js'
import { promoteFixtureUserToAdministrator } from './admin-role-fixtures.js'

const ADMIN_ORIGIN = 'http://localhost:5174'

const signInFromAdmin = (email: string, password: string) =>
  fetch(`${getBaseUrl()}/api/auth/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Origin: ADMIN_ORIGIN,
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
    },
    body: JSON.stringify({ email, password }),
  })

const promoteToAdministrator = async (email: string) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const transaction = await pool.connect()
  try {
    await transaction.query('BEGIN')
    const candidate = await transaction.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
      email,
    ])
    const userId = candidate.rows[0]?.id
    if (!userId) throw new Error(`Administrator fixture user not found: ${email}`)

    const transition = await promoteFixtureUserToAdministrator(transaction, userId)
    if (!transition) throw new Error(`Administrator fixture could not be promoted: ${email}`)
    await transaction.query('COMMIT')
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
    await pool.end()
  }
}

describe('administrator origin authentication integration', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  it('completes the credentialed sign-in, session, admin API, and sign-out round trip', async () => {
    const email = 'admin-origin@example.com'
    await signUp(email, 'password123', 'Admin Origin')
    await promoteToAdministrator(email)
    const signInResponse = await signInFromAdmin(email, 'password123')

    expect(signInResponse.status).toBe(200)
    expect(signInResponse.headers.get('Access-Control-Allow-Origin')).toBe(ADMIN_ORIGIN)
    expect(signInResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    const sessionSetCookie = signInResponse.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('dxrating.session_token='))
    expect(sessionSetCookie).toContain('HttpOnly')
    expect(sessionSetCookie).toContain('SameSite=Lax')
    expect(sessionSetCookie).not.toContain('Domain=')
    const cookie = extractSessionCookie(signInResponse)
    expect(cookie).toContain('dxrating.session_token=')

    const sessionResponse = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      credentials: 'include',
      headers: { Cookie: cookie, Origin: ADMIN_ORIGIN },
    })
    expect(sessionResponse.status).toBe(200)
    expect(sessionResponse.headers.get('Access-Control-Allow-Origin')).toBe(ADMIN_ORIGIN)
    await expect(sessionResponse.json()).resolves.toMatchObject({ user: { email } })

    const adminResponse = await fetch(`${getBaseUrl()}/api/admin/bootstrap`, {
      credentials: 'include',
      headers: {
        ...TEST_ADMIN_ACCESS_HEADERS,
        Cookie: cookie,
        Origin: ADMIN_ORIGIN,
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })
    expect(adminResponse.status).toBe(200)
    expect(adminResponse.headers.get('Access-Control-Allow-Origin')).toBe(ADMIN_ORIGIN)
    expect(adminResponse.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(adminResponse.json()).resolves.toMatchObject({
      ready: true,
      principal: { effectiveRole: 'admin' },
    })

    const notFoundResponse = await fetch(`${getBaseUrl()}/api/admin/not-a-procedure`, {
      credentials: 'include',
      headers: {
        ...TEST_ADMIN_ACCESS_HEADERS,
        Cookie: cookie,
        Origin: ADMIN_ORIGIN,
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })
    expect(notFoundResponse.status).toBe(404)
    expect(notFoundResponse.headers.get('Cache-Control')).toBe('private, no-store')

    const signOutResponse = await fetch(`${getBaseUrl()}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: ADMIN_ORIGIN },
      body: JSON.stringify({}),
    })
    expect(signOutResponse.status).toBe(200)
    expect(signOutResponse.headers.get('Access-Control-Allow-Origin')).toBe(ADMIN_ORIGIN)
    await expect(signOutResponse.json()).resolves.toEqual({ success: true })

    const expiredSessionResponse = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      credentials: 'include',
      headers: { Cookie: cookie, Origin: ADMIN_ORIGIN },
    })
    expect(expiredSessionResponse.status).toBe(200)
    expect(await expiredSessionResponse.json()).toBeNull()
  })

  it.each([
    ['a missing origin', undefined],
    ['the null origin', 'null'],
    ['an unrelated origin', 'https://unrelated.example'],
    ['a deceptive suffix origin', 'https://admin.dxrating.net.evil.example'],
  ])('keeps Better Auth CSRF validation active for %s', async (_description, origin) => {
    const originLabel = (origin ?? 'missing').replace(/[^a-z0-9]+/gi, '-')
    const email = `csrf-${originLabel}@example.com`
    await signUp(email, 'password123', 'CSRF User')
    const signInResponse = await signInFromAdmin(email, 'password123')
    const cookie = extractSessionCookie(signInResponse)
    const headers = new Headers({ 'Content-Type': 'application/json', Cookie: cookie })
    if (origin !== undefined) headers.set('Origin', origin)

    const response = await fetch(`${getBaseUrl()}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(403)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
  })

  it.each([
    ['a missing origin', undefined],
    ['the null origin', 'null'],
    ['an unrelated origin', 'https://unrelated.example'],
    ['a deceptive suffix origin', 'https://admin.dxrating.net.evil.example'],
  ])('rejects administrator mutations from %s before procedure routing', async (_description, origin) => {
    const headers = new Headers({
      ...TEST_ADMIN_ACCESS_HEADERS,
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
    })
    if (origin !== undefined) headers.set('Origin', origin)

    const response = await fetch(`${getBaseUrl()}/api/admin/not-a-procedure`, {
      method: 'POST',
      credentials: 'include',
      headers,
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toMatchObject({ defined: true, code: 'FORBIDDEN' })
  })

  it.each([
    ['a protocol downgrade', 'http://admin.dxrating.net/after-auth'],
    ['a user-info URL', 'https://user:password@admin.dxrating.net/after-auth'],
    ['a lookalike host', 'https://admin.dxrating.net.evil.example/after-auth'],
    ['an unrelated host', 'https://unrelated.example/after-auth'],
    ['an unconfigured preview', 'https://admin-pr-999.preview.dxrating.net/after-auth'],
    ['a protocol-relative redirect', '//unrelated.example/after-auth'],
  ])('rejects %s as an OAuth return URL', async (_description, callbackURL) => {
    const response = await fetch(`${getBaseUrl()}/api/auth/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL }),
    })

    expect(response.status).toBe(403)
  })

  it.each([
    'http://localhost:5174/after-auth',
    'http://admin-pr-306.localhost:5174/after-auth',
    'http://localhost:5173/after-auth',
  ])('accepts configured authentication return origin %s', async (callbackURL) => {
    const response = await fetch(`${getBaseUrl()}/api/auth/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'PROVIDER_NOT_FOUND' })
  })
})