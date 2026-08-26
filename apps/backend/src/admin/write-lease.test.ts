import { OpenAPIHandler } from '@orpc/openapi/fetch'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { createPostgresAdminPrimaryAuthStore } from './primary-auth-store.js'
import type { AdminPrimaryAuthService } from './primary-auth.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { runRetryableAdminTransaction } from './retryable-transaction.js'
import { createAdminRouter } from './router.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { runPostgresPublicUserWriteLease } from '../public-access-policy.js'
import { lockPostgresUserIdentitiesForModeration } from '../user-identity-advisory-lock.js'
import { getAdminWriteLeaseConcurrencyLimit, runPostgresAdminWriteLease } from './write-lease.js'

const identity = { userId: 'admin-writer', sessionId: 'admin-writer-session' } as const

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

const establishActiveBan = async (transaction: PoolClient, reason: string): Promise<void> => {
  const history = await transaction.query<{ readonly id: string }>(
    `
      INSERT INTO admin_user_ban_history (
        subject_user_id,
        actor_user_id,
        action,
        reason,
        ban_started_at,
        expires_at
      )
      VALUES ('admin-writer', 'moderator', 'ban', $1, clock_timestamp(), NULL)
      RETURNING id::text
    `,
    [reason],
  )
  await transaction.query(
    `
      INSERT INTO admin_user_ban_state (
        subject_user_id,
        established_action,
        ban_started_at,
        ban_expires_at,
        ban_reason,
        actor_user_id,
        established_by_event_id
      )
      SELECT
        subject_user_id,
        action,
        ban_started_at,
        expires_at,
        reason,
        actor_user_id,
        id
      FROM admin_user_ban_history
      WHERE id = $1
    `,
    [history.rows[0]!.id],
  )
  await transaction.query(`DELETE FROM session WHERE user_id = 'admin-writer'`)
}

describe('PostgreSQL administrator write lease', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const primaryAuthStore = createPostgresAdminPrimaryAuthStore(database, parseSuperAdministratorAllowlist(undefined))

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await database.query(
      `
        INSERT INTO "user" (id, name, email, role, admin_authorization_not_before)
        VALUES
          (
            'admin-writer',
            'Admin Writer',
            'admin-writer@example.test',
            'admin',
            '2000-01-01T00:00:00Z'::timestamptz
          ),
          (
            'moderator',
            'Moderator',
            'moderator@example.test',
            'admin',
            '2000-01-01T00:00:00Z'::timestamptz
          )
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'admin-writer-session',
          clock_timestamp() + interval '1 hour',
          'admin-writer-token',
          clock_timestamp(),
          'admin-writer'
        )
      `,
    )
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
        VALUES (
          'admin-writer-credential',
          'admin-writer',
          'credential',
          'admin-writer',
          'password-hash',
          clock_timestamp()
        )
      `,
    )
  })

  it('waits behind a winning ban and rejects generically before invoking the write', async () => {
    const moderation = await database.connect()
    const operation = vi.fn().mockResolvedValue('must-not-run')
    let writing: Promise<unknown> | undefined
    const privateReason = 'private administrator moderation reason'

    try {
      await moderation.query('BEGIN')
      await moderation.query(`SELECT id FROM "user" WHERE id = 'admin-writer' FOR UPDATE`)
      await establishActiveBan(moderation, privateReason)

      writing = runPostgresAdminWriteLease(identity, operation, database)
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:shared')

      await moderation.query('COMMIT')
      await expect(writing).rejects.toMatchObject({
        name: 'AdminAuthorizationFailure',
        code: 'UNAUTHENTICATED',
        message: 'Administrator authorization failed',
      })
      await writing.catch((error: unknown) => {
        expect(JSON.stringify(error)).not.toContain(privateReason)
        expect(JSON.stringify(error)).not.toContain(identity.userId)
      })
      expect(operation).not.toHaveBeenCalled()
    } finally {
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([writing].filter((promise) => promise !== undefined))
    }
  })

  it('denies a committed banned administrator over HTTP before primary-auth side effects', async () => {
    const moderation = await database.connect()
    const privateReason = 'private committed administrator ban reason'
    try {
      await moderation.query('BEGIN')
      await moderation.query(`SELECT id FROM "user" WHERE id = 'admin-writer' FOR UPDATE`)
      await establishActiveBan(moderation, privateReason)
      await moderation.query('COMMIT')
    } finally {
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
    }

    const completePassword = vi.fn(async () => ({
      completed: true as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }))
    const primaryAuth = {
      getStatus: vi.fn(async () => ({ active: false, expiresAt: null })),
      completePassword,
      initiateOauth: vi.fn(async () => ({ authorizationUrl: 'https://provider.example.test/authorize' })),
      completeOauth: vi.fn(async () => ({
        completed: true as const,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      invalidateSession: vi.fn(async () => undefined),
      invalidateUser: vi.fn(async () => undefined),
    } satisfies AdminPrimaryAuthService
    const requestAuthentication = {
      status: 'authenticated',
      authorizationUser: { id: identity.userId, role: 'admin' },
      principal: {
        userId: identity.userId,
        effectiveRole: 'admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: false,
          canManageAdministrators: false,
        },
      },
      session: {
        id: identity.sessionId,
        authorizationIssuedAt: new Date('2026-08-24T00:00:00.000Z'),
      },
      assurance: { recentPrimaryAuthSatisfied: false, freshLoginSatisfied: true },
    } satisfies AdminRequestAuthentication
    const handler = new OpenAPIHandler(
      createAdminRouter({
        primaryAuth,
        runWriteLease: (leaseIdentity, operation) => runPostgresAdminWriteLease(leaseIdentity, operation, database),
      }),
    )

    const result = await handler.handle(
      new Request('http://localhost/primary-auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'private-password-proof' }),
      }),
      { context: { authentication: requestAuthentication } },
    )

    expect(result.response?.status).toBe(401)
    const body = await result.response?.json()
    expect(body).toMatchObject({ defined: true, code: 'UNAUTHENTICATED' })
    expect(JSON.stringify(body)).not.toContain(privateReason)
    expect(JSON.stringify(body)).not.toContain(identity.userId)
    expect(JSON.stringify(body)).not.toContain('private-password-proof')
    expect(completePassword).not.toHaveBeenCalled()
  })

  it('lets an admitted write finish while a later ban waits for the lease', async () => {
    let enterOperation!: () => void
    let releaseOperation!: () => void
    const entered = new Promise<void>((resolve) => {
      enterOperation = resolve
    })
    const released = new Promise<void>((resolve) => {
      releaseOperation = resolve
    })
    const operation = vi.fn(async () => {
      enterOperation()
      await released
      await database.query(
        `INSERT INTO song_aliases (song_id, name, created_by)
         VALUES ('admin-lease-song', 'Admin Lease Alias', 'admin-writer')`,
      )
      return 'written'
    })
    const writing = runPostgresAdminWriteLease(identity, operation, database)
    await entered

    const moderation = await database.connect()
    let banLock: Promise<unknown> | undefined
    try {
      await moderation.query('BEGIN')
      banLock = lockPostgresUserIdentitiesForModeration(moderation, ['admin-writer'])
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:exclusive')

      releaseOperation()
      await expect(writing).resolves.toBe('written')
      await banLock
      await establishActiveBan(moderation, 'Later moderation')
      await moderation.query('COMMIT')

      expect(operation).toHaveBeenCalledOnce()
      await expect(
        database.query(`SELECT name FROM song_aliases WHERE created_by = 'admin-writer'`),
      ).resolves.toMatchObject({ rows: [{ name: 'Admin Lease Alias' }] })
    } finally {
      releaseOperation()
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([writing, banLock].filter((promise) => promise !== undefined))
    }
  })

  it('rejects a stale session with the same generic authorization failure', async () => {
    await database.query(`DELETE FROM session WHERE id = 'admin-writer-session'`)
    const operation = vi.fn().mockResolvedValue('must-not-run')

    await expect(runPostgresAdminWriteLease(identity, operation, database)).rejects.toEqual(
      expect.objectContaining({
        name: 'AdminAuthorizationFailure',
        code: 'UNAUTHENTICATED',
      }),
    )
    expect(operation).not.toHaveBeenCalled()
  })

  it('coexists with nested primary-auth user and session locks without deadlocking', async () => {
    await expect(
      runPostgresAdminWriteLease(
        identity,
        () =>
          primaryAuthStore.openWindow({
            identity,
            method: 'password',
            passwordCredential: { id: 'admin-writer-credential', passwordHash: 'password-hash' },
          }),
        database,
      ),
    ).resolves.toEqual({ expiresAt: expect.any(Date) })
  })

  it('shares one pool-capacity gate across public and administrator leases', async () => {
    const mixedDatabase = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
    const limit = getAdminWriteLeaseConcurrencyLimit(mixedDatabase)
    const leaseCount = limit * 2
    await database.query(
      `
        INSERT INTO "user" (id, name, email, role)
        SELECT
          'mixed-writer-' || ordinal,
          'Mixed Writer ' || ordinal,
          'mixed-writer-' || ordinal || '@example.test',
          CASE WHEN ordinal % 2 = 0 THEN 'admin' ELSE 'user' END::user_role
        FROM generate_series(1, $1::integer) AS writers(ordinal)
      `,
      [leaseCount],
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        SELECT
          'mixed-session-' || ordinal,
          clock_timestamp() + interval '1 hour',
          'mixed-token-' || ordinal,
          clock_timestamp(),
          'mixed-writer-' || ordinal
        FROM generate_series(1, $1::integer) AS sessions(ordinal)
      `,
      [leaseCount],
    )

    let entered = 0
    let administratorEntered = 0
    let publicEntered = 0
    let signalUnexpectedEntry!: () => void
    let releaseOperations!: () => void
    const unexpectedEntry = new Promise<void>((resolve) => {
      signalUnexpectedEntry = resolve
    })
    const released = new Promise<void>((resolve) => {
      releaseOperations = resolve
    })
    const leases = Array.from({ length: leaseCount }, (_, index) => {
      const ordinal = index + 1
      const surface = ordinal % 2 === 0 ? 'administrator' : 'public'
      const identity = {
        userId: `mixed-writer-${ordinal}`,
        sessionId: `mixed-session-${ordinal}`,
      }
      const operation = async () => {
        entered += 1
        if (surface === 'administrator') administratorEntered += 1
        else publicEntered += 1
        if (entered > limit) signalUnexpectedEntry()
        await released
      }
      return surface === 'administrator'
        ? runPostgresAdminWriteLease(identity, operation, mixedDatabase)
        : runPostgresPublicUserWriteLease(identity, operation, mixedDatabase)
    })
    let capacityProbe: Promise<pg.QueryResult<{ readonly available: number }>> | undefined

    try {
      await vi.waitFor(() => expect(entered).toBe(limit))

      // A query made while all admitted leases are holding their outer
      // transactions must still obtain reserved handler capacity. With the
      // previous independent gates, ten leases occupied all ten connections
      // and `unexpectedEntry` won this race before the probe could run.
      capacityProbe = mixedDatabase.query<{ readonly available: number }>('SELECT 1::integer AS available')
      await expect(
        Promise.race([
          capacityProbe.then(() => 'capacity-reserved' as const),
          unexpectedEntry.then(() => 'cross-surface-overadmission' as const),
        ]),
      ).resolves.toBe('capacity-reserved')
      await expect(capacityProbe).resolves.toMatchObject({ rows: [{ available: 1 }] })
      expect(entered).toBe(limit)
      expect(administratorEntered).toBeGreaterThan(0)
      expect(publicEntered).toBeGreaterThan(0)

      releaseOperations()
      await Promise.all(leases)
      expect(entered).toBe(leaseCount)
    } finally {
      releaseOperations()
      await Promise.allSettled(leases)
      await Promise.allSettled([capacityProbe].filter((promise) => promise !== undefined))
      await mixedDatabase.end()
    }
  })

  it('keeps moderation waiters out of capacity reserved for admitted lease handlers', async () => {
    const mixedDatabase = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 2_000,
      statement_timeout: 2_000,
    })
    const limit = getAdminWriteLeaseConcurrencyLimit(mixedDatabase)
    let entered = 0
    let releaseHandlerWork!: () => void
    const handlerWorkReleased = new Promise<void>((resolve) => {
      releaseHandlerWork = resolve
    })
    const outerLeases = Array.from({ length: limit }, (_, index) => {
      const operation = async () => {
        entered += 1
        await handlerWorkReleased
        await mixedDatabase.query('/* identity-permit:test-handler-capacity */ SELECT 1')
      }
      return index % 2 === 0
        ? runPostgresAdminWriteLease(identity, operation, mixedDatabase)
        : runPostgresPublicUserWriteLease(identity, operation, mixedDatabase)
    })
    let moderationTransactions: Array<Promise<void>> = []

    try {
      await vi.waitFor(() => expect(entered).toBe(limit))

      moderationTransactions = Array.from({ length: limit }, () =>
        runRetryableAdminTransaction(mixedDatabase, async (transaction) => {
          await lockPostgresUserIdentitiesForModeration(transaction, [identity.userId])
        }),
      )

      // Exclusive transactions queue at the same permit gate rather than
      // reserving all five remaining PoolClients while their target's outer
      // shared leases are still active.
      expect(mixedDatabase.totalCount).toBe(limit)

      releaseHandlerWork()
      await expect(Promise.all(outerLeases)).resolves.toEqual(Array.from({ length: limit }, () => undefined))
      await expect(Promise.all(moderationTransactions)).resolves.toEqual(Array.from({ length: limit }, () => undefined))
    } finally {
      releaseHandlerWork()
      await Promise.allSettled(outerLeases)
      await Promise.allSettled(moderationTransactions)
      await mixedDatabase.end()
    }
  })
})