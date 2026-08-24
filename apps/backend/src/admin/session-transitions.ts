import type { PoolClient } from 'pg'
import { lockPostgresUserIdentitiesForModeration } from '../user-identity-advisory-lock.js'

export type UserSessionRevocation = {
  readonly userId: string
  readonly revokedSessionCount: number
}

/**
 * Acquires the complete user/session lock set used by revocation and returns
 * the number of sessions that the caller's transition must invalidate.
 */
export const lockUserSessionsForRevocationInTransaction = async (
  transaction: PoolClient,
  userId: string,
): Promise<UserSessionRevocation> => {
  await lockPostgresUserIdentitiesForModeration(transaction, [userId])
  const lockedUser = await transaction.query<{ readonly id: string }>(
    `
      /* admin-session-revocation:lock-user */
      SELECT id
      FROM "user"
      WHERE id = $1
      FOR UPDATE NOWAIT
    `,
    [userId],
  )
  if (lockedUser.rowCount !== 1) return { userId, revokedSessionCount: 0 }

  const lockedSessions = await transaction.query<{ readonly id: string }>(
    `
      /* admin-session-revocation:lock-sessions */
      SELECT id
      FROM session
      WHERE user_id = $1
      ORDER BY id
      FOR UPDATE NOWAIT
    `,
    [userId],
  )

  return {
    userId,
    revokedSessionCount: lockedSessions.rowCount ?? lockedSessions.rows.length,
  }
}

/**
 * Revokes every live and expired Better Auth session plus session-bound
 * administrator proof for one account inside the caller's transaction.
 *
 * The user lock serializes this operation with role/ban changes and with
 * primary-auth proof creation. Password rate-limit rows are deliberately kept.
 */
export const revokeAllUserSessionsInTransaction = async (
  transaction: PoolClient,
  userId: string,
): Promise<UserSessionRevocation> => {
  const locked = await lockUserSessionsForRevocationInTransaction(transaction, userId)
  if (locked.revokedSessionCount === 0) return locked

  await transaction.query(
    `
      WITH deleted_oauth_attempts AS (
        DELETE FROM admin_primary_auth_oauth_attempts
        WHERE user_id = $1
      )
      DELETE FROM admin_primary_auth_windows
      WHERE user_id = $1
    `,
    [userId],
  )

  const deletedSessions = await transaction.query<{ readonly id: string }>(
    `
      DELETE FROM session
      WHERE user_id = $1
      RETURNING id
    `,
    [userId],
  )

  const deletedSessionCount = deletedSessions.rowCount ?? deletedSessions.rows.length
  if (deletedSessionCount !== locked.revokedSessionCount) {
    throw new Error('Locked administrator session count changed during revocation')
  }
  return locked
}