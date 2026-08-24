import type { PublicProcedureAccessMode } from '@gekichumai/api-contract'
import type { Pool, PoolClient } from 'pg'
import { loadPostgresUserBanState, type EvaluatedUserBanState } from './admin/user-ban-store.js'
import type { auth } from './auth.js'
import { pool } from './db/index.js'
import {
  acquireIdentityWriteLeasePermit,
  getIdentityWriteLeaseConcurrencyLimit,
} from './identity-write-lease-permit.js'
import { lockPostgresUserIdentitiesForWrite } from './user-identity-advisory-lock.js'

export type PublicAuthenticatedUser = typeof auth.$Infer.Session.user

export type CanonicalPublicSession = {
  readonly user: PublicAuthenticatedUser
  readonly session: {
    readonly id: string
  }
}

export type PublicAccessPolicySessionLoader = (headers: Headers) => Promise<CanonicalPublicSession | null>

export const normalizePublicCanonicalSession = (candidate: unknown): CanonicalPublicSession | null => {
  if (!candidate || candidate instanceof Response || typeof candidate !== 'object') return null
  const authentication = candidate as Partial<CanonicalPublicSession>
  if (
    !authentication.user ||
    typeof authentication.user.id !== 'string' ||
    !authentication.session ||
    typeof authentication.session.id !== 'string'
  ) {
    return null
  }
  return authentication as CanonicalPublicSession
}

export type PublicUserWriteLeaseRunner = <Result>(
  identity: { readonly userId: string; readonly sessionId: string },
  operation: () => Promise<Result>,
) => Promise<Result>

type LockedUserOperation<Result> = (transaction: PoolClient) => Promise<Result>

export const getPublicWriteLeaseConcurrencyLimit = (database: Pool): number =>
  getIdentityWriteLeaseConcurrencyLimit(database)

export class PublicAuthenticationRequired extends Error {
  constructor() {
    super('Public API authentication is required')
    this.name = 'PublicAuthenticationRequired'
  }
}

export class PublicAccountBanned extends Error {
  declare readonly reason: string
  declare readonly expiresAt: Date | null

  constructor(state: EvaluatedUserBanState) {
    if (!state.active || !state.banReason) {
      throw new Error('An active user ban must have a reason')
    }
    super('Public API access denied by active account ban')
    this.name = 'PublicAccountBanned'
    // Keep self-facing details available to the typed response mapper without
    // exposing them to generic Error serialization, logs, or Sentry extras.
    Object.defineProperties(this, {
      reason: { value: state.banReason, enumerable: false },
      expiresAt: { value: state.banExpiresAt, enumerable: false },
    })
  }
}

export class UnclassifiedPublicProcedure extends Error {
  constructor() {
    super('Public API procedure has no access classification')
    this.name = 'UnclassifiedPublicProcedure'
  }
}

const throwWhenBanned = (state: EvaluatedUserBanState): void => {
  if (state.active) throw new PublicAccountBanned(state)
}

const runPostgresLockedUserOperation = async <Result>(
  identity: { readonly userId: string; readonly sessionId?: string },
  operation: LockedUserOperation<Result>,
  database: Pool = pool,
): Promise<Result> => {
  // Handlers currently use the shared Drizzle pool while this transaction
  // holds the serialization lock. Reserve half the pool for that work so a
  // burst of admitted writes cannot occupy every connection and then
  // deadlock waiting for their own handler queries.
  const releasePermit = await acquireIdentityWriteLeasePermit(database)
  let transaction: PoolClient | undefined
  try {
    transaction = await database.connect()
    await transaction.query('BEGIN')

    await lockPostgresUserIdentitiesForWrite(transaction, [identity.userId])

    const existingUser = await transaction.query<{ readonly id: string }>(
      `
        /* public-user-write-lease:check-user */
        SELECT id
        FROM "user"
        WHERE id = $1
      `,
      [identity.userId],
    )
    if (existingUser.rowCount !== 1) throw new PublicAuthenticationRequired()

    // Check the ban projection before the session row. When a moderation
    // transaction wins the race it revokes sessions before committing; the
    // already-proven in-flight request must still receive ACCOUNT_BANNED, not
    // lose the reason behind a generic stale-session response.
    throwWhenBanned(await loadPostgresUserBanState(transaction, identity.userId))

    if (identity.sessionId !== undefined) {
      const liveSession = await transaction.query<{ readonly id: string }>(
        `
          /* public-user-write-lease:lock-live-session */
          SELECT id
          FROM session
          WHERE id = $1
            AND user_id = $2
            AND expires_at > clock_timestamp()
        `,
        [identity.sessionId, identity.userId],
      )
      if (liveSession.rowCount !== 1) throw new PublicAuthenticationRequired()
    }

    const result = await operation(transaction)
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

/**
 * Holds a shared cluster-wide advisory lease for the complete identity write.
 * Ban transitions take the exclusive form of the same lock, so either the
 * write finishes first or the ban commits and this check observes the revoked
 * session and active database-time ban before any write begins.
 */
export const runPostgresPublicUserWriteLease = async <Result>(
  identity: { readonly userId: string; readonly sessionId: string },
  operation: () => Promise<Result>,
  database: Pool = pool,
): Promise<Result> => runPostgresLockedUserOperation(identity, () => operation(), database)

/**
 * Variant for a callback whose one-time server-side OAuth state already proved
 * the subject. It never trusts a browser session and exposes the locked
 * transaction so the final credential mutation commits under the ban check.
 */
export const runPostgresPublicUserWriteLeaseWithoutSession = async <Result>(
  userId: string,
  operation: LockedUserOperation<Result>,
  database: Pool = pool,
): Promise<Result> => runPostgresLockedUserOperation({ userId }, operation, database)

export type PublicAccessPolicyDependencies = {
  readonly loadSession: PublicAccessPolicySessionLoader
  readonly loadBanState: (database: Pool | PoolClient, userId: string) => Promise<EvaluatedUserBanState>
  readonly database: Pool
  readonly runWriteLease: PublicUserWriteLeaseRunner
}

export const createPublicAccessPolicy =
  ({ loadSession, loadBanState, database, runWriteLease }: PublicAccessPolicyDependencies) =>
  async <Result>({
    access,
    headers,
    operation,
  }: {
    readonly access: PublicProcedureAccessMode | 'unclassified'
    readonly headers?: Headers
    readonly operation: (user?: PublicAuthenticatedUser) => Promise<Result>
  }): Promise<Result> => {
    if (access === 'unclassified') throw new UnclassifiedPublicProcedure()
    if (access === 'public_read' || access === 'identity_independent') {
      return operation()
    }

    if (!headers) throw new PublicAuthenticationRequired()
    const authentication = await loadSession(headers)
    if (!authentication) throw new PublicAuthenticationRequired()

    if (access === 'authenticated_read') {
      throwWhenBanned(await loadBanState(database, authentication.user.id))
      return operation(authentication.user)
    }

    return runWriteLease({ userId: authentication.user.id, sessionId: authentication.session.id }, () =>
      operation(authentication.user),
    )
  }