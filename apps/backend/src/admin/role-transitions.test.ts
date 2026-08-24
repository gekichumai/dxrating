import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { demoteAdministratorToUserInTransaction, promoteUserToAdministratorInTransaction } from './role-transitions.js'
import { revokeAllUserSessionsInTransaction } from './session-transitions.js'

const insertUserWithSessionsAndProofs = async (database: pg.Pool) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role)
      VALUES ('transition-user', 'Transition User', 'transition@example.test', 'admin')
    `,
  )
  await database.query(
    `
      INSERT INTO session (id, expires_at, token, updated_at, user_id)
      VALUES
        ('transition-session-a', clock_timestamp() + interval '1 hour', 'transition-token-a', clock_timestamp(), 'transition-user'),
        ('transition-session-b', clock_timestamp() + interval '1 hour', 'transition-token-b', clock_timestamp(), 'transition-user')
    `,
  )
  await database.query(
    `
      INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
      VALUES ('transition-google-account', 'transition-google-subject', 'google', 'transition-user', clock_timestamp())
    `,
  )
  await database.query(
    `
      WITH auth_clock AS (SELECT clock_timestamp() AS now)
      INSERT INTO admin_primary_auth_windows (session_id, user_id, method, completed_at, expires_at)
      SELECT 'transition-session-a', 'transition-user', 'google', now, now + interval '10 minutes'
      FROM auth_clock
    `,
  )
  await database.query(
    `
      WITH auth_clock AS (SELECT clock_timestamp() AS now)
      INSERT INTO admin_primary_auth_oauth_attempts (
        state_digest,
        session_id,
        user_id,
        account_id,
        provider,
        provider_account_id,
        code_verifier,
        nonce,
        redirect_uri,
        created_at,
        expires_at
      )
      SELECT
        repeat('a', 64),
        'transition-session-b',
        'transition-user',
        'transition-google-account',
        'google',
        'transition-google-subject',
        repeat('V', 64),
        'transition-nonce',
        'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
        now,
        now + interval '10 minutes'
      FROM auth_clock
    `,
  )
  await database.query(
    `
      INSERT INTO admin_primary_auth_password_rate_limits (
        user_id,
        window_started_at,
        failure_count,
        updated_at
      )
      VALUES ('transition-user', clock_timestamp(), 2, clock_timestamp())
    `,
  )
}

const runInTransaction = async <Result>(
  database: pg.Pool,
  operation: (transaction: PoolClient) => Promise<Result>,
): Promise<Result> => {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
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

describe('administrator role and session transitions', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(cleanDatabase)

  it('promotes atomically, preserves public sessions, and requires a session issued after promotion', async () => {
    await database.query(
      `INSERT INTO "user" (id, name, email) VALUES ('candidate', 'Candidate', 'candidate@example.test')`,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES ('pre-promotion', clock_timestamp() + interval '1 hour', 'pre-promotion-token', clock_timestamp(), 'candidate')
      `,
    )

    const transition = await runInTransaction(database, (transaction) =>
      promoteUserToAdministratorInTransaction(transaction, 'candidate'),
    )
    expect(transition).toMatchObject({
      userId: 'candidate',
      previousRole: 'user',
      nextRole: 'admin',
      revokedSessionCount: 0,
      authorizationNotBefore: expect.any(Date),
    })

    const oldSession = await database.query<{ readonly stale: boolean }>(
      `
        SELECT s.admin_authorization_issued_at <= u.admin_authorization_not_before AS stale
        FROM session s
        INNER JOIN "user" u ON u.id = s.user_id
        WHERE s.id = 'pre-promotion'
      `,
    )
    expect(oldSession.rows).toEqual([{ stale: true }])

    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES ('post-promotion', clock_timestamp() + interval '1 hour', 'post-promotion-token', clock_timestamp(), 'candidate')
      `,
    )
    const sessions = await database.query<{ readonly id: string; readonly eligible: boolean }>(
      `
        SELECT s.id, s.admin_authorization_issued_at > u.admin_authorization_not_before AS eligible
        FROM session s
        INNER JOIN "user" u ON u.id = s.user_id
        WHERE u.id = 'candidate'
        ORDER BY s.id
      `,
    )
    expect(sessions.rows).toEqual([
      { id: 'post-promotion', eligible: true },
      { id: 'pre-promotion', eligible: false },
    ])

    await expect(
      runInTransaction(database, (transaction) => promoteUserToAdministratorInTransaction(transaction, 'candidate')),
    ).resolves.toBeNull()
  })

  it('waits for a session committed before promotion and makes that session stale', async () => {
    await database.query(
      `INSERT INTO "user" (id, name, email) VALUES ('promotion-race-before', 'Before', 'before@example.test')`,
    )

    const sessionWriter = await database.connect()
    let promotion: Promise<Awaited<ReturnType<typeof promoteUserToAdministratorInTransaction>> | null> | undefined
    try {
      await sessionWriter.query('BEGIN')
      await sessionWriter.query(
        `
          INSERT INTO session (id, expires_at, token, updated_at, user_id)
          VALUES (
            'promotion-race-before-session',
            clock_timestamp() + interval '1 hour',
            'promotion-race-before-token',
            clock_timestamp(),
            'promotion-race-before'
          )
        `,
      )

      promotion = runInTransaction(database, (transaction) =>
        promoteUserToAdministratorInTransaction(transaction, 'promotion-race-before'),
      )
      await waitForBlockedQuery(database, 'admin-role-transition:promote:lock-user')

      await sessionWriter.query('COMMIT')
      await expect(promotion).resolves.toMatchObject({ previousRole: 'user', nextRole: 'admin' })
    } finally {
      await sessionWriter.query('ROLLBACK').catch(() => undefined)
      sessionWriter.release()
      await Promise.allSettled([promotion].filter((operation) => operation !== undefined))
    }

    const authorization = await database.query<{ readonly stale: boolean }>(
      `
        SELECT s.admin_authorization_issued_at <= u.admin_authorization_not_before AS stale
        FROM session s
        INNER JOIN "user" u ON u.id = s.user_id
        WHERE s.id = 'promotion-race-before-session'
      `,
    )
    expect(authorization.rows).toEqual([{ stale: true }])
  })

  it('prevents a concurrent session from committing until promotion commits', async () => {
    await database.query(
      `INSERT INTO "user" (id, name, email) VALUES ('promotion-race-after', 'After', 'after@example.test')`,
    )

    const promotion = await database.connect()
    let sessionInsert: Promise<pg.QueryResult> | undefined
    try {
      await promotion.query('BEGIN')
      await expect(promoteUserToAdministratorInTransaction(promotion, 'promotion-race-after')).resolves.toMatchObject({
        previousRole: 'user',
        nextRole: 'admin',
      })

      sessionInsert = database.query(
        `
          /* admin-role-transition-test:insert-session-after */
          INSERT INTO session (id, expires_at, token, updated_at, user_id)
          VALUES (
            'promotion-race-after-session',
            clock_timestamp() + interval '1 hour',
            'promotion-race-after-token',
            clock_timestamp(),
            'promotion-race-after'
          )
        `,
      )
      await waitForBlockedQuery(database, 'admin-role-transition-test:insert-session-after')

      const beforeCommit = await database.query<{ readonly count: number }>(
        `SELECT count(*)::integer AS count FROM session WHERE id = 'promotion-race-after-session'`,
      )
      expect(beforeCommit.rows).toEqual([{ count: 0 }])

      await promotion.query('COMMIT')
      await expect(sessionInsert).resolves.toMatchObject({ rowCount: 1 })
    } finally {
      await promotion.query('ROLLBACK').catch(() => undefined)
      promotion.release()
      await Promise.allSettled([sessionInsert].filter((operation) => operation !== undefined))
    }

    const authorization = await database.query<{ readonly eligible: boolean }>(
      `
        SELECT s.admin_authorization_issued_at > u.admin_authorization_not_before AS eligible
        FROM session s
        INNER JOIN "user" u ON u.id = s.user_id
        WHERE s.id = 'promotion-race-after-session'
      `,
    )
    expect(authorization.rows).toEqual([{ eligible: true }])
  })

  it('demotes and removes every session-bound proof while preserving password rate-limit state', async () => {
    await insertUserWithSessionsAndProofs(database)

    const transition = await runInTransaction(database, (transaction) =>
      demoteAdministratorToUserInTransaction(transaction, 'transition-user'),
    )
    expect(transition).toMatchObject({
      userId: 'transition-user',
      previousRole: 'admin',
      nextRole: 'user',
      revokedSessionCount: 2,
    })

    const remaining = await database.query<{
      readonly role: string
      readonly sessions: number
      readonly windows: number
      readonly attempts: number
      readonly rate_limits: number
    }>(
      `
        SELECT
          u.role::text AS role,
          (SELECT count(*)::integer FROM session WHERE user_id = u.id) AS sessions,
          (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = u.id) AS windows,
          (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts WHERE user_id = u.id) AS attempts,
          (SELECT count(*)::integer FROM admin_primary_auth_password_rate_limits WHERE user_id = u.id) AS rate_limits
        FROM "user" u
        WHERE u.id = 'transition-user'
      `,
    )
    expect(remaining.rows).toEqual([{ role: 'user', sessions: 0, windows: 0, attempts: 0, rate_limits: 1 }])
    await expect(
      runInTransaction(database, (transaction) =>
        demoteAdministratorToUserInTransaction(transaction, 'transition-user'),
      ),
    ).resolves.toBeNull()
  })

  it('rolls back role, sessions, and primary-auth proofs together on failure', async () => {
    await insertUserWithSessionsAndProofs(database)
    const client = await database.connect()
    try {
      await client.query('BEGIN')
      await expect(demoteAdministratorToUserInTransaction(client, 'transition-user')).resolves.toMatchObject({
        revokedSessionCount: 2,
      })
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }

    const restored = await database.query<{
      readonly role: string
      readonly sessions: number
      readonly windows: number
      readonly attempts: number
    }>(
      `
        SELECT
          u.role::text AS role,
          (SELECT count(*)::integer FROM session WHERE user_id = u.id) AS sessions,
          (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = u.id) AS windows,
          (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts WHERE user_id = u.id) AS attempts
        FROM "user" u
        WHERE u.id = 'transition-user'
      `,
    )
    expect(restored.rows).toEqual([{ role: 'admin', sessions: 2, windows: 1, attempts: 1 }])
  })

  it('makes repeated and concurrent session revocation idempotent', async () => {
    await insertUserWithSessionsAndProofs(database)

    const revocations = await Promise.all([
      runInTransaction(database, (transaction) => revokeAllUserSessionsInTransaction(transaction, 'transition-user')),
      runInTransaction(database, (transaction) => revokeAllUserSessionsInTransaction(transaction, 'transition-user')),
    ])
    expect(revocations.map((result) => result.revokedSessionCount).sort()).toEqual([0, 2])

    await expect(
      runInTransaction(database, (transaction) => revokeAllUserSessionsInTransaction(transaction, 'transition-user')),
    ).resolves.toEqual({ userId: 'transition-user', revokedSessionCount: 0 })
    await expect(
      runInTransaction(database, (transaction) => revokeAllUserSessionsInTransaction(transaction, 'missing-user')),
    ).resolves.toEqual({ userId: 'missing-user', revokedSessionCount: 0 })

    const rateLimit = await database.query<{ readonly count: number }>(
      `SELECT count(*)::integer AS count FROM admin_primary_auth_password_rate_limits WHERE user_id = 'transition-user'`,
    )
    expect(rateLimit.rows).toEqual([{ count: 1 }])
  })
})