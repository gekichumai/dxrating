import type { AdminProcedureAuthorizationPolicy } from '@gekichumai/admin-contract'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { requireTargetAuthorization } from './authorization.js'
import {
  createPostgresAdminMutationAuthorizationTransaction,
  runPostgresAdminMutationAuthorizationTransaction,
} from './mutation-authorization-store.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { ADMIN_TRANSACTION_MAX_ATTEMPTS, runRetryableAdminTransaction } from './retryable-transaction.js'
import { revokeAllUserSessionsInTransaction } from './session-transitions.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'

const policy = {
  minimumRole: 'admin',
  recentPrimaryAuth: true,
  freshLogin: false,
  primaryAuthAction: 'user.ban',
  targetAction: 'moderate',
} as const satisfies AdminProcedureAuthorizationPolicy

const authentication: AdminRequestAuthentication = {
  status: 'authenticated',
  authorizationUser: { id: 'actor', role: 'admin' },
  principal: {
    userId: 'actor',
    effectiveRole: 'admin',
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
  session: { id: 'actor-session', authorizationIssuedAt: new Date(0) },
  assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: true },
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

describe('PostgreSQL administrator mutation authorization', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const superAdministrators = parseSuperAdministratorAllowlist('[]')

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
        VALUES
          ('actor', 'Actor', 'actor@example.test', 'admin'),
          ('target', 'Target', 'target@example.test', 'user')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES ('actor-session', clock_timestamp() + interval '1 hour', 'actor-token', clock_timestamp(), 'actor')
      `,
    )
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_windows (session_id, user_id, method, completed_at, expires_at)
        SELECT 'actor-session', 'actor', 'password', now, now + interval '10 minutes'
        FROM auth_clock
      `,
    )
  })

  it('rechecks the current session, authorization floor, and recent proof inside one transaction', async () => {
    await expect(
      runPostgresAdminMutationAuthorizationTransaction(
        (transaction) =>
          requireTargetAuthorization({
            context: { authentication },
            targetUserId: 'target',
            action: 'moderate',
            policy,
            transaction,
            superAdministrators,
          }),
        database,
      ),
    ).resolves.toMatchObject({
      actor: { id: 'actor', role: 'admin' },
      target: { id: 'target', role: 'user' },
      principal: { effectiveRole: 'admin' },
    })

    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        UPDATE admin_primary_auth_windows
        SET completed_at = auth_clock.now - interval '10 minutes', expires_at = auth_clock.now
        FROM auth_clock
        WHERE session_id = 'actor-session'
      `,
    )
    await expect(
      runPostgresAdminMutationAuthorizationTransaction(
        (transaction) =>
          requireTargetAuthorization({
            context: { authentication },
            targetUserId: 'target',
            action: 'moderate',
            policy,
            transaction,
            superAdministrators,
          }),
        database,
      ),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })

    await database.query(`UPDATE "user" SET admin_authorization_not_before = clock_timestamp() WHERE id = 'actor'`)
    await expect(
      runPostgresAdminMutationAuthorizationTransaction(
        (transaction) =>
          requireTargetAuthorization({
            context: { authentication },
            targetUserId: 'target',
            action: 'moderate',
            policy,
            transaction,
            superAdministrators,
          }),
        database,
      ),
    ).rejects.toMatchObject({ code: 'FRESH_LOGIN_REQUIRED' })
  })

  it('serializes behind demotion and never invokes a mutation with stale authority', async () => {
    const transition = await database.connect()
    const mutationRan = vi.fn()
    let authorizing: Promise<unknown> | undefined

    try {
      await transition.query('BEGIN')
      await transition.query(
        `
          UPDATE "user"
          SET role = 'user', admin_authorization_not_before = clock_timestamp()
          WHERE id = 'actor'
        `,
      )
      await revokeAllUserSessionsInTransaction(transition, 'actor')

      authorizing = runPostgresAdminMutationAuthorizationTransaction(async (transaction) => {
        const authorization = await requireTargetAuthorization({
          context: { authentication },
          targetUserId: 'target',
          action: 'moderate',
          policy,
          transaction,
          superAdministrators,
        })
        mutationRan()
        return authorization
      }, database)
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:exclusive')

      await transition.query('COMMIT')
      await expect(authorizing).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
      expect(mutationRan).not.toHaveBeenCalled()
    } finally {
      await transition.query('ROLLBACK').catch(() => undefined)
      transition.release()
      await Promise.allSettled([authorizing].filter((promise) => promise !== undefined))
    }
  })

  it('retries the whole transaction when an actor-session update wins the row race', async () => {
    let firstUsersLocked!: () => void
    let continueFirstAttempt!: () => void
    const usersLocked = new Promise<void>((resolve) => {
      firstUsersLocked = resolve
    })
    const firstAttemptMayContinue = new Promise<void>((resolve) => {
      continueFirstAttempt = resolve
    })
    let attempts = 0
    let sessionUpdate: Promise<pg.QueryResult> | undefined

    const authorizing = runRetryableAdminTransaction(database, async (databaseTransaction) => {
      const transaction = createPostgresAdminMutationAuthorizationTransaction(databaseTransaction)
      attempts += 1
      const users = await transaction.lockUsersByIdForUpdate(['actor', 'target'])
      if (attempts === 1) {
        firstUsersLocked()
        await firstAttemptMayContinue
      }
      const session = await transaction.lockSessionByIdForUpdate({ userId: 'actor', sessionId: 'actor-session' })
      return { users, session }
    })

    try {
      await usersLocked
      sessionUpdate = database.query(
        `/* admin-mutation-authorization:test-session-update */
         UPDATE session SET updated_at = clock_timestamp() WHERE id = 'actor-session'`,
      )
      await waitForBlockedQuery(database, 'admin-mutation-authorization:test-session-update')

      continueFirstAttempt()
      await expect(sessionUpdate).resolves.toMatchObject({ rowCount: 1 })
      await expect(authorizing).resolves.toMatchObject({
        users: expect.any(Map),
        session: { id: 'actor-session', userId: 'actor' },
      })
      expect(attempts).toBe(2)
    } finally {
      continueFirstAttempt()
      await Promise.allSettled([authorizing, sessionUpdate].filter((promise) => promise !== undefined))
    }
  })

  it('bounds exact lock retries and never repeats an unrelated failure', async () => {
    let lockAttempts = 0
    const lockFailure = Object.assign(new Error('synthetic lock conflict'), { code: '55P03' })
    await expect(
      runRetryableAdminTransaction(database, async () => {
        lockAttempts += 1
        throw lockFailure
      }),
    ).rejects.toBe(lockFailure)
    expect(lockAttempts).toBe(ADMIN_TRANSACTION_MAX_ATTEMPTS)

    let unrelatedAttempts = 0
    const unrelatedFailure = Object.assign(new Error('unrelated failure'), { code: 'XX000' })
    await expect(
      runRetryableAdminTransaction(database, async () => {
        unrelatedAttempts += 1
        throw unrelatedFailure
      }),
    ).rejects.toBe(unrelatedFailure)
    expect(unrelatedAttempts).toBe(1)
  })

  it('backs off long enough for a row lock to clear after the first NOWAIT conflict', async () => {
    const locker = await database.connect()
    let firstConflict!: () => void
    const firstConflictObserved = new Promise<void>((resolve) => {
      firstConflict = resolve
    })
    let attempts = 0

    try {
      await locker.query('BEGIN')
      await locker.query(`UPDATE session SET updated_at = clock_timestamp() WHERE id = 'actor-session'`)

      const operation = runRetryableAdminTransaction(database, async (transaction) => {
        attempts += 1
        try {
          return await transaction.query(`SELECT id FROM session WHERE id = 'actor-session' FOR UPDATE NOWAIT`)
        } catch (error) {
          if (attempts === 1) firstConflict()
          throw error
        }
      })

      await firstConflictObserved
      await locker.query('COMMIT')

      await expect(operation).resolves.toMatchObject({ rowCount: 1 })
      expect(attempts).toBe(2)
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined)
      locker.release()
    }
  })
})