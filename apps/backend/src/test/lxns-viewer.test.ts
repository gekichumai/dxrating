// The LXNS routes act on the signed-in viewer's credential only (gdp-ts `ViewerIs`); see src/test/gdp-mistakes.ts
// for the calls that must not compile.
import { pool } from '../db/index'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup'

const signedIn = async (email: string) => {
  await signUp(email, 'password123', email.split('@')[0])
  const cookie = extractSessionCookie(await signIn(email, 'password123'))
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
  return { cookie, id: rows[0].id }
}

const seedToken = (userId: string) =>
  pool.query(
    `INSERT INTO lxns_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, 'synthetic-access', 'synthetic-refresh', now() + interval '1 hour', 'read_user_profile read_player')`,
    [userId],
  )

const status = async (cookie: string) => {
  const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/io/import/lxns/status`, cookie)
  expect(res.status).toBe(200)
  return ((await res.json()) as { connected: boolean }).connected
}

describe('LXNS viewer routes', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)
  beforeEach(cleanDatabase)

  it('reports and disconnects only the signed-in viewer', async () => {
    const alice = await signedIn('lxns-alice@example.com')
    const bob = await signedIn('lxns-bob@example.com')
    await seedToken(alice.id)
    await seedToken(bob.id)

    expect(await status(alice.cookie)).toBe(true)
    expect(await status(bob.cookie)).toBe(true)

    const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/io/import/lxns/disconnect`, alice.cookie, {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(await status(alice.cookie)).toBe(false)
    expect(await status(bob.cookie)).toBe(true)
    const { rows } = await pool.query<{ user_id: string }>('SELECT user_id FROM lxns_oauth_tokens')
    expect(rows).toEqual([{ user_id: bob.id }])
  })

  // The handlers fail with UnauthorizedError, which the API answers as 500 today (not 401); this pins only that
  // nothing succeeds without a session.
  it('refuses every route without a session', async () => {
    for (const [method, path] of [
      ['POST', 'authorize'],
      ['GET', 'status'],
      ['POST', 'start'],
      ['POST', 'disconnect'],
    ] as const) {
      const res = await fetch(`${getBaseUrl()}/api/v1/io/import/lxns/${path}`, { method })
      expect(res.ok, path).toBe(false)
    }
  })
})