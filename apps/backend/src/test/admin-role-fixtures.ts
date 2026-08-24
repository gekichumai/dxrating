import type { PoolClient } from 'pg'
import { revokeAllUserSessionsInTransaction } from '../admin/session-transitions.js'

export type AdministratorRoleTransitionFixture = {
  readonly userId: string
  readonly previousRole: 'user' | 'admin'
  readonly nextRole: 'user' | 'admin'
  readonly revokedSessionCount: number
}

/** Test-only setup for integration cases that exercise the state after a grant. */
export const promoteFixtureUserToAdministrator = async (
  transaction: PoolClient,
  userId: string,
): Promise<AdministratorRoleTransitionFixture | undefined> => {
  const result = await transaction.query<{ readonly id: string }>(
    `
      UPDATE "user"
      SET
        role = 'admin',
        admin_authorization_not_before = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE id = $1 AND role = 'user'
      RETURNING id
    `,
    [userId],
  )
  const row = result.rows[0]
  return row ? { userId: row.id, previousRole: 'user', nextRole: 'admin', revokedSessionCount: 0 } : undefined
}

/** Test-only setup for integration cases that exercise the state after a revoke. */
export const demoteFixtureAdministratorToUser = async (
  transaction: PoolClient,
  userId: string,
): Promise<AdministratorRoleTransitionFixture | undefined> => {
  const result = await transaction.query<{ readonly id: string }>(
    `
      UPDATE "user"
      SET
        role = 'user',
        admin_authorization_not_before = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE id = $1 AND role = 'admin'
      RETURNING id
    `,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return undefined
  const revocation = await revokeAllUserSessionsInTransaction(transaction, userId)
  return {
    userId: row.id,
    previousRole: 'admin',
    nextRole: 'user',
    revokedSessionCount: revocation.revokedSessionCount,
  }
}