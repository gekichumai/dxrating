import type { PoolClient } from 'pg'

// Keep this seed synchronized with 0018_enforce_active_user_bans.sql. A
// 64-bit hash collision only makes the colliding accounts share one lock; it
// cannot let an identity write bypass a moderation transition.
export const USER_IDENTITY_ADVISORY_LOCK_SEED = 31_520_260_824

type AdvisoryLockKeyRow = {
  readonly lock_key: string
}

const lockPostgresUserIdentities = async (
  transaction: PoolClient,
  userIds: readonly string[],
  mode: 'shared' | 'exclusive',
): Promise<void> => {
  const lockFunction = mode === 'shared' ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock'

  // Order and deduplicate the actual signed bigint keys in PostgreSQL. Raw
  // user-ID ordering is not sufficient: database collation can differ from
  // JavaScript ordering, and two IDs can hash to the same advisory key.
  const keys = await transaction.query<AdvisoryLockKeyRow>(
    `
      SELECT DISTINCT
        hashtextextended(requested.user_id, $2::bigint) AS lock_key
      FROM unnest($1::text[]) AS requested(user_id)
      WHERE requested.user_id IS NOT NULL
      ORDER BY lock_key
    `,
    [[...userIds], USER_IDENTITY_ADVISORY_LOCK_SEED],
  )

  // PostgreSQL advisory locks are cluster-visible, so a queued moderation
  // transition also has priority over later writes on another backend.
  for (const { lock_key: lockKey } of keys.rows) {
    await transaction.query(
      `SELECT /* user-identity-advisory-lock:${mode} */
              ${lockFunction}($1::bigint)`,
      [lockKey],
    )
  }
}

/**
 * Request-wide outer lease only. Do not reacquire this shared lock from a
 * nested handler connection: an already-queued exclusive waiter must not sit
 * between two connections that belong to the same logical operation.
 */
export const lockPostgresUserIdentitiesForWrite = (
  transaction: PoolClient,
  userIds: readonly string[],
): Promise<void> => lockPostgresUserIdentities(transaction, userIds, 'shared')

export const lockPostgresUserIdentitiesForModeration = (
  transaction: PoolClient,
  userIds: readonly string[],
): Promise<void> => lockPostgresUserIdentities(transaction, userIds, 'exclusive')