import type { Pool, PoolClient } from 'pg'
import { pool } from '../db/index.js'
import {
  acquireIdentityWriteLeasePermit,
  getIdentityWriteLeaseConcurrencyLimit,
} from '../identity-write-lease-permit.js'
import { lockPostgresUserIdentitiesForWrite } from '../user-identity-advisory-lock.js'
import { AdminAuthorizationFailure } from './authorization.js'
import { loadPostgresUserBanState } from './user-ban-store.js'

export type AdminWriteLeaseIdentity = {
  readonly userId: string
  readonly sessionId: string
}

export type AdminWriteLeaseRunner = <Result>(
  identity: AdminWriteLeaseIdentity,
  operation: () => Promise<Result>,
) => Promise<Result>

export const getAdminWriteLeaseConcurrencyLimit = (database: Pool): number =>
  getIdentityWriteLeaseConcurrencyLimit(database)

/**
 * Holds a shared cluster-wide advisory lease on the acting administrator for
 * the entire write. Ban, demotion, and role-change transactions take the
 * exclusive form, so the first advisory lock defines the order.
 *
 * User and session rows are deliberately checked without row locks. Handlers
 * use another pool connection; an outer row lock could make compatible inner
 * work queue behind an account mutation and create an application-level cycle.
 */
export const runPostgresAdminWriteLease = async <Result>(
  identity: AdminWriteLeaseIdentity,
  operation: () => Promise<Result>,
  database: Pool = pool,
): Promise<Result> => {
  const releasePermit = await acquireIdentityWriteLeasePermit(database)
  let transaction: PoolClient | undefined

  try {
    transaction = await database.connect()
    await transaction.query('BEGIN')

    await lockPostgresUserIdentitiesForWrite(transaction, [identity.userId])

    const existingUser = await transaction.query<{ readonly id: string }>(
      `
        /* admin-write-lease:check-user */
        SELECT id
        FROM "user"
        WHERE id = $1
      `,
      [identity.userId],
    )
    if (existingUser.rowCount !== 1) throw new AdminAuthorizationFailure('UNAUTHENTICATED')

    const banState = await loadPostgresUserBanState(transaction, identity.userId)
    if (banState.active) throw new AdminAuthorizationFailure('UNAUTHENTICATED')

    const liveSession = await transaction.query<{ readonly id: string }>(
      `
        /* admin-write-lease:check-live-session */
        SELECT id
        FROM session
        WHERE id = $1
          AND user_id = $2
          AND expires_at > clock_timestamp()
      `,
      [identity.sessionId, identity.userId],
    )
    if (liveSession.rowCount !== 1) throw new AdminAuthorizationFailure('UNAUTHENTICATED')

    const result = await operation()
    await transaction.query('COMMIT')
    return result
  } catch (error) {
    if (transaction) {
      try {
        await transaction.query('ROLLBACK')
      } catch {
        // Preserve the authorization, handler, or commit failure.
      }
    }
    throw error
  } finally {
    transaction?.release()
    releasePermit()
  }
}