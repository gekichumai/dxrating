import type { PoolClient } from 'pg'

export type UserSessionRevocation = {
  readonly userId: string
  readonly revokedSessionCount: number
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
  const lockedUser = await transaction.query<{ readonly id: string }>(
    `
      /* admin-session-revocation:lock-user */
      SELECT id
      FROM "user"
      WHERE id = $1
      FOR UPDATE
    `,
    [userId],
  )
  if (lockedUser.rowCount !== 1) return { userId, revokedSessionCount: 0 }

  await transaction.query(
    `
      /* admin-session-revocation:lock-sessions */
      SELECT id
      FROM session
      WHERE user_id = $1
      ORDER BY id
      FOR UPDATE
    `,
    [userId],
  )

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

  return { userId, revokedSessionCount: deletedSessions.rowCount ?? deletedSessions.rows.length }
}