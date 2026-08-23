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

const adminFetch = (cookie?: string) =>
  fetch(`${getBaseUrl()}/api/admin/bootstrap`, {
    headers: {
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })

describe('administrator HTTP authorization', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)
  beforeEach(cleanDatabase)

  it('returns a typed unauthenticated response for missing and expired sessions', async () => {
    const missingResponse = await adminFetch()
    expect(missingResponse.status).toBe(401)
    await expect(missingResponse.json()).resolves.toMatchObject({
      defined: true,
      code: 'UNAUTHENTICATED',
      status: 401,
      data: { requestId: missingResponse.headers.get('X-DXRating-Request-ID') },
    })

    const signUpResponse = await signUp('expired-admin@example.com', 'password123', 'Expired Admin')
    const cookie = extractSessionCookie(signUpResponse)
    expect(cookie).toContain('dxrating')

    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await testPool.query(`UPDATE session SET expires_at = NOW() - INTERVAL '1 minute'`)
    } finally {
      await testPool.end()
    }

    const expiredResponse = await adminFetch(cookie)
    expect(expiredResponse.status).toBe(401)
    await expect(expiredResponse.json()).resolves.toMatchObject({
      defined: true,
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('re-reads the persisted role on every request instead of trusting the session', async () => {
    const signUpResponse = await signUp('live-role@example.com', 'password123', 'Live Role')
    const cookie = extractSessionCookie(signUpResponse)

    const ordinaryResponse = await adminFetch(cookie)
    expect(ordinaryResponse.status).toBe(403)
    await expect(ordinaryResponse.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
      status: 403,
    })

    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await testPool.query(`UPDATE "user" SET role = 'admin' WHERE email = 'live-role@example.com'`)

      const administratorResponse = await adminFetch(cookie)
      expect(administratorResponse.status).toBe(200)
      await expect(administratorResponse.json()).resolves.toMatchObject({
        ready: true,
        principal: {
          effectiveRole: 'admin',
          capabilities: {
            canModerateUsers: true,
            canModerateAdministrators: false,
            canManageAdministrators: false,
          },
        },
      })

      await testPool.query(`UPDATE "user" SET role = 'user' WHERE email = 'live-role@example.com'`)
    } finally {
      await testPool.end()
    }

    const demotedResponse = await adminFetch(cookie)
    expect(demotedResponse.status).toBe(403)
    await expect(demotedResponse.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
      status: 403,
    })
  })
})