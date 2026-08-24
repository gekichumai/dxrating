import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from './test/setup.js'
import {
  getPublicWriteLeaseConcurrencyLimit,
  PublicAccountBanned,
  runPostgresPublicUserWriteLease,
} from './public-access-policy.js'
import { lockPostgresUserIdentitiesForModeration } from './user-identity-advisory-lock.js'

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

describe('PostgreSQL public user-write lease', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

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
          ('public-writer', 'Public Writer', 'public-writer@example.test', 'user'),
          ('moderator', 'Moderator', 'moderator@example.test', 'admin')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'public-writer-session',
          clock_timestamp() + interval '1 hour',
          'public-writer-token',
          clock_timestamp(),
          'public-writer'
        )
      `,
    )
  })

  it('lets an admitted write finish while a later ban waits on the advisory lease', async () => {
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
         VALUES ('lease-song', 'Lease Alias', 'public-writer')`,
      )
      return 'written'
    })

    const writing = runPostgresPublicUserWriteLease(
      { userId: 'public-writer', sessionId: 'public-writer-session' },
      operation,
      database,
    )
    await entered

    const moderation = await database.connect()
    let banLock: Promise<unknown> | undefined
    try {
      await moderation.query('BEGIN')
      banLock = lockPostgresUserIdentitiesForModeration(moderation, ['public-writer'])
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:exclusive')

      releaseOperation()
      await expect(writing).resolves.toBe('written')
      await banLock
      await moderation.query('COMMIT')
      expect(operation).toHaveBeenCalledOnce()
      await expect(
        database.query(`SELECT name FROM song_aliases WHERE created_by = 'public-writer'`),
      ).resolves.toMatchObject({ rows: [{ name: 'Lease Alias' }] })
    } finally {
      releaseOperation()
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([writing, banLock].filter((promise) => promise !== undefined))
    }
  })

  it('waits behind a winning ban and rejects before invoking the write', async () => {
    const moderation = await database.connect()
    const operation = vi.fn().mockResolvedValue('must-not-run')
    let writing: Promise<unknown> | undefined
    try {
      await moderation.query('BEGIN')
      await moderation.query(`SELECT id FROM "user" WHERE id = 'public-writer' FOR UPDATE`)
      const event = await moderation.query<{ readonly id: string }>(
        `
          INSERT INTO admin_user_ban_history (
            subject_user_id,
            actor_user_id,
            action,
            reason,
            ban_started_at,
            expires_at
          )
          VALUES (
            'public-writer',
            'moderator',
            'ban',
            'Concurrent moderation',
            clock_timestamp(),
            clock_timestamp() + interval '1 hour'
          )
          RETURNING id::text
        `,
      )
      await moderation.query(
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
        [event.rows[0]!.id],
      )
      await moderation.query(`DELETE FROM session WHERE user_id = 'public-writer'`)

      writing = runPostgresPublicUserWriteLease(
        { userId: 'public-writer', sessionId: 'public-writer-session' },
        operation,
        database,
      )
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:shared')

      await moderation.query('COMMIT')
      await expect(writing).rejects.toBeInstanceOf(PublicAccountBanned)
      await expect(writing).rejects.toMatchObject({ reason: 'Concurrent moderation' })
      expect(operation).not.toHaveBeenCalled()
    } finally {
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([writing].filter((promise) => promise !== undefined))
    }
  })

  it('gives queued moderation priority over later leases for the same user', async () => {
    let enterFirstWrite!: () => void
    let releaseFirstWrite!: () => void
    const firstWriteEntered = new Promise<void>((resolve) => {
      enterFirstWrite = resolve
    })
    const firstWriteReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve
    })
    const firstWrite = runPostgresPublicUserWriteLease(
      { userId: 'public-writer', sessionId: 'public-writer-session' },
      async () => {
        enterFirstWrite()
        await firstWriteReleased
      },
      database,
    )
    await firstWriteEntered

    const moderation = await database.connect()
    const laterOperation = vi.fn().mockResolvedValue('must-not-run')
    let moderationLock: Promise<void> | undefined
    let laterWrite: Promise<unknown> | undefined
    try {
      await moderation.query('BEGIN')
      moderationLock = lockPostgresUserIdentitiesForModeration(moderation, ['public-writer'])
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:exclusive')

      laterWrite = runPostgresPublicUserWriteLease(
        { userId: 'public-writer', sessionId: 'public-writer-session' },
        laterOperation,
        database,
      )
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:shared')

      releaseFirstWrite()
      await expect(firstWrite).resolves.toBeUndefined()
      await moderationLock

      const event = await moderation.query<{ readonly id: string }>(
        `INSERT INTO admin_user_ban_history (
           subject_user_id, actor_user_id, action, reason, ban_started_at
         )
         VALUES ('public-writer', 'moderator', 'ban', 'Priority moderation', clock_timestamp())
         RETURNING id::text`,
      )
      await moderation.query(
        `INSERT INTO admin_user_ban_state (
           subject_user_id, established_action, ban_started_at, ban_expires_at,
           ban_reason, actor_user_id, established_by_event_id
         )
         SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
         FROM admin_user_ban_history
         WHERE id = $1`,
        [event.rows[0]!.id],
      )
      await moderation.query(`DELETE FROM session WHERE user_id = 'public-writer'`)
      await moderation.query('COMMIT')

      await expect(laterWrite).rejects.toMatchObject({
        name: 'PublicAccountBanned',
        reason: 'Priority moderation',
      })
      expect(laterOperation).not.toHaveBeenCalled()
    } finally {
      releaseFirstWrite()
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([firstWrite, moderationLock, laterWrite].filter((promise) => promise !== undefined))
    }
  })

  it('lets inner guarded DML finish after moderation queues behind the outer lease', async () => {
    let enterOperation!: () => void
    let runInnerMutation!: () => void
    const entered = new Promise<void>((resolve) => {
      enterOperation = resolve
    })
    const innerMutationAllowed = new Promise<void>((resolve) => {
      runInnerMutation = resolve
    })
    const inner = await database.connect()
    await inner.query(`SET statement_timeout = '1s'`)

    const writing = runPostgresPublicUserWriteLease(
      { userId: 'public-writer', sessionId: 'public-writer-session' },
      async () => {
        enterOperation()
        await innerMutationAllowed
        await inner.query(`UPDATE "user" SET name = 'Inner guarded mutation' WHERE id = 'public-writer'`)
      },
      database,
    )
    await entered

    const moderation = await database.connect()
    let moderationLock: Promise<void> | undefined
    try {
      await moderation.query('BEGIN')
      moderationLock = lockPostgresUserIdentitiesForModeration(moderation, ['public-writer'])
      await waitForBlockedQuery(database, 'user-identity-advisory-lock:exclusive')

      runInnerMutation()
      await expect(writing).resolves.toBeUndefined()
      await expect(moderationLock).resolves.toBeUndefined()
      await expect(database.query(`SELECT name FROM "user" WHERE id = 'public-writer'`)).resolves.toMatchObject({
        rows: [{ name: 'Inner guarded mutation' }],
      })
    } finally {
      runInnerMutation()
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      inner.release()
      await Promise.allSettled([writing, moderationLock].filter((promise) => promise !== undefined))
    }
  })

  it('does not hold an outer row lock that can cycle with account deletion and handler work', async () => {
    let enterOperation!: () => void
    let releaseOperation!: () => void
    const entered = new Promise<void>((resolve) => {
      enterOperation = resolve
    })
    const released = new Promise<void>((resolve) => {
      releaseOperation = resolve
    })
    const writing = runPostgresPublicUserWriteLease(
      { userId: 'public-writer', sessionId: 'public-writer-session' },
      async () => {
        enterOperation()
        await released
        await database.query(
          `INSERT INTO song_aliases (song_id, name, created_by)
           VALUES ('delete-race-song', 'Delete Race Alias', 'public-writer')`,
        )
      },
      database,
    )
    await entered

    const accountDeletion = await database.connect()
    try {
      await accountDeletion.query('BEGIN')
      await accountDeletion.query(`SET LOCAL statement_timeout = '1s'`)
      await expect(accountDeletion.query(`DELETE FROM "user" WHERE id = 'public-writer'`)).resolves.toMatchObject({
        rowCount: 1,
      })
      await accountDeletion.query('ROLLBACK')

      releaseOperation()
      await expect(writing).resolves.toBeUndefined()
      await expect(
        database.query(`SELECT name FROM song_aliases WHERE song_id = 'delete-race-song'`),
      ).resolves.toMatchObject({ rows: [{ name: 'Delete Race Alias' }] })
    } finally {
      releaseOperation()
      await accountDeletion.query('ROLLBACK').catch(() => undefined)
      accountDeletion.release()
      await Promise.allSettled([writing])
    }
  })

  it('reserves pool capacity for handler queries during bounded external work', async () => {
    const limit = getPublicWriteLeaseConcurrencyLimit(database)
    const leaseCount = limit + 1
    await database.query(
      `
        INSERT INTO "user" (id, name, email, role)
        SELECT
          'bounded-writer-' || ordinal,
          'Bounded Writer ' || ordinal,
          'bounded-writer-' || ordinal || '@example.test',
          'user'
        FROM generate_series(1, $1::integer) AS writers(ordinal)
      `,
      [leaseCount],
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        SELECT
          'bounded-session-' || ordinal,
          clock_timestamp() + interval '1 hour',
          'bounded-token-' || ordinal,
          clock_timestamp(),
          'bounded-writer-' || ordinal
        FROM generate_series(1, $1::integer) AS sessions(ordinal)
      `,
      [leaseCount],
    )

    let entered = 0
    let releaseOperations!: () => void
    const released = new Promise<void>((resolve) => {
      releaseOperations = resolve
    })
    const leases = Array.from({ length: leaseCount }, (_, index) => {
      const ordinal = index + 1
      return runPostgresPublicUserWriteLease(
        { userId: `bounded-writer-${ordinal}`, sessionId: `bounded-session-${ordinal}` },
        async () => {
          entered += 1
          await released
        },
        database,
      )
    })

    try {
      await vi.waitFor(() => expect(entered).toBe(limit))
      await new Promise((resolve) => setImmediate(resolve))
      expect(entered).toBe(limit)

      releaseOperations()
      await Promise.all(leases)
      expect(entered).toBe(leaseCount)
    } finally {
      releaseOperations()
      await Promise.allSettled(leases)
    }
  })
})