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
import { ADMIN_ACCESS_TEST_BYPASS_HEADER } from '../admin/access-verifier.js'

const adminFetch = (cookie?: string, accessHeaders: Record<string, string> = TEST_ADMIN_ACCESS_HEADERS) =>
  fetch(`${getBaseUrl()}/api/admin/bootstrap`, {
    headers: {
      ...accessHeaders,
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

      const invalidAccessHeaders: Record<string, string>[] = [
        {},
        { [ADMIN_ACCESS_TEST_BYPASS_HEADER]: 'spoofed-test-proof' },
      ]
      for (const accessHeaders of invalidAccessHeaders) {
        const deniedWithoutAccess = await adminFetch(cookie, accessHeaders)
        expect(deniedWithoutAccess.status).toBe(403)
        const body = await deniedWithoutAccess.json()
        expect(body).toMatchObject({ defined: true, code: 'FORBIDDEN', status: 403 })
        expect(JSON.stringify(body)).not.toContain('spoofed')
      }

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

  it('requires Access proof independently of allowlisted super-administrator authority', async () => {
    const email = 'access-super-admin@example.com'
    const signUpResponse = await signUp(email, 'password123', 'Access Super Admin')
    const cookie = extractSessionCookie(signUpResponse)
    const allowlistedUserId = 'test-allowlisted-super-admin-id'

    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await testPool.query('BEGIN')
      const existingUser = await testPool.query<{
        id: string
        name: string
        email: string
        email_verified: boolean
        image: string | null
        created_at: Date
        updated_at: Date
      }>(
        `SELECT id, name, email, email_verified, image, created_at, updated_at
         FROM "user"
         WHERE email = $1`,
        [email],
      )
      const original = existingUser.rows[0]
      expect(original).toBeDefined()

      await testPool.query(`UPDATE "user" SET email = $1 WHERE id = $2`, [
        `replaced-${original!.id}@example.invalid`,
        original!.id,
      ])
      await testPool.query(
        `INSERT INTO "user" (id, name, email, email_verified, role, image, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'user', $5, $6, $7)`,
        [
          allowlistedUserId,
          original!.name,
          original!.email,
          original!.email_verified,
          original!.image,
          original!.created_at,
          original!.updated_at,
        ],
      )
      await testPool.query(`UPDATE account SET user_id = $1 WHERE user_id = $2`, [allowlistedUserId, original!.id])
      await testPool.query(`UPDATE session SET user_id = $1 WHERE user_id = $2`, [allowlistedUserId, original!.id])
      await testPool.query(`DELETE FROM "user" WHERE id = $1`, [original!.id])
      await testPool.query('COMMIT')

      const permittedResponse = await adminFetch(cookie)
      expect(permittedResponse.status).toBe(200)
      await expect(permittedResponse.json()).resolves.toMatchObject({
        principal: {
          effectiveRole: 'super_admin',
          capabilities: {
            canModerateAdministrators: true,
            canManageAdministrators: true,
          },
        },
      })

      const invalidAccessHeaders: Record<string, string>[] = [
        {},
        { [ADMIN_ACCESS_TEST_BYPASS_HEADER]: 'spoofed-test-proof' },
      ]
      for (const accessHeaders of invalidAccessHeaders) {
        const deniedResponse = await adminFetch(cookie, accessHeaders)
        expect(deniedResponse.status).toBe(403)
        const body = await deniedResponse.json()
        expect(body).toMatchObject({ defined: true, code: 'FORBIDDEN', status: 403 })
        expect(JSON.stringify(body)).not.toContain('super_admin')
        expect(JSON.stringify(body)).not.toContain('spoofed')
      }
    } catch (error) {
      await testPool.query('ROLLBACK')
      throw error
    } finally {
      await testPool.end()
    }
  })
})