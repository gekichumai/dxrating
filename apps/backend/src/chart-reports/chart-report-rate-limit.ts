import type { Pool, PoolClient } from 'pg'

/** A user may make five chart-report attempts in an anchored ten-minute window. */
export const CHART_REPORT_SUBMISSION_USER_LIMIT = 5
export const CHART_REPORT_SUBMISSION_USER_WINDOW_SECONDS = 10 * 60

/** The endpoint accepts three hundred attempts in an anchored one-minute window. */
export const CHART_REPORT_SUBMISSION_GLOBAL_LIMIT = 300
export const CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS = 60

/** Expired user buckets are removed opportunistically without an unbounded delete. */
export const CHART_REPORT_RATE_LIMIT_CLEANUP_BATCH_SIZE = 100

const GLOBAL_SINGLETON_KEY = 1

export type ChartReportSubmissionRateLimitResult =
  | {
      readonly allowed: true
      readonly retryAfterSeconds: 0
    }
  | {
      readonly allowed: false
      /** Stable, positive, whole seconds suitable for an HTTP Retry-After header. */
      readonly retryAfterSeconds: number
    }

export class ChartReportRateLimitIdentityUnavailableError extends Error {
  override readonly name = 'ChartReportRateLimitIdentityUnavailableError'

  constructor() {
    super('The authenticated chart-report identity is no longer available')
  }
}

type ConsumedBucket = {
  readonly allowed: boolean
  readonly retry_after_seconds: number
}

const consumeGlobalBucket = async (transaction: PoolClient, databaseNow: Date): Promise<ConsumedBucket> => {
  const result = await transaction.query<ConsumedBucket>(
    `
      /* chart-report-rate-limit:consume-global */
      INSERT INTO chart_report_global_rate_limits (
        singleton_key,
        window_started_at,
        attempt_count,
        expires_at
      ) VALUES (
        $1::smallint,
        $2::timestamptz,
        1,
        $2::timestamptz + make_interval(secs => $3::integer)
      )
      ON CONFLICT (singleton_key) DO UPDATE
      SET
        window_started_at = CASE
          WHEN chart_report_global_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.window_started_at
          ELSE chart_report_global_rate_limits.window_started_at
        END,
        attempt_count = CASE
          WHEN chart_report_global_rate_limits.expires_at <= EXCLUDED.window_started_at THEN 1
          ELSE chart_report_global_rate_limits.attempt_count + 1
        END,
        expires_at = CASE
          WHEN chart_report_global_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.expires_at
          ELSE chart_report_global_rate_limits.expires_at
        END
      RETURNING
        attempt_count <= $4::bigint AS allowed,
        GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (expires_at - $2::timestamptz)))::integer
        ) AS retry_after_seconds
    `,
    [
      GLOBAL_SINGLETON_KEY,
      databaseNow,
      CHART_REPORT_SUBMISSION_GLOBAL_WINDOW_SECONDS,
      CHART_REPORT_SUBMISSION_GLOBAL_LIMIT,
    ],
  )

  const bucket = result.rows[0]
  if (!bucket) throw new Error('Chart-report global rate-limit bucket was not consumed')
  return bucket
}

const consumeUserBucket = async (
  transaction: PoolClient,
  userId: string,
  databaseNow: Date,
): Promise<ConsumedBucket> => {
  const result = await transaction.query<ConsumedBucket>(
    `
      /* chart-report-rate-limit:consume-user */
      INSERT INTO chart_report_user_rate_limits (
        user_id,
        window_started_at,
        attempt_count,
        expires_at
      ) VALUES (
        $1,
        $2::timestamptz,
        1,
        $2::timestamptz + make_interval(secs => $3::integer)
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        window_started_at = CASE
          WHEN chart_report_user_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.window_started_at
          ELSE chart_report_user_rate_limits.window_started_at
        END,
        attempt_count = CASE
          WHEN chart_report_user_rate_limits.expires_at <= EXCLUDED.window_started_at THEN 1
          ELSE chart_report_user_rate_limits.attempt_count + 1
        END,
        expires_at = CASE
          WHEN chart_report_user_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.expires_at
          ELSE chart_report_user_rate_limits.expires_at
        END
      RETURNING
        attempt_count <= $4::bigint AS allowed,
        GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (expires_at - $2::timestamptz)))::integer
        ) AS retry_after_seconds
    `,
    [userId, databaseNow, CHART_REPORT_SUBMISSION_USER_WINDOW_SECONDS, CHART_REPORT_SUBMISSION_USER_LIMIT],
  )

  const bucket = result.rows[0]
  if (!bucket) throw new Error('Chart-report user rate-limit bucket was not consumed')
  return bucket
}

const cleanupExpiredUserBuckets = async (
  transaction: PoolClient,
  databaseNow: Date,
  currentUserId: string,
): Promise<void> => {
  await transaction.query(
    `
      /* chart-report-rate-limit:cleanup-expired-users */
      WITH expired AS (
        SELECT user_id
        FROM chart_report_user_rate_limits
        WHERE expires_at <= $1::timestamptz
          AND user_id <> $2
        ORDER BY expires_at, user_id
        LIMIT $3::integer
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM chart_report_user_rate_limits AS rate_limit
      USING expired
      WHERE rate_limit.user_id = expired.user_id
    `,
    [databaseNow, currentUserId, CHART_REPORT_RATE_LIMIT_CLEANUP_BATCH_SIZE],
  )
}

const safelyRollback = async (transaction: PoolClient): Promise<void> => {
  try {
    await transaction.query('ROLLBACK')
  } catch {
    // Keep the error that caused the transaction to fail.
  }
}

const isDeletedUserForeignKeyError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { readonly code?: unknown; readonly constraint?: unknown }
  return candidate.code === '23503' && candidate.constraint === 'chart_report_user_rate_limits_user_id_user_id_fk'
}

/**
 * Atomically consumes both chart-report submission buckets.
 *
 * Call this once immediately after authentication and the transport's coarse
 * payload parsing, but before Turnstile, catalog lookup, or semantic report
 * validation. It deliberately accepts a Pool rather than an outer PoolClient
 * and commits its own transaction, so every structurally valid authenticated
 * attempt remains counted even when later work fails or rolls back. Both
 * buckets are consumed even when either limit has already been exceeded.
 *
 * Lock order is always the global singleton followed by the caller's user
 * bucket. The global row serializes this low-volume endpoint and prevents
 * opposite per-user/global lock orders from forming a deadlock cycle.
 */
export const consumeChartReportSubmissionRateLimit = async (
  database: Pool,
  userId: string,
): Promise<ChartReportSubmissionRateLimitResult> => {
  if (userId.length === 0) throw new ChartReportRateLimitIdentityUnavailableError()

  const transaction = await database.connect()
  try {
    await transaction.query('BEGIN')
    const clock = await transaction.query<{ readonly database_now: Date }>(
      `SELECT transaction_timestamp()::timestamptz(3) AS database_now`,
    )
    const databaseNow = clock.rows[0]?.database_now
    if (!databaseNow) throw new Error('Chart-report rate limiter could not read the database clock')

    // Do not reverse this order. The global row is the first limiter lock.
    const globalBucket = await consumeGlobalBucket(transaction, databaseNow)
    const userBucket = await consumeUserBucket(transaction, userId, databaseNow)

    // Cleanup runs only after both ordered bucket locks have been acquired.
    await cleanupExpiredUserBuckets(transaction, databaseNow, userId)
    await transaction.query('COMMIT')

    if (userBucket.allowed && globalBucket.allowed) return { allowed: true, retryAfterSeconds: 0 }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        ...(userBucket.allowed ? [] : [userBucket.retry_after_seconds]),
        ...(globalBucket.allowed ? [] : [globalBucket.retry_after_seconds]),
      ),
    }
  } catch (error) {
    await safelyRollback(transaction)
    if (isDeletedUserForeignKeyError(error)) throw new ChartReportRateLimitIdentityUnavailableError()
    throw error
  } finally {
    transaction.release()
  }
}

export const createChartReportSubmissionRateLimiter =
  (database: Pool) =>
  (userId: string): Promise<ChartReportSubmissionRateLimitResult> =>
    consumeChartReportSubmissionRateLimit(database, userId)