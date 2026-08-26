import type { Pool, PoolClient } from 'pg'
import { pool } from '../db/index.js'
import { acquireIdentityModerationPermit } from '../identity-write-lease-permit.js'
import { lockPostgresUserIdentitiesForModeration } from '../user-identity-advisory-lock.js'
import type {
  AdminMutationAuthorizationTransaction,
  LockedAdminAuthorizationSession,
  LockedAdminAuthorizationUser,
} from './authorization.js'

export const createPostgresAdminMutationAuthorizationTransaction = (
  transaction: PoolClient,
): AdminMutationAuthorizationTransaction => ({
  async lockUsersByIdForUpdate(orderedUserIds) {
    await lockPostgresUserIdentitiesForModeration(transaction, orderedUserIds)
    const result = await transaction.query<{
      readonly id: string
      readonly role: string
      readonly admin_authorization_not_before: Date
    }>(
      `
        /* admin-mutation-authorization:lock-users */
        SELECT id, role, admin_authorization_not_before
        FROM "user"
        WHERE id = ANY($1::text[])
        ORDER BY id
        FOR UPDATE NOWAIT
      `,
      [[...orderedUserIds]],
    )

    const lockedUsers = new Map<string, LockedAdminAuthorizationUser>()
    for (const row of result.rows) {
      if (row.role !== 'user' && row.role !== 'admin') throw new Error('Invalid locked administrator role')
      lockedUsers.set(row.id, {
        id: row.id,
        role: row.role,
        adminAuthorizationNotBefore: row.admin_authorization_not_before,
      })
    }
    return lockedUsers
  },

  async lockSessionByIdForUpdate({ userId, sessionId }) {
    const result = await transaction.query<{
      readonly id: string
      readonly user_id: string
      readonly admin_authorization_issued_at: Date
    }>(
      `
        /* admin-mutation-authorization:lock-session */
        SELECT id, user_id, admin_authorization_issued_at
        FROM session
        WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp()
        FOR UPDATE NOWAIT
      `,
      [sessionId, userId],
    )
    const row = result.rows[0]
    if (!row) return undefined
    return {
      id: row.id,
      userId: row.user_id,
      authorizationIssuedAt: row.admin_authorization_issued_at,
    } satisfies LockedAdminAuthorizationSession
  },

  async hasRecentPrimaryAuthForUpdate({ userId, sessionId }) {
    const result = await transaction.query(
      `
        /* admin-mutation-authorization:lock-primary-auth */
        SELECT session_id
        FROM admin_primary_auth_windows
        WHERE
          session_id = $1
          AND user_id = $2
          AND expires_at > clock_timestamp()
        FOR UPDATE
      `,
      [sessionId, userId],
    )
    return result.rowCount === 1
  },
})

export const runPostgresAdminMutationAuthorizationTransaction = async <Result>(
  operation: (transaction: AdminMutationAuthorizationTransaction) => Promise<Result>,
  database: Pool = pool,
): Promise<Result> => {
  const releasePermit = await acquireIdentityModerationPermit(database)
  let transaction: PoolClient | undefined
  try {
    transaction = await database.connect()
    await transaction.query('BEGIN')
    const result = await operation(createPostgresAdminMutationAuthorizationTransaction(transaction))
    await transaction.query('COMMIT')
    return result
  } catch (error) {
    if (transaction) {
      try {
        await transaction.query('ROLLBACK')
      } catch {
        // Preserve the authorization, operation, or commit failure.
      }
    }
    throw error
  } finally {
    transaction?.release()
    releasePermit()
  }
}