import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'
import { TEST_ADMIN_ACCESS_HEADERS } from './admin-access.js'
import { ADMIN_ACCESS_TEST_BYPASS_HEADER } from '../admin/access-verifier.js'
import {
  demoteAdministratorToUserInTransaction,
  promoteUserToAdministratorInTransaction,
} from '../admin/role-transitions.js'
import { revokeAllUserSessionsInTransaction } from '../admin/session-transitions.js'

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

  it('keeps pre-promotion sessions public-only, admits a fresh login, and revokes every session on demotion', async () => {
    const signUpResponse = await signUp('live-role@example.com', 'password123', 'Live Role')
    const oldCookie = extractSessionCookie(signUpResponse)

    const ordinaryResponse = await adminFetch(oldCookie)
    expect(ordinaryResponse.status).toBe(403)
    await expect(ordinaryResponse.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
      status: 403,
    })

    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const candidate = await testPool.query<{ readonly id: string }>(
        `SELECT id FROM "user" WHERE email = 'live-role@example.com'`,
      )
      const userId = candidate.rows[0]!.id
      const transition = await testPool.connect()
      try {
        await transition.query('BEGIN')
        await expect(promoteUserToAdministratorInTransaction(transition, userId)).resolves.toMatchObject({
          previousRole: 'user',
          nextRole: 'admin',
          revokedSessionCount: 0,
        })
        await transition.query('COMMIT')
      } finally {
        transition.release()
      }

      const staleAdministratorResponse = await adminFetch(oldCookie)
      expect(staleAdministratorResponse.status).toBe(401)
      await expect(staleAdministratorResponse.json()).resolves.toMatchObject({
        defined: true,
        code: 'FRESH_LOGIN_REQUIRED',
        status: 401,
      })

      const publicSession = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
        headers: { Cookie: oldCookie },
      })
      expect(publicSession.status).toBe(200)
      await expect(publicSession.json()).resolves.toMatchObject({ user: { id: userId } })

      const issuanceBeforeRefresh = await testPool.query<{ readonly issued_at: Date }>(
        `SELECT admin_authorization_issued_at AS issued_at FROM session WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
        [userId],
      )
      await testPool.query(
        `UPDATE session SET updated_at = clock_timestamp(), expires_at = expires_at + interval '1 minute' WHERE user_id = $1`,
        [userId],
      )
      const issuanceAfterRefresh = await testPool.query<{ readonly issued_at: Date }>(
        `SELECT admin_authorization_issued_at AS issued_at FROM session WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
        [userId],
      )
      expect(issuanceAfterRefresh.rows).toEqual(issuanceBeforeRefresh.rows)
      const stillStaleResponse = await adminFetch(oldCookie)
      expect(stillStaleResponse.status).toBe(401)
      await expect(stillStaleResponse.json()).resolves.toMatchObject({ code: 'FRESH_LOGIN_REQUIRED' })

      const freshSignIn = await signIn('live-role@example.com', 'password123')
      expect(freshSignIn.status).toBe(200)
      const freshCookie = extractSessionCookie(freshSignIn)

      const administratorResponse = await adminFetch(freshCookie)
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
        const deniedWithoutAccess = await adminFetch(freshCookie, accessHeaders)
        expect(deniedWithoutAccess.status).toBe(403)
        const body = await deniedWithoutAccess.json()
        expect(body).toMatchObject({ defined: true, code: 'FORBIDDEN', status: 403 })
        expect(JSON.stringify(body)).not.toContain('spoofed')
      }

      const lifetimes = await testPool.query<{ readonly baseline_lifetime_seconds: string }>(
        `
          SELECT extract(
            epoch FROM (
              s.expires_at
              - s.created_at
              - CASE
                  WHEN s.admin_authorization_issued_at <= u.admin_authorization_not_before
                    THEN interval '1 minute'
                  ELSE interval '0 seconds'
                END
            )
          )::text AS baseline_lifetime_seconds
          FROM session s
          INNER JOIN "user" u ON u.id = s.user_id
          WHERE s.user_id = $1
          ORDER BY s.created_at
        `,
        [userId],
      )
      const baselineLifetimes = lifetimes.rows.map((row) => Number(row.baseline_lifetime_seconds))
      expect(baselineLifetimes).toHaveLength(2)
      expect(Math.max(...baselineLifetimes) - Math.min(...baselineLifetimes)).toBeLessThan(1)

      const demotion = await testPool.connect()
      try {
        await demotion.query('BEGIN')
        await expect(demoteAdministratorToUserInTransaction(demotion, userId)).resolves.toMatchObject({
          previousRole: 'admin',
          nextRole: 'user',
          revokedSessionCount: 2,
        })
        await demotion.query('COMMIT')
      } finally {
        demotion.release()
      }

      for (const revokedCookie of [oldCookie, freshCookie]) {
        const revokedPublicSession = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
          headers: { Cookie: revokedCookie },
        })
        expect(await revokedPublicSession.json()).toBeNull()

        const revokedAdminSession = await adminFetch(revokedCookie)
        expect(revokedAdminSession.status).toBe(401)
        await expect(revokedAdminSession.json()).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
      }
    } finally {
      await testPool.end()
    }
  })

  it('supports ban-shaped all-session revocation without preventing a later permitted login', async () => {
    const email = 'future-ban-revocation@example.com'
    const password = 'password123'
    const firstSession = extractSessionCookie(await signUp(email, password, 'Future Ban Revocation'))
    const secondSession = extractSessionCookie(await signIn(email, password))
    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

    try {
      const user = await testPool.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
      const userId = user.rows[0]!.id
      const transition = await testPool.connect()
      try {
        await transition.query('BEGIN')
        await expect(revokeAllUserSessionsInTransaction(transition, userId)).resolves.toMatchObject({
          revokedSessionCount: 2,
        })
        await transition.query('COMMIT')
      } finally {
        transition.release()
      }

      for (const cookie of [firstSession, secondSession]) {
        const revoked = await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
        expect(await revoked.json()).toBeNull()
      }

      // #314/#315 own the actual ban state and login rejection. Once that
      // caller permits authentication again (for example after expiry), this
      // revocation primitive leaves no permanent login denial behind.
      const permittedLogin = await signIn(email, password)
      expect(permittedLogin.status).toBe(200)
      const replacementCookie = extractSessionCookie(permittedLogin)
      const replacementSession = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
        headers: { Cookie: replacementCookie },
      })
      await expect(replacementSession.json()).resolves.toMatchObject({ user: { id: userId } })
    } finally {
      await testPool.end()
    }
  })

  it('requires Access proof independently of allowlisted super-administrator authority', async () => {
    const email = 'access-super-admin@example.com'
    const signUpResponse = await signUp(email, 'password123', 'Access Super Admin')
    const cookie = extractSessionCookie(signUpResponse)
    const allowlistedUserId = 'test-allowlisted-super-admin-id'

    const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const client = await testPool.connect()
      try {
        await client.query('BEGIN')
        const existingUser = await client.query<{
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

        await client.query(`UPDATE "user" SET email = $1 WHERE id = $2`, [
          `replaced-${original!.id}@example.invalid`,
          original!.id,
        ])
        await client.query(
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
        await client.query(`UPDATE account SET user_id = $1 WHERE user_id = $2`, [allowlistedUserId, original!.id])
        await client.query(`UPDATE session SET user_id = $1 WHERE user_id = $2`, [allowlistedUserId, original!.id])
        await client.query(`DELETE FROM "user" WHERE id = $1`, [original!.id])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }

      const staleGenerationResponse = await adminFetch(cookie)
      expect(staleGenerationResponse.status).toBe(401)
      await expect(staleGenerationResponse.json()).resolves.toMatchObject({
        code: 'FRESH_LOGIN_REQUIRED',
        status: 401,
      })

      await testPool.query(`UPDATE session SET admin_authorization_issued_at = clock_timestamp() WHERE user_id = $1`, [
        allowlistedUserId,
      ])

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
    } finally {
      await testPool.end()
    }
  })
})