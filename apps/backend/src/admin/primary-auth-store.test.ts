import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import {
  createPostgresAdminPrimaryAuthStore,
  invalidateAdminPrimaryAuthForUserInTransaction,
} from './primary-auth-store.js'
import { digestAdminPrimaryAuthOauthState, type AdminPrimaryAuthActor } from './primary-auth.js'

const actor: AdminPrimaryAuthActor = {
  userId: 'admin-user',
  sessionId: 'admin-session',
  allowlistedSuperAdministrator: false,
}

const waitForBlockedQuery = async (database: pg.Pool, marker: string): Promise<void> => {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const result = await database.query<{ readonly blocked: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE
            datname = current_database()
            AND pid <> pg_backend_pid()
            AND state = 'active'
            AND wait_event_type = 'Lock'
            AND position($1 in query) > 0
        ) AS blocked
      `,
      [marker],
    )
    if (result.rows[0]?.blocked) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`Timed out waiting for blocked PostgreSQL query: ${marker}`)
}

describe('PostgreSQL administrator primary-authentication store', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const store = createPostgresAdminPrimaryAuthStore(database)

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await database.query(
      `
        INSERT INTO "user" (id, name, email, role)
        VALUES ('admin-user', 'Administrator', 'admin@example.test', 'admin')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'admin-session',
          clock_timestamp() + interval '1 hour',
          'admin-session-token',
          clock_timestamp(),
          'admin-user'
        )
      `,
    )
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
        VALUES (
          'credential-account-row',
          'admin-user',
          'credential',
          'admin-user',
          'current-password-hash',
          clock_timestamp()
        )
      `,
    )
  })

  it('opens an exact ten-minute server-time window without sliding on reads', async () => {
    const passwordCredential = { id: 'credential-account-row', passwordHash: 'current-password-hash' }
    const opened = await store.openWindow({ identity: actor, method: 'password', passwordCredential })
    expect(opened).not.toBeNull()

    const initial = await database.query<{ completed_at: Date; expires_at: Date }>(
      `SELECT completed_at, expires_at FROM admin_primary_auth_windows WHERE session_id = 'admin-session'`,
    )
    expect(initial.rows[0]!.expires_at.getTime() - initial.rows[0]!.completed_at.getTime()).toBe(600_000)

    await expect(store.getActiveWindow(actor)).resolves.toEqual({ expiresAt: initial.rows[0]!.expires_at })
    await expect(store.getActiveWindow(actor)).resolves.toEqual({ expiresAt: initial.rows[0]!.expires_at })
    const afterReads = await database.query<{ completed_at: Date; expires_at: Date }>(
      `SELECT completed_at, expires_at FROM admin_primary_auth_windows WHERE session_id = 'admin-session'`,
    )
    expect(afterReads.rows).toEqual(initial.rows)

    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        UPDATE admin_primary_auth_windows
        SET
          completed_at = auth_clock.now - interval '10 minutes',
          expires_at = auth_clock.now
        FROM auth_clock
        WHERE session_id = 'admin-session'
      `,
    )
    await expect(store.getActiveWindow(actor)).resolves.toBeNull()
  })

  it('rechecks that the verified password credential is still current before opening a window', async () => {
    const passwordCredential = { id: 'credential-account-row', passwordHash: 'current-password-hash' }
    await database.query(
      `UPDATE account SET password = 'replacement-password-hash' WHERE id = 'credential-account-row'`,
    )

    await expect(store.openWindow({ identity: actor, method: 'password', passwordCredential })).resolves.toBeNull()
    await expect(store.openWindow({ identity: actor, method: 'password' })).resolves.toBeNull()

    await database.query(`UPDATE account SET password = 'current-password-hash' WHERE id = 'credential-account-row'`)
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
        VALUES (
          'duplicate-credential-account-row',
          'admin-user',
          'credential',
          'admin-user',
          'current-password-hash',
          clock_timestamp()
        )
      `,
    )
    await expect(store.openWindow({ identity: actor, method: 'password', passwordCredential })).resolves.toBeNull()
  })

  it('reserves at most five password verifications under concurrency and resets after success', async () => {
    const reservations = await Promise.all(Array.from({ length: 20 }, () => store.reservePasswordAttempt(actor.userId)))
    expect(reservations.filter(Boolean)).toHaveLength(5)
    expect(reservations.filter((allowed) => !allowed)).toHaveLength(15)
    await expect(store.reservePasswordAttempt(actor.userId)).resolves.toBe(false)

    const rateRow = await database.query<{ failure_count: number; blocked: boolean }>(
      `
        SELECT failure_count, blocked_until > clock_timestamp() AS blocked
        FROM admin_primary_auth_password_rate_limits
        WHERE user_id = 'admin-user'
      `,
    )
    expect(rateRow.rows).toEqual([{ failure_count: 5, blocked: true }])

    await store.clearPasswordAttempts(actor.userId)
    await expect(store.reservePasswordAttempt(actor.userId)).resolves.toBe(true)
  })

  it('atomically consumes a provider/account/session-bound challenge once', async () => {
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-account-row', 'google-subject', 'google', 'admin-user', clock_timestamp())
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'other-session',
          clock_timestamp() + interval '1 hour',
          'other-session-token',
          clock_timestamp(),
          'admin-user'
        )
      `,
    )

    const state = 'state-value-that-is-long-enough-for-oauth'
    const stateDigest = digestAdminPrimaryAuthOauthState(state)
    await store.createOauthAttempt({
      stateDigest,
      userId: actor.userId,
      sessionId: actor.sessionId,
      allowlistedSuperAdministrator: false,
      accountId: 'google-account-row',
      provider: 'google',
      providerAccountId: 'google-subject',
      codeVerifier: 'A'.repeat(64),
      nonce: 'nonce-value',
      redirectUri: 'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
    })

    await expect(
      store.consumeOauthAttempt({
        stateDigest,
        identity: { userId: actor.userId, sessionId: 'other-session' },
        provider: 'google',
      }),
    ).resolves.toBeNull()

    const completions = await Promise.all(
      Array.from({ length: 8 }, () => store.consumeOauthAttempt({ stateDigest, identity: actor, provider: 'google' })),
    )
    expect(completions.filter((attempt) => attempt !== null)).toHaveLength(1)
    expect(completions.find((attempt) => attempt !== null)).toMatchObject({
      userId: actor.userId,
      sessionId: actor.sessionId,
      accountId: 'google-account-row',
      providerAccountId: 'google-subject',
      nonce: 'nonce-value',
    })
    await expect(store.consumeOauthAttempt({ stateDigest, identity: actor, provider: 'google' })).resolves.toBeNull()
  })

  it('rejects a stale session or exact provider-account snapshot when creating an OAuth challenge', async () => {
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-account-row', 'google-subject', 'google', 'admin-user', clock_timestamp())
      `,
    )
    const attempt = {
      stateDigest: 'c'.repeat(64),
      userId: actor.userId,
      sessionId: actor.sessionId,
      allowlistedSuperAdministrator: false,
      accountId: 'google-account-row',
      provider: 'google' as const,
      providerAccountId: 'google-subject',
      codeVerifier: 'C'.repeat(64),
      nonce: 'creation-nonce',
      redirectUri: 'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
    }

    await database.query(`UPDATE account SET provider_id = 'credential' WHERE id = 'google-account-row'`)
    await expect(store.createOauthAttempt(attempt)).rejects.toThrow('OAuth challenge could not be created')

    await database.query(
      `UPDATE account SET provider_id = 'google', account_id = 'replacement-subject' WHERE id = 'google-account-row'`,
    )
    await expect(store.createOauthAttempt(attempt)).rejects.toThrow('OAuth challenge could not be created')

    await database.query(`UPDATE account SET account_id = 'google-subject' WHERE id = 'google-account-row'`)
    await database.query(`UPDATE session SET expires_at = clock_timestamp() WHERE id = 'admin-session'`)
    await expect(store.createOauthAttempt(attempt)).rejects.toThrow('OAuth challenge could not be created')

    await database.query(
      `UPDATE session SET expires_at = clock_timestamp() + interval '1 hour' WHERE id = 'admin-session'`,
    )
    await database.query(`UPDATE "user" SET role = 'user' WHERE id = 'admin-user'`)
    await expect(store.createOauthAttempt(attempt)).rejects.toThrow('OAuth challenge could not be created')

    await expect(store.createOauthAttempt({ ...attempt, allowlistedSuperAdministrator: true })).resolves.toEqual({
      createdAt: expect.any(Date),
      expiresAt: expect.any(Date),
    })

    const remaining = await database.query<{ readonly attempts: number }>(
      `SELECT count(*)::integer AS attempts FROM admin_primary_auth_oauth_attempts`,
    )
    expect(remaining.rows).toEqual([{ attempts: 1 }])
  })

  it('rechecks live session, role, and exact linked account before opening an OAuth window', async () => {
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-account-row', '42', 'google', 'admin-user', clock_timestamp())
      `,
    )
    const linkedAccount = { id: 'google-account-row', accountId: '42' }
    await expect(store.openWindow({ identity: actor, method: 'google', linkedAccount })).resolves.toEqual({
      expiresAt: expect.any(Date),
    })

    await store.invalidateSession(actor.sessionId)
    await expect(store.getActiveWindow(actor)).resolves.toBeNull()

    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('duplicate-google-account-row', '84', 'google', 'admin-user', clock_timestamp())
      `,
    )
    await expect(store.openWindow({ identity: actor, method: 'google', linkedAccount })).resolves.toBeNull()
    await database.query(`DELETE FROM account WHERE id = 'duplicate-google-account-row'`)

    await database.query(`UPDATE "user" SET role = 'user' WHERE id = 'admin-user'`)
    await expect(store.openWindow({ identity: actor, method: 'google', linkedAccount })).resolves.toBeNull()
    await expect(
      store.openWindow({
        identity: { ...actor, allowlistedSuperAdministrator: true },
        method: 'google',
        linkedAccount,
      }),
    ).resolves.toEqual({ expiresAt: expect.any(Date) })

    await database.query(`DELETE FROM account WHERE id = 'google-account-row'`)
    await expect(
      store.openWindow({
        identity: { ...actor, allowlistedSuperAdministrator: true },
        method: 'google',
        linkedAccount,
      }),
    ).resolves.toBeNull()

    await database.query(`DELETE FROM session WHERE id = 'admin-session'`)
    await expect(store.getActiveWindow(actor)).resolves.toBeNull()
  })

  it('provides immediate user invalidation for role and ban transition transactions', async () => {
    const passwordCredential = { id: 'credential-account-row', passwordHash: 'current-password-hash' }
    await store.openWindow({ identity: actor, method: 'password', passwordCredential })
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-invalidation-row', 'google-invalidation-subject', 'google', 'admin-user', clock_timestamp())
      `,
    )
    await store.createOauthAttempt({
      stateDigest: 'b'.repeat(64),
      userId: actor.userId,
      sessionId: actor.sessionId,
      allowlistedSuperAdministrator: false,
      accountId: 'google-invalidation-row',
      provider: 'google',
      providerAccountId: 'google-invalidation-subject',
      codeVerifier: 'B'.repeat(64),
      nonce: 'invalidation-nonce',
      redirectUri: 'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
    })

    await store.invalidateUser(actor.userId)

    const remaining = await database.query<{ windows: number; attempts: number }>(
      `
        SELECT
          (SELECT count(*)::integer FROM admin_primary_auth_windows) AS windows,
          (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts) AS attempts
      `,
    )
    expect(remaining.rows).toEqual([{ windows: 0, attempts: 0 }])
  })

  it('serializes demotion invalidation before OAuth challenge eligibility without deadlocking', async () => {
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-lock-order-row', 'google-lock-order-subject', 'google', 'admin-user', clock_timestamp())
      `,
    )
    const transition = await database.connect()
    let creating: Promise<{ readonly createdAt: Date; readonly expiresAt: Date }> | undefined

    try {
      await transition.query('BEGIN')
      await transition.query(`SELECT id FROM "user" WHERE id = $1 FOR UPDATE`, [actor.userId])
      await transition.query(`UPDATE "user" SET role = 'user' WHERE id = $1`, [actor.userId])

      creating = store.createOauthAttempt({
        stateDigest: 'd'.repeat(64),
        userId: actor.userId,
        sessionId: actor.sessionId,
        allowlistedSuperAdministrator: false,
        accountId: 'google-lock-order-row',
        provider: 'google',
        providerAccountId: 'google-lock-order-subject',
        codeVerifier: 'D'.repeat(64),
        nonce: 'lock-order-nonce',
        redirectUri: 'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
      })
      await waitForBlockedQuery(database, 'admin-primary-auth:create-oauth-attempt:lock-user')

      // Creation is waiting on the first canonical lock, so it cannot hold a
      // session FK lock while invalidation advances from user to session.
      await invalidateAdminPrimaryAuthForUserInTransaction(transition, actor.userId)
      await transition.query('COMMIT')

      await expect(creating).rejects.toThrow('OAuth challenge could not be created')
      const remaining = await database.query<{ readonly attempts: number }>(
        `SELECT count(*)::integer AS attempts FROM admin_primary_auth_oauth_attempts WHERE user_id = $1`,
        [actor.userId],
      )
      expect(remaining.rows).toEqual([{ attempts: 0 }])
    } finally {
      await transition.query('ROLLBACK').catch(() => undefined)
      transition.release()
      await Promise.allSettled([creating].filter((promise) => promise !== undefined))
    }
  })

  it('serializes a window completed first before standalone user invalidation removes it', async () => {
    const blocker = await database.connect()
    let opening: Promise<{ readonly expiresAt: Date } | null> | undefined
    let invalidating: Promise<void> | undefined

    try {
      await blocker.query('BEGIN')
      await blocker.query(`SELECT id FROM account WHERE id = 'credential-account-row' FOR UPDATE`)

      opening = store.openWindow({
        identity: actor,
        method: 'password',
        passwordCredential: { id: 'credential-account-row', passwordHash: 'current-password-hash' },
      })
      await waitForBlockedQuery(database, 'admin-primary-auth:open-window:lock-account')

      invalidating = store.invalidateUser(actor.userId)
      await waitForBlockedQuery(database, 'admin-primary-auth:invalidate-user:lock-user')

      await blocker.query('COMMIT')
      await expect(opening).resolves.toEqual({ expiresAt: expect.any(Date) })
      await invalidating

      await expect(store.getActiveWindow(actor)).resolves.toBeNull()
      const remaining = await database.query<{ readonly windows: number }>(
        `SELECT count(*)::integer AS windows FROM admin_primary_auth_windows WHERE user_id = $1`,
        [actor.userId],
      )
      expect(remaining.rows).toEqual([{ windows: 0 }])
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined)
      blocker.release()
      await Promise.allSettled([opening, invalidating].filter((promise) => promise !== undefined))
    }
  })

  it('serializes transaction-scoped demotion invalidation before a new window eligibility check', async () => {
    const passwordCredential = { id: 'credential-account-row', passwordHash: 'current-password-hash' }
    await expect(store.openWindow({ identity: actor, method: 'password', passwordCredential })).resolves.toEqual({
      expiresAt: expect.any(Date),
    })

    const transition = await database.connect()
    let reopening: Promise<{ readonly expiresAt: Date } | null> | undefined

    try {
      await transition.query('BEGIN')
      await transition.query(`UPDATE "user" SET role = 'user' WHERE id = $1`, [actor.userId])
      await invalidateAdminPrimaryAuthForUserInTransaction(transition, actor.userId)

      reopening = store.openWindow({ identity: actor, method: 'password', passwordCredential })
      await waitForBlockedQuery(database, 'admin-primary-auth:open-window:lock-user')

      await transition.query('COMMIT')
      await expect(reopening).resolves.toBeNull()

      const remaining = await database.query<{ readonly windows: number }>(
        `SELECT count(*)::integer AS windows FROM admin_primary_auth_windows WHERE user_id = $1`,
        [actor.userId],
      )
      expect(remaining.rows).toEqual([{ windows: 0 }])
    } finally {
      await transition.query('ROLLBACK').catch(() => undefined)
      transition.release()
      await Promise.allSettled([reopening].filter((promise) => promise !== undefined))
    }
  })
})