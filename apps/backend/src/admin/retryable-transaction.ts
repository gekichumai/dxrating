import type { Pool, PoolClient } from 'pg'
import { acquireIdentityModerationPermit } from '../identity-write-lease-permit.js'

export const ADMIN_TRANSACTION_MAX_ATTEMPTS = 4
export const ADMIN_TRANSACTION_RETRY_BASE_DELAY_MS = 25
export const ADMIN_TRANSACTION_RETRY_MAX_DELAY_MS = 100

const RETRYABLE_ADMIN_TRANSACTION_CODES = new Set(['40P01', '55P03'])

export const isRetryableAdminTransactionFailure = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  RETRYABLE_ADMIN_TRANSACTION_CODES.has(String(Reflect.get(error, 'code')))

const waitBeforeRetry = async (failedAttempt: number): Promise<void> => {
  const backoff = Math.min(
    ADMIN_TRANSACTION_RETRY_MAX_DELAY_MS,
    ADMIN_TRANSACTION_RETRY_BASE_DELAY_MS * 2 ** (failedAttempt - 1),
  )
  const jitter = Math.floor(Math.random() * ADMIN_TRANSACTION_RETRY_BASE_DELAY_MS)
  await new Promise((resolve) => setTimeout(resolve, backoff + jitter))
}

/**
 * Retries the complete database-only administrator transaction after a
 * deadlock victim or an intentional NOWAIT conflict. Callbacks must keep all
 * effects inside the supplied transaction because a rolled-back attempt can
 * be invoked again.
 */
export const runRetryableAdminTransaction = async <Result>(
  database: Pool,
  operation: (transaction: PoolClient) => Promise<Result>,
): Promise<Result> => {
  // Acquire capacity before a PoolClient. These transactions take exclusive
  // identity advisory locks; without the shared gate they could fill the
  // handler-reserve half of the pool while waiting for admitted outer writes.
  const releasePermit = await acquireIdentityModerationPermit(database)

  try {
    for (let attempt = 1; attempt <= ADMIN_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      const transaction = await database.connect()
      let retry = false
      try {
        await transaction.query('BEGIN')
        const result = await operation(transaction)
        await transaction.query('COMMIT')
        return result
      } catch (error) {
        try {
          await transaction.query('ROLLBACK')
        } catch {
          // Preserve the operation or commit failure.
        }

        retry = attempt < ADMIN_TRANSACTION_MAX_ATTEMPTS && isRetryableAdminTransactionFailure(error)
        if (!retry) throw error
      } finally {
        transaction.release()
      }

      if (retry) await waitBeforeRetry(attempt)
    }

    throw new Error('Administrator transaction retry loop exhausted unexpectedly')
  } finally {
    releasePermit()
  }
}