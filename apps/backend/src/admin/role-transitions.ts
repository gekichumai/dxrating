import type { PoolClient } from 'pg'
import type { PersistedUserRole } from './role-policy.js'
import { revokeAllUserSessionsInTransaction } from './session-transitions.js'

export type AdministratorRoleTransition = {
  readonly userId: string
  readonly previousRole: PersistedUserRole
  readonly nextRole: PersistedUserRole
  readonly authorizationNotBefore: Date
  readonly revokedSessionCount: number
}

type TransitionRow = {
  readonly id: string
  readonly admin_authorization_not_before: Date
}

// Role-history rows belong to the caller (#313). Returning null for a no-op
// lets that caller avoid duplicate events on retries while composing both
// changes in this same transaction.
export const promoteUserToAdministratorInTransaction = async (
  transaction: PoolClient,
  userId: string,
): Promise<AdministratorRoleTransition | null> => {
  // Take a lock that conflicts with the KEY SHARE lock used by the session
  // foreign key before advancing authority. This establishes an unambiguous
  // commit order: a session either commits before promotion and is made stale,
  // or commits after promotion and is a post-promotion session.
  const candidate = await transaction.query<{ readonly id: string }>(
    `
      /* admin-role-transition:promote:lock-user */
      SELECT id
      FROM "user"
      WHERE id = $1 AND role = 'user'
      FOR UPDATE
    `,
    [userId],
  )
  if (candidate.rowCount !== 1) return null

  const result = await transaction.query<TransitionRow>(
    `
      UPDATE "user"
      SET
        role = 'admin',
        admin_authorization_not_before = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE id = $1 AND role = 'user'
      RETURNING id, admin_authorization_not_before
    `,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return null

  return {
    userId: row.id,
    previousRole: 'user',
    nextRole: 'admin',
    authorizationNotBefore: row.admin_authorization_not_before,
    revokedSessionCount: 0,
  }
}

export const demoteAdministratorToUserInTransaction = async (
  transaction: PoolClient,
  userId: string,
): Promise<AdministratorRoleTransition | null> => {
  const result = await transaction.query<TransitionRow>(
    `
      UPDATE "user"
      SET
        role = 'user',
        admin_authorization_not_before = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE id = $1 AND role = 'admin'
      RETURNING id, admin_authorization_not_before
    `,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return null

  const revocation = await revokeAllUserSessionsInTransaction(transaction, userId)
  return {
    userId: row.id,
    previousRole: 'admin',
    nextRole: 'user',
    authorizationNotBefore: row.admin_authorization_not_before,
    revokedSessionCount: revocation.revokedSessionCount,
  }
}