import type { Pool, PoolClient } from 'pg'
import type { AdminPrimaryAuthProvider } from '@gekichumai/admin-contract'
import { pool } from '../db/index.js'
import {
  ADMIN_PRIMARY_AUTH_PASSWORD_ATTEMPT_LIMIT,
  ADMIN_PRIMARY_AUTH_PASSWORD_RATE_WINDOW_SECONDS,
  type AdminPrimaryAuthIdentity,
  type AdminPrimaryAuthOauthAttempt,
  type AdminPrimaryAuthStore,
  type CreateAdminPrimaryAuthOauthAttempt,
} from './primary-auth.js'

type DateRow = { readonly expires_at: Date }

const querySingleDate = async (
  database: Pick<Pool, 'query'>,
  text: string,
  values: readonly unknown[],
): Promise<Date | null> => {
  const result = await database.query<DateRow>(text, [...values])
  return result.rows[0]?.expires_at ?? null
}

const reservePasswordAttempt = async (database: Pool, userId: string): Promise<boolean> => {
  const client = await database.connect()

  try {
    await client.query('BEGIN')
    const inserted = await client.query<{ readonly user_id: string }>(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_password_rate_limits (
          user_id,
          window_started_at,
          failure_count,
          blocked_until,
          updated_at
        )
        SELECT $1, now, 1, NULL, now
        FROM auth_clock
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id
      `,
      [userId],
    )

    if (inserted.rowCount === 1) {
      await client.query('COMMIT')
      return true
    }

    const current = await client.query<{
      readonly window_started_at: Date
      readonly failure_count: number
      readonly blocked_until: Date | null
      readonly database_now: Date
    }>(
      `
        SELECT
          window_started_at,
          failure_count,
          blocked_until,
          clock_timestamp() AS database_now
        FROM admin_primary_auth_password_rate_limits
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId],
    )
    const row = current.rows[0]
    if (!row) throw new Error('Administrator password rate-limit row disappeared')

    if (row.blocked_until && row.blocked_until.getTime() > row.database_now.getTime()) {
      await client.query('COMMIT')
      return false
    }

    const windowExpired =
      row.database_now.getTime() - row.window_started_at.getTime() >=
      ADMIN_PRIMARY_AUTH_PASSWORD_RATE_WINDOW_SECONDS * 1000

    if (windowExpired) {
      await client.query(
        `
          UPDATE admin_primary_auth_password_rate_limits
          SET
            window_started_at = clock_timestamp(),
            failure_count = 1,
            blocked_until = NULL,
            updated_at = clock_timestamp()
          WHERE user_id = $1
        `,
        [userId],
      )
      await client.query('COMMIT')
      return true
    }

    if (row.failure_count >= ADMIN_PRIMARY_AUTH_PASSWORD_ATTEMPT_LIMIT) {
      await client.query(
        `
          UPDATE admin_primary_auth_password_rate_limits
          SET
            blocked_until = clock_timestamp() + make_interval(secs => $2::integer),
            updated_at = clock_timestamp()
          WHERE user_id = $1
        `,
        [userId, ADMIN_PRIMARY_AUTH_PASSWORD_RATE_WINDOW_SECONDS],
      )
      await client.query('COMMIT')
      return false
    }

    const nextFailureCount = row.failure_count + 1
    await client.query(
      `
        UPDATE admin_primary_auth_password_rate_limits
        SET
          failure_count = $2::integer,
          blocked_until = CASE
            WHEN $2::integer = $3::integer
              THEN clock_timestamp() + make_interval(secs => $4::integer)
            ELSE NULL
          END,
          updated_at = clock_timestamp()
        WHERE user_id = $1
      `,
      [
        userId,
        nextFailureCount,
        ADMIN_PRIMARY_AUTH_PASSWORD_ATTEMPT_LIMIT,
        ADMIN_PRIMARY_AUTH_PASSWORD_RATE_WINDOW_SECONDS,
      ],
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await safelyRollback(client)
    throw error
  } finally {
    client.release()
  }
}

const safelyRollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original database failure.
  }
}

/**
 * Removes every primary-authentication artifact for a user inside the caller's
 * existing PostgreSQL transaction. Role and ban transitions must call this
 * after locking/updating the user and before committing.
 *
 * The lock order matches window completion: user, then sessions. Window
 * completion takes its final exact-account lock after those two locks.
 */
export const invalidateAdminPrimaryAuthForUserInTransaction = async (
  transaction: PoolClient,
  userId: string,
): Promise<void> => {
  const lockedUser = await transaction.query<{ readonly id: string }>(
    `
      /* admin-primary-auth:invalidate-user:lock-user */
      SELECT id
      FROM "user"
      WHERE id = $1
      FOR UPDATE
    `,
    [userId],
  )
  if (lockedUser.rowCount !== 1) return

  await transaction.query(
    `
      /* admin-primary-auth:invalidate-user:lock-sessions */
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
      WITH deleted_attempts AS (
        DELETE FROM admin_primary_auth_oauth_attempts WHERE user_id = $1
      )
      DELETE FROM admin_primary_auth_windows WHERE user_id = $1
    `,
    [userId],
  )
}

export const createPostgresAdminPrimaryAuthStore = (database: Pool): AdminPrimaryAuthStore => ({
  async getActiveWindow(identity) {
    const expiresAt = await querySingleDate(
      database,
      `
        SELECT auth_window.expires_at
        FROM admin_primary_auth_windows AS auth_window
        INNER JOIN session
          ON session.id = auth_window.session_id
          AND session.user_id = auth_window.user_id
        WHERE
          auth_window.session_id = $1
          AND auth_window.user_id = $2
          AND auth_window.expires_at > clock_timestamp()
          AND session.expires_at > clock_timestamp()
        LIMIT 1
      `,
      [identity.sessionId, identity.userId],
    )
    return expiresAt ? { expiresAt } : null
  },

  async getPasswordCredential(userId) {
    const result = await database.query<{ readonly id: string; readonly password: string }>(
      `
        SELECT id, password
        FROM account
        WHERE user_id = $1 AND provider_id = 'credential' AND password IS NOT NULL
        ORDER BY created_at ASC, id ASC
        LIMIT 2
      `,
      [userId],
    )
    if (result.rows.length !== 1) return null
    return { id: result.rows[0]!.id, passwordHash: result.rows[0]!.password }
  },

  reservePasswordAttempt: (userId) => reservePasswordAttempt(database, userId),

  async clearPasswordAttempts(userId) {
    await database.query('DELETE FROM admin_primary_auth_password_rate_limits WHERE user_id = $1', [userId])
  },

  async findSingleLinkedOauthAccount(userId, provider) {
    const result = await database.query<{ readonly id: string; readonly account_id: string }>(
      `
        SELECT id, account_id
        FROM account
        WHERE user_id = $1 AND provider_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 2
      `,
      [userId, provider],
    )
    if (result.rows.length !== 1) return null
    return { id: result.rows[0]!.id, accountId: result.rows[0]!.account_id }
  },

  async createOauthAttempt(attempt: CreateAdminPrimaryAuthOauthAttempt) {
    const client = await database.connect()

    try {
      await client.query('BEGIN')

      // OAuth initiation uses the same user, session, account lock order as
      // completion. In particular, it must not let the INSERT's session FK
      // lock precede the user lock held by transaction-scoped invalidation.
      const lockedUser = await client.query<{ readonly role: string }>(
        `
          /* admin-primary-auth:create-oauth-attempt:lock-user */
          SELECT role
          FROM "user"
          WHERE id = $1
          FOR UPDATE
        `,
        [attempt.userId],
      )
      const currentRole = lockedUser.rows[0]?.role
      if (currentRole !== 'admin' && !attempt.allowlistedSuperAdministrator) {
        throw new Error('Administrator OAuth challenge could not be created')
      }

      const lockedSession = await client.query<{ readonly id: string }>(
        `
          /* admin-primary-auth:create-oauth-attempt:lock-session */
          SELECT id
          FROM session
          WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp()
          FOR UPDATE
        `,
        [attempt.sessionId, attempt.userId],
      )
      if (lockedSession.rowCount !== 1) throw new Error('Administrator OAuth challenge could not be created')

      const lockedAccount = await client.query<{ readonly id: string }>(
        `
          /* admin-primary-auth:create-oauth-attempt:lock-account */
          SELECT id
          FROM account
          WHERE
            id = $1
            AND user_id = $2
            AND provider_id = $3
            AND account_id = $4
          FOR UPDATE
        `,
        [attempt.accountId, attempt.userId, attempt.provider, attempt.providerAccountId],
      )
      if (lockedAccount.rowCount !== 1) throw new Error('Administrator OAuth challenge could not be created')

      const result = await client.query<{ readonly created_at: Date; readonly expires_at: Date }>(
        `
          WITH auth_clock AS (SELECT clock_timestamp() AS now)
          INSERT INTO admin_primary_auth_oauth_attempts (
            state_digest,
            session_id,
            user_id,
            account_id,
            provider,
            provider_account_id,
            code_verifier,
            nonce,
            redirect_uri,
            created_at,
            expires_at
          )
          SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, now, now + interval '10 minutes'
          FROM auth_clock
          WHERE EXISTS (
            SELECT 1
            FROM session
            WHERE id = $2 AND user_id = $3 AND expires_at > auth_clock.now
          )
          AND EXISTS (
            SELECT 1
            FROM account
            WHERE
              id = $4
              AND user_id = $3
              AND provider_id = $5
              AND account_id = $6
          )
          ON CONFLICT (session_id) DO UPDATE SET
            state_digest = EXCLUDED.state_digest,
            user_id = EXCLUDED.user_id,
            account_id = EXCLUDED.account_id,
            provider = EXCLUDED.provider,
            provider_account_id = EXCLUDED.provider_account_id,
            code_verifier = EXCLUDED.code_verifier,
            nonce = EXCLUDED.nonce,
            redirect_uri = EXCLUDED.redirect_uri,
            created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at
          RETURNING created_at, expires_at
        `,
        [
          attempt.stateDigest,
          attempt.sessionId,
          attempt.userId,
          attempt.accountId,
          attempt.provider,
          attempt.providerAccountId,
          attempt.codeVerifier,
          attempt.nonce,
          attempt.redirectUri,
        ],
      )
      const row = result.rows[0]
      if (!row) throw new Error('Administrator OAuth challenge could not be created')

      await client.query('COMMIT')
      return { createdAt: row.created_at, expiresAt: row.expires_at }
    } catch (error) {
      await safelyRollback(client)
      throw error
    } finally {
      client.release()
    }
  },

  async consumeOauthAttempt({ stateDigest, identity, provider }) {
    const result = await database.query<{
      readonly state_digest: string
      readonly session_id: string
      readonly user_id: string
      readonly account_id: string
      readonly provider: AdminPrimaryAuthProvider
      readonly provider_account_id: string
      readonly code_verifier: string
      readonly nonce: string | null
      readonly redirect_uri: string
      readonly created_at: Date
      readonly expires_at: Date
      readonly consumed_at: Date
    }>(
      `
        DELETE FROM admin_primary_auth_oauth_attempts AS attempt
        USING session
        WHERE
          attempt.state_digest = $1
          AND attempt.session_id = $2
          AND attempt.user_id = $3
          AND attempt.provider = $4
          AND attempt.expires_at > clock_timestamp()
          AND session.id = attempt.session_id
          AND session.user_id = attempt.user_id
          AND session.expires_at > clock_timestamp()
        RETURNING
          attempt.state_digest,
          attempt.session_id,
          attempt.user_id,
          attempt.account_id,
          attempt.provider,
          attempt.provider_account_id,
          attempt.code_verifier,
          attempt.nonce,
          attempt.redirect_uri,
          attempt.created_at,
          attempt.expires_at,
          clock_timestamp() AS consumed_at
      `,
      [stateDigest, identity.sessionId, identity.userId, provider],
    )
    const row = result.rows[0]
    if (!row) return null

    return {
      stateDigest: row.state_digest,
      sessionId: row.session_id,
      userId: row.user_id,
      accountId: row.account_id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      codeVerifier: row.code_verifier,
      nonce: row.nonce,
      redirectUri: row.redirect_uri,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    } satisfies AdminPrimaryAuthOauthAttempt
  },

  async openWindow({ identity, method, passwordCredential, linkedAccount }) {
    if (method === 'password' ? !passwordCredential || linkedAccount : passwordCredential || !linkedAccount) {
      return null
    }

    const client = await database.connect()

    try {
      await client.query('BEGIN')

      // Every completion and role/ban invalidation takes locks in this order:
      // user, session, then the exact credential/provider account. The locks
      // make the final eligibility check linearizable with concurrent changes.
      const lockedUser = await client.query<{ readonly role: string }>(
        `
          /* admin-primary-auth:open-window:lock-user */
          SELECT role
          FROM "user"
          WHERE id = $1
          FOR UPDATE
        `,
        [identity.userId],
      )
      const currentRole = lockedUser.rows[0]?.role
      if (currentRole !== 'admin' && !identity.allowlistedSuperAdministrator) {
        await client.query('ROLLBACK')
        return null
      }

      const lockedSession = await client.query<{ readonly id: string }>(
        `
          /* admin-primary-auth:open-window:lock-session */
          SELECT id
          FROM session
          WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp()
          FOR UPDATE
        `,
        [identity.sessionId, identity.userId],
      )
      if (lockedSession.rowCount !== 1) {
        await client.query('ROLLBACK')
        return null
      }

      let exactAccountStillLinked = false
      if (passwordCredential) {
        const lockedAccounts = await client.query<{
          readonly id: string
          readonly password: string | null
        }>(
          `
            /* admin-primary-auth:open-window:lock-account */
            SELECT id, password
            FROM account
            WHERE user_id = $1 AND provider_id = 'credential'
            ORDER BY created_at ASC, id ASC
            LIMIT 2
            FOR UPDATE
          `,
          [identity.userId],
        )
        const currentCredential = lockedAccounts.rows[0]
        exactAccountStillLinked =
          lockedAccounts.rows.length === 1 &&
          currentCredential !== undefined &&
          currentCredential.id === passwordCredential.id &&
          currentCredential.password === passwordCredential.passwordHash
      } else {
        const lockedAccounts = await client.query<{
          readonly id: string
          readonly account_id: string
        }>(
          `
            /* admin-primary-auth:open-window:lock-account */
            SELECT id, account_id
            FROM account
            WHERE user_id = $1 AND provider_id = $2
            ORDER BY created_at ASC, id ASC
            LIMIT 2
            FOR UPDATE
          `,
          [identity.userId, method],
        )
        const currentLinkedAccount = lockedAccounts.rows[0]
        exactAccountStillLinked =
          lockedAccounts.rows.length === 1 &&
          currentLinkedAccount !== undefined &&
          currentLinkedAccount.id === linkedAccount!.id &&
          currentLinkedAccount.account_id === linkedAccount!.accountId
      }
      if (!exactAccountStillLinked) {
        await client.query('ROLLBACK')
        return null
      }

      const result = await client.query<DateRow>(
        `
          WITH auth_clock AS (SELECT clock_timestamp() AS now)
          INSERT INTO admin_primary_auth_windows (
            session_id,
            user_id,
            method,
            completed_at,
            expires_at
          )
          SELECT $1, $2, $3, now, now + interval '10 minutes'
          FROM auth_clock
          WHERE EXISTS (
            SELECT 1
            FROM session
            WHERE id = $1 AND user_id = $2 AND expires_at > auth_clock.now
          )
          ON CONFLICT (session_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            method = EXCLUDED.method,
            completed_at = EXCLUDED.completed_at,
            expires_at = EXCLUDED.expires_at
          RETURNING expires_at
        `,
        [identity.sessionId, identity.userId, method],
      )
      await client.query('COMMIT')
      const expiresAt = result.rows[0]?.expires_at ?? null
      return expiresAt ? { expiresAt } : null
    } catch (error) {
      await safelyRollback(client)
      throw error
    } finally {
      client.release()
    }
  },

  async invalidateSession(sessionId) {
    const client = await database.connect()

    try {
      await client.query('BEGIN')
      const sessionOwner = await client.query<{ readonly user_id: string }>(
        'SELECT user_id FROM session WHERE id = $1',
        [sessionId],
      )
      const userId = sessionOwner.rows[0]?.user_id
      if (userId) {
        await client.query(
          `
            /* admin-primary-auth:invalidate-session:lock-user */
            SELECT id FROM "user" WHERE id = $1 FOR UPDATE
          `,
          [userId],
        )
        await client.query(
          `
            /* admin-primary-auth:invalidate-session:lock-session */
            SELECT id FROM session WHERE id = $1 AND user_id = $2 FOR UPDATE
          `,
          [sessionId, userId],
        )
      }
      await client.query(
        `
          WITH deleted_attempts AS (
            DELETE FROM admin_primary_auth_oauth_attempts WHERE session_id = $1
          )
          DELETE FROM admin_primary_auth_windows WHERE session_id = $1
        `,
        [sessionId],
      )
      await client.query('COMMIT')
    } catch (error) {
      await safelyRollback(client)
      throw error
    } finally {
      client.release()
    }
  },

  async invalidateUser(userId) {
    const client = await database.connect()

    try {
      await client.query('BEGIN')
      await invalidateAdminPrimaryAuthForUserInTransaction(client, userId)
      await client.query('COMMIT')
    } catch (error) {
      await safelyRollback(client)
      throw error
    } finally {
      client.release()
    }
  },
})

export const postgresAdminPrimaryAuthStore = createPostgresAdminPrimaryAuthStore(pool)

export const hasRecentAdminPrimaryAuth = async (identity: AdminPrimaryAuthIdentity): Promise<boolean> =>
  (await postgresAdminPrimaryAuthStore.getActiveWindow(identity)) !== null