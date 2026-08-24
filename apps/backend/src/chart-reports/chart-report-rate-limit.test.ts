import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CHART_REPORT_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  CHART_REPORT_SUBMISSION_GLOBAL_LIMIT,
  CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS,
  CHART_REPORT_SUBMISSION_USER_LIMIT,
  CHART_REPORT_SUBMISSION_USER_WINDOW_SECONDS,
  ChartReportRateLimitIdentityUnavailableError,
  consumeChartReportSubmissionRateLimit,
} from './chart-report-rate-limit.js'

const DATABASE_NAME = 'dxrating_chart_report_rate_limit_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Chart-report rate-limit tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const testDatabaseUrl = new URL(configuredDatabaseUrl)
testDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })

const applyStatements = async (client: PoolClient, statements: readonly string[]): Promise<void> => {
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

const insertUsers = async (database: pg.Pool, userIds: readonly string[]): Promise<void> => {
  if (userIds.length === 0) return
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role)
      SELECT user_id, user_id, user_id || '@example.test', 'user'
      FROM unnest($1::text[]) AS users(user_id)
    `,
    [userIds],
  )
}

const withTimeout = async <Result>(operation: Promise<Result>, timeoutMs: number): Promise<Result> => {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Concurrent layered limiter calls did not complete')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

describe('database-backed chart-report submission rate limiter', () => {
  const adminPool = new pg.Pool({ connectionString: adminDatabaseUrl.toString() })
  const database = new pg.Pool({ connectionString: testDatabaseUrl.toString(), max: 30 })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
    const client = await database.connect()
    try {
      for (const migration of migrations) await applyStatements(client, migration.sql)
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await database.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.end()
  })

  beforeEach(async () => {
    await database.query('DELETE FROM chart_report_user_rate_limits')
    await database.query('DELETE FROM chart_report_global_rate_limits')
    await database.query('DELETE FROM "user"')
  })

  it('allows the exact user boundary and commits every concurrent attempt', async () => {
    await insertUsers(database, ['reporter'])

    const decisions = await Promise.all(
      Array.from({ length: CHART_REPORT_SUBMISSION_USER_LIMIT + 1 }, () =>
        consumeChartReportSubmissionRateLimit(database, 'reporter'),
      ),
    )

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(CHART_REPORT_SUBMISSION_USER_LIMIT)
    const denied = decisions.filter((decision) => !decision.allowed)
    expect(denied).toHaveLength(1)
    expect(denied[0]!.retryAfterSeconds).toBeGreaterThan(0)
    expect(Number.isInteger(denied[0]!.retryAfterSeconds)).toBe(true)

    const counters = await database.query<{
      readonly user_attempts: number
      readonly global_attempts: number
    }>(
      `
        SELECT
          (SELECT attempt_count::integer FROM chart_report_user_rate_limits WHERE user_id = 'reporter')
            AS user_attempts,
          (SELECT attempt_count::integer FROM chart_report_global_rate_limits WHERE singleton_key = 1)
            AS global_attempts
      `,
    )
    expect(counters.rows).toEqual([
      {
        user_attempts: CHART_REPORT_SUBMISSION_USER_LIMIT + 1,
        global_attempts: CHART_REPORT_SUBMISSION_USER_LIMIT + 1,
      },
    ])
  })

  it('commits independently from later validation work and keeps counting denials', async () => {
    await insertUsers(database, ['reporter'])
    const outerTransaction = await database.connect()
    try {
      await outerTransaction.query('BEGIN')
      await expect(consumeChartReportSubmissionRateLimit(database, 'reporter')).resolves.toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      })

      // Represents a later Turnstile/catalog/report transaction that fails.
      await outerTransaction.query('ROLLBACK')
    } finally {
      outerTransaction.release()
    }

    for (let attempt = 1; attempt <= CHART_REPORT_SUBMISSION_USER_LIMIT; attempt += 1) {
      await consumeChartReportSubmissionRateLimit(database, 'reporter')
    }

    const persisted = await database.query<{ readonly attempt_count: number }>(
      `SELECT attempt_count::integer FROM chart_report_user_rate_limits WHERE user_id = 'reporter'`,
    )
    expect(persisted.rows).toEqual([{ attempt_count: CHART_REPORT_SUBMISSION_USER_LIMIT + 1 }])
  })

  it('allows exactly the endpoint-global boundary under distinct-user concurrency', async () => {
    const userIds = Array.from(
      { length: CHART_REPORT_SUBMISSION_GLOBAL_LIMIT + 1 },
      (_, index) => `global-reporter-${index}`,
    )
    await insertUsers(database, userIds)

    const decisions = await withTimeout(
      Promise.all(userIds.map((userId) => consumeChartReportSubmissionRateLimit(database, userId))),
      10_000,
    )

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(CHART_REPORT_SUBMISSION_GLOBAL_LIMIT)
    const denied = decisions.filter((decision) => !decision.allowed)
    expect(denied).toHaveLength(1)
    expect(denied[0]!.retryAfterSeconds).toBeGreaterThan(0)
    expect(denied[0]!.retryAfterSeconds).toBeLessThanOrEqual(CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS)

    const counters = await database.query<{
      readonly global_attempts: number
      readonly user_rows: number
      readonly user_attempts: number
    }>(
      `
        SELECT
          (SELECT attempt_count::integer FROM chart_report_global_rate_limits WHERE singleton_key = 1)
            AS global_attempts,
          (SELECT count(*)::integer FROM chart_report_user_rate_limits) AS user_rows,
          (SELECT sum(attempt_count)::integer FROM chart_report_user_rate_limits) AS user_attempts
      `,
    )
    expect(counters.rows).toEqual([
      {
        global_attempts: CHART_REPORT_SUBMISSION_GLOBAL_LIMIT + 1,
        user_rows: CHART_REPORT_SUBMISSION_GLOBAL_LIMIT + 1,
        user_attempts: CHART_REPORT_SUBMISSION_GLOBAL_LIMIT + 1,
      },
    ])
  })

  it('uses the maximum violated-window remainder as one stable retry value', async () => {
    await insertUsers(database, ['reporter'])
    await database.query(
      `
        WITH rate_clock AS (SELECT transaction_timestamp()::timestamptz(3) AS now)
        INSERT INTO chart_report_global_rate_limits (
          singleton_key, window_started_at, attempt_count, expires_at
        )
        SELECT 1, now, $1::bigint, now + interval '20 seconds'
        FROM rate_clock
      `,
      [CHART_REPORT_SUBMISSION_GLOBAL_LIMIT],
    )
    await database.query(
      `
        WITH rate_clock AS (SELECT transaction_timestamp()::timestamptz(3) AS now)
        INSERT INTO chart_report_user_rate_limits (
          user_id, window_started_at, attempt_count, expires_at
        )
        SELECT 'reporter', now, $1::bigint, now + interval '90 seconds'
        FROM rate_clock
      `,
      [CHART_REPORT_SUBMISSION_USER_LIMIT],
    )

    const denied = await consumeChartReportSubmissionRateLimit(database, 'reporter')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(89)
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(90)
    expect(Number.isInteger(denied.retryAfterSeconds)).toBe(true)
  })

  it('resets both anchored fixed windows at the inclusive expiry boundary', async () => {
    await insertUsers(database, ['reporter'])
    const first = await consumeChartReportSubmissionRateLimit(database, 'reporter')
    expect(first).toEqual({ allowed: true, retryAfterSeconds: 0 })

    const original = await database.query<{ readonly global_expiry: Date; readonly user_expiry: Date }>(
      `
        SELECT
          (SELECT expires_at FROM chart_report_global_rate_limits WHERE singleton_key = 1) AS global_expiry,
          (SELECT expires_at FROM chart_report_user_rate_limits WHERE user_id = 'reporter') AS user_expiry
      `,
    )
    await consumeChartReportSubmissionRateLimit(database, 'reporter')
    const unchanged = await database.query<{ readonly global_expiry: Date; readonly user_expiry: Date }>(
      `
        SELECT
          (SELECT expires_at FROM chart_report_global_rate_limits WHERE singleton_key = 1) AS global_expiry,
          (SELECT expires_at FROM chart_report_user_rate_limits WHERE user_id = 'reporter') AS user_expiry
      `,
    )
    expect(unchanged.rows).toEqual(original.rows)

    await database.query(
      `
        WITH rate_clock AS (SELECT transaction_timestamp()::timestamptz(3) AS now)
        UPDATE chart_report_global_rate_limits
        SET
          window_started_at = rate_clock.now - make_interval(secs => $1::integer),
          expires_at = rate_clock.now,
          attempt_count = $2::bigint
        FROM rate_clock
      `,
      [CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS, CHART_REPORT_SUBMISSION_GLOBAL_LIMIT + 1],
    )
    await database.query(
      `
        WITH rate_clock AS (SELECT transaction_timestamp()::timestamptz(3) AS now)
        UPDATE chart_report_user_rate_limits
        SET
          window_started_at = rate_clock.now - make_interval(secs => $1::integer),
          expires_at = rate_clock.now,
          attempt_count = $2::bigint
        FROM rate_clock
        WHERE user_id = 'reporter'
      `,
      [CHART_REPORT_SUBMISSION_USER_WINDOW_SECONDS, CHART_REPORT_SUBMISSION_USER_LIMIT + 1],
    )

    await expect(consumeChartReportSubmissionRateLimit(database, 'reporter')).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    const reset = await database.query<{
      readonly global_attempts: number
      readonly global_window_seconds: number
      readonly user_attempts: number
      readonly user_window_seconds: number
    }>(
      `
        SELECT
          (SELECT attempt_count::integer FROM chart_report_global_rate_limits WHERE singleton_key = 1)
            AS global_attempts,
          (SELECT extract(epoch FROM (expires_at - window_started_at))::integer
             FROM chart_report_global_rate_limits WHERE singleton_key = 1)
            AS global_window_seconds,
          (SELECT attempt_count::integer FROM chart_report_user_rate_limits WHERE user_id = 'reporter')
            AS user_attempts,
          (SELECT extract(epoch FROM (expires_at - window_started_at))::integer
             FROM chart_report_user_rate_limits WHERE user_id = 'reporter')
            AS user_window_seconds
      `,
    )
    expect(reset.rows).toEqual([
      {
        global_attempts: 1,
        global_window_seconds: CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS,
        user_attempts: 1,
        user_window_seconds: CHART_REPORT_SUBMISSION_USER_WINDOW_SECONDS,
      },
    ])
  })

  it('cleans only one bounded expiry batch and preserves active buckets', async () => {
    const expiredUserIds = Array.from(
      { length: CHART_REPORT_RATE_LIMIT_CLEANUP_BATCH_SIZE + 50 },
      (_, index) => `expired-reporter-${index}`,
    )
    await insertUsers(database, ['current-reporter', 'active-peer', ...expiredUserIds])
    await database.query(
      `
        INSERT INTO chart_report_user_rate_limits (
          user_id, window_started_at, attempt_count, expires_at
        )
        SELECT
          user_id,
          transaction_timestamp() - interval '2 hours',
          1,
          transaction_timestamp() - interval '1 hour'
        FROM unnest($1::text[]) AS expired_users(user_id)
      `,
      [expiredUserIds],
    )
    await database.query(
      `
        INSERT INTO chart_report_user_rate_limits (
          user_id, window_started_at, attempt_count, expires_at
        ) VALUES (
          'active-peer',
          transaction_timestamp(),
          1,
          transaction_timestamp() + interval '10 minutes'
        )
      `,
    )

    await consumeChartReportSubmissionRateLimit(database, 'current-reporter')

    const retained = await database.query<{
      readonly active_peer: number
      readonly current_reporter: number
      readonly expired: number
    }>(
      `
        SELECT
          count(*) FILTER (WHERE user_id = 'active-peer')::integer AS active_peer,
          count(*) FILTER (WHERE user_id = 'current-reporter')::integer AS current_reporter,
          count(*) FILTER (WHERE expires_at <= transaction_timestamp())::integer AS expired
        FROM chart_report_user_rate_limits
      `,
    )
    expect(retained.rows).toEqual([{ active_peer: 1, current_reporter: 1, expired: 50 }])
  })

  it('cascades ephemeral identity rows and redacts a concurrently missing identity', async () => {
    await insertUsers(database, ['reporter'])
    await consumeChartReportSubmissionRateLimit(database, 'reporter')
    await database.query(`DELETE FROM "user" WHERE id = 'reporter'`)

    const retained = await database.query<{ readonly count: number }>(
      `SELECT count(*)::integer AS count FROM chart_report_user_rate_limits WHERE user_id = 'reporter'`,
    )
    expect(retained.rows).toEqual([{ count: 0 }])
    await expect(consumeChartReportSubmissionRateLimit(database, 'reporter')).rejects.toBeInstanceOf(
      ChartReportRateLimitIdentityUnavailableError,
    )
  })
})