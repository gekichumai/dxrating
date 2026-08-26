import pg, { type Pool, type PoolClient } from 'pg'
import { pool } from '../db/index.js'
import type { AdminMutationAuthorizationTransaction } from './authorization.js'
import { createPostgresAdminMutationAuthorizationTransaction } from './mutation-authorization-store.js'
import { runRetryableAdminTransaction } from './retryable-transaction.js'
import { lockUserSessionsForRevocationInTransaction } from './session-transitions.js'

export type UserBanAction = 'ban' | 'unban'
export type UserBanStatus = 'unbanned' | 'expired' | 'temporarily_banned' | 'permanently_banned'

export type EvaluatedUserBanState = {
  readonly subjectUserId: string
  readonly stateVersion: string | null
  readonly establishedAction: UserBanAction | null
  readonly status: UserBanStatus
  readonly active: boolean
  readonly banStartedAt: Date | null
  readonly banExpiresAt: Date | null
  readonly banReason: string | null
  readonly actorUserId: string | null
  /** PostgreSQL time used for this state evaluation. */
  readonly evaluatedAt: Date
}

export type StoredUserBanHistoryEvent = {
  readonly id: string
  readonly subjectUserId: string
  readonly actorUserId: string
  readonly previousEventId: string | null
  readonly action: UserBanAction
  readonly reason: string | null
  readonly banStartedAt: Date | null
  readonly expiresAt: Date | null
  readonly requestCorrelationId: string | null
  readonly createdAt: Date
}

export type StoredUserBanHistoryCursor = {
  readonly id: string
  readonly createdAt: Date
}

export type StoredUserBanHistoryPage = {
  readonly items: readonly StoredUserBanHistoryEvent[]
  readonly hasMore: boolean
}

export type AppliedUserBanTransition = {
  readonly event: StoredUserBanHistoryEvent
  readonly state: EvaluatedUserBanState
  readonly revokedSessionCount: number
}

type UserBanTransitionInput = {
  readonly subjectUserId: string
  readonly actorUserId: string
  readonly expectedStateVersion: string | null
  readonly action: UserBanAction
  readonly reason: string | null
  readonly banStartedAt: Date | null
  readonly expiresAt: Date | null
  readonly requestCorrelationId: string | null
}

export type UserBanTransaction = {
  readonly authorization: AdminMutationAuthorizationTransaction
  loadCurrentState(subjectUserId: string): Promise<EvaluatedUserBanState>
  /**
   * Advances the state by one immutable event when the expected version still
   * matches. This is the only production ban-state mutation and cannot update
   * the projection without appending its history event.
   */
  applyTransition(input: UserBanTransitionInput): Promise<AppliedUserBanTransition | undefined>
}

export interface UserBanStore {
  loadCurrentState(subjectUserId: string): Promise<EvaluatedUserBanState>
  listHistory(input: {
    readonly subjectUserId: string
    readonly cursor?: StoredUserBanHistoryCursor
    readonly limit: number
  }): Promise<StoredUserBanHistoryPage>
  runInTransaction<Result>(operation: (transaction: UserBanTransaction) => Promise<Result>): Promise<Result>
}

type UserBanStateRow = {
  readonly subject_user_id: string
  readonly established_action: string | null
  readonly ban_started_at: Date | null
  readonly ban_expires_at: Date | null
  readonly ban_reason: string | null
  readonly actor_user_id: string | null
  readonly established_by_event_id: string | null
  readonly evaluated_at: Date
  readonly active: boolean
  readonly status: string
}

type UserBanHistoryRow = {
  readonly id: string
  readonly subject_user_id: string
  readonly actor_user_id: string
  readonly previous_event_id: string | null
  readonly action: string
  readonly reason: string | null
  readonly ban_started_at: Date | null
  readonly expires_at: Date | null
  readonly request_correlation_id: string | null
  readonly created_at: Date
}

const parseAction = (action: string | null): UserBanAction | null => {
  if (action === null || action === 'ban' || action === 'unban') return action
  throw new Error('Invalid stored user-ban action')
}

const parseStatus = (status: string): UserBanStatus => {
  if (['unbanned', 'expired', 'temporarily_banned', 'permanently_banned'].includes(status)) {
    return status as UserBanStatus
  }
  throw new Error('Invalid evaluated user-ban status')
}

const projectState = (row: UserBanStateRow): EvaluatedUserBanState => {
  const establishedAction = parseAction(row.established_action)
  const status = parseStatus(row.status)
  if (
    (row.active && status !== 'temporarily_banned' && status !== 'permanently_banned') ||
    (!row.active && (status === 'temporarily_banned' || status === 'permanently_banned'))
  ) {
    throw new Error('Inconsistent evaluated user-ban state')
  }

  return {
    subjectUserId: row.subject_user_id,
    stateVersion: row.established_by_event_id,
    establishedAction,
    status,
    active: row.active,
    banStartedAt: row.ban_started_at,
    banExpiresAt: row.ban_expires_at,
    banReason: row.ban_reason,
    actorUserId: row.actor_user_id,
    evaluatedAt: row.evaluated_at,
  }
}

const projectHistoryEvent = (row: UserBanHistoryRow): StoredUserBanHistoryEvent => {
  const action = parseAction(row.action)
  if (action === null) throw new Error('Invalid null user-ban history action')
  return {
    id: row.id,
    subjectUserId: row.subject_user_id,
    actorUserId: row.actor_user_id,
    previousEventId: row.previous_event_id,
    action,
    reason: row.reason,
    banStartedAt: row.ban_started_at,
    expiresAt: row.expires_at,
    requestCorrelationId: row.request_correlation_id,
    createdAt: row.created_at,
  }
}

/**
 * The single authoritative PostgreSQL evaluation for current ban state.
 * Expiry is compared with database time, never an application clock. The
 * batch form lets authorization and administrator roster reads share the
 * exact same predicate without issuing one query per account.
 */
export const loadPostgresUserBanStates = async (
  database: Pool | PoolClient,
  subjectUserIds: readonly string[],
): Promise<ReadonlyMap<string, EvaluatedUserBanState>> => {
  if (subjectUserIds.length === 0) return new Map()
  const result = await database.query<UserBanStateRow>(
    `
      /* user-ban-store:evaluate-current-state */
      WITH
        evaluation_clock AS MATERIALIZED (
          SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
        ),
        requested_subjects AS (
          SELECT subject_user_id, ordinal
          FROM unnest($1::text[]) WITH ORDINALITY AS requested(subject_user_id, ordinal)
        )
      SELECT
        requested.subject_user_id,
        state.established_action,
        state.ban_started_at,
        state.ban_expires_at,
        state.ban_reason,
        state.actor_user_id,
        state.established_by_event_id::text,
        evaluation_clock.evaluated_at,
        COALESCE(
          state.established_action = 'ban'
            AND (state.ban_expires_at IS NULL OR state.ban_expires_at > evaluation_clock.evaluated_at),
          FALSE
        ) AS active,
        CASE
          WHEN state.established_action IS DISTINCT FROM 'ban' THEN 'unbanned'
          WHEN state.ban_expires_at IS NOT NULL
            AND state.ban_expires_at <= evaluation_clock.evaluated_at THEN 'expired'
          WHEN state.ban_expires_at IS NULL THEN 'permanently_banned'
          ELSE 'temporarily_banned'
        END AS status
      FROM requested_subjects requested
      CROSS JOIN evaluation_clock
      LEFT JOIN admin_user_ban_state state ON state.subject_user_id = requested.subject_user_id
      ORDER BY requested.ordinal
    `,
    [[...subjectUserIds]],
  )
  return new Map(result.rows.map((row) => [row.subject_user_id, projectState(row)]))
}

export const loadPostgresUserBanState = async (
  database: Pool | PoolClient,
  subjectUserId: string,
): Promise<EvaluatedUserBanState> => {
  const states = await loadPostgresUserBanStates(database, [subjectUserId])
  const state = states.get(subjectUserId)
  if (!state) throw new Error('PostgreSQL did not evaluate the requested user-ban state')
  return state
}

const applyTransition = async (
  transaction: PoolClient,
  input: UserBanTransitionInput,
): Promise<AppliedUserBanTransition | undefined> => {
  // The state trigger performs the atomic deletion so direct/future valid
  // state writers cannot bypass revocation. Prelock here both avoids tuple
  // cycles and preserves the service's useful revoked-session count.
  const revokedSessionCount =
    input.action === 'ban'
      ? (await lockUserSessionsForRevocationInTransaction(transaction, input.subjectUserId)).revokedSessionCount
      : 0

  const inserted = await transaction.query<UserBanHistoryRow>(
    `
      /* user-ban-store:append-event-and-project-state */
      WITH
        version_match AS MATERIALIZED (
          SELECT
            CASE
              WHEN $3::bigint IS NULL THEN NOT EXISTS (
                SELECT 1
                FROM admin_user_ban_state
                WHERE subject_user_id = $1
              )
              ELSE EXISTS (
                SELECT 1
                FROM admin_user_ban_state
                WHERE subject_user_id = $1
                  AND established_by_event_id = $3::bigint
              )
            END AS matches
        ),
        inserted_history AS (
          INSERT INTO admin_user_ban_history (
            subject_user_id,
            actor_user_id,
            previous_event_id,
            action,
            reason,
            ban_started_at,
            expires_at,
            request_correlation_id
          )
          SELECT
            $1,
            $2,
            $3::bigint,
            $4,
            $5,
            CASE
              WHEN $4 = 'ban' THEN COALESCE($6::timestamptz, clock_timestamp()::timestamptz(3))
              ELSE NULL
            END,
            $7::timestamptz,
            $8::uuid
          FROM version_match
          WHERE matches
          RETURNING
            id,
            subject_user_id,
            actor_user_id,
            previous_event_id,
            action,
            reason,
            ban_started_at,
            expires_at,
            request_correlation_id,
            created_at
        ),
        updated_state AS (
          UPDATE admin_user_ban_state state
          SET
            established_action = history.action,
            ban_started_at = history.ban_started_at,
            ban_expires_at = history.expires_at,
            ban_reason = CASE WHEN history.action = 'ban' THEN history.reason ELSE NULL END,
            actor_user_id = history.actor_user_id,
            established_by_event_id = history.id
          FROM inserted_history history
          WHERE
            $3::bigint IS NOT NULL
            AND state.subject_user_id = history.subject_user_id
            AND state.established_by_event_id = $3::bigint
          RETURNING state.established_by_event_id
        ),
        inserted_state AS (
          INSERT INTO admin_user_ban_state (
            subject_user_id,
            established_action,
            ban_started_at,
            ban_expires_at,
            ban_reason,
            actor_user_id,
            established_by_event_id
          )
          SELECT
            subject_user_id,
            action,
            ban_started_at,
            expires_at,
            reason,
            actor_user_id,
            id
          FROM inserted_history
          WHERE $3::bigint IS NULL
          RETURNING established_by_event_id
        ),
        advanced_state AS (
          SELECT established_by_event_id FROM updated_state
          UNION ALL
          SELECT established_by_event_id FROM inserted_state
        )
      SELECT
        history.id::text,
        history.subject_user_id,
        history.actor_user_id,
        history.previous_event_id::text,
        history.action,
        history.reason,
        history.ban_started_at,
        history.expires_at,
        history.request_correlation_id::text,
        history.created_at
      FROM inserted_history history
      INNER JOIN advanced_state state ON state.established_by_event_id = history.id
    `,
    [
      input.subjectUserId,
      input.actorUserId,
      input.expectedStateVersion,
      input.action,
      input.reason,
      input.banStartedAt,
      input.expiresAt,
      input.requestCorrelationId,
    ],
  )
  const row = inserted.rows[0]
  if (!row) return undefined

  const state = await loadPostgresUserBanState(transaction, input.subjectUserId)
  return { event: projectHistoryEvent(row), state, revokedSessionCount }
}

const createTransaction = (transaction: PoolClient): UserBanTransaction => ({
  authorization: createPostgresAdminMutationAuthorizationTransaction(transaction),
  async loadCurrentState(subjectUserId) {
    // A direct state UPDATE owns its tuple before its BEFORE trigger requests
    // the exclusive advisory lock. Yield this retryable application attempt
    // instead of forming a row/advisory cycle.
    await transaction.query(
      `SELECT subject_user_id
       FROM admin_user_ban_state
       WHERE subject_user_id = $1
       FOR UPDATE NOWAIT`,
      [subjectUserId],
    )
    return loadPostgresUserBanState(transaction, subjectUserId)
  },
  applyTransition: (input) => applyTransition(transaction, input),
})

export const createPostgresUserBanStore = (database: Pool = pool): UserBanStore => ({
  loadCurrentState: (subjectUserId) => loadPostgresUserBanState(database, subjectUserId),

  async listHistory({ subjectUserId, cursor, limit }) {
    const parameters: unknown[] = [subjectUserId]
    const cursorPredicate = cursor
      ? (() => {
          parameters.push(cursor.createdAt, cursor.id)
          return 'AND (created_at, id) < ($2::timestamptz, $3::bigint)'
        })()
      : ''
    parameters.push(limit + 1)
    const limitParameter = `$${parameters.length}`
    const result = await database.query<UserBanHistoryRow>(
      `
        SELECT
          id::text,
          subject_user_id,
          actor_user_id,
          previous_event_id::text,
          action,
          reason,
          ban_started_at,
          expires_at,
          request_correlation_id::text,
          created_at
        FROM admin_user_ban_history
        WHERE subject_user_id = $1
        ${cursorPredicate}
        ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
        LIMIT ${limitParameter}
      `,
      parameters,
    )
    return {
      items: result.rows.slice(0, limit).map(projectHistoryEvent),
      hasMore: result.rows.length > limit,
    }
  },

  async runInTransaction(operation) {
    try {
      return await runRetryableAdminTransaction(database, (transaction) => operation(createTransaction(transaction)))
    } catch (error) {
      if (
        error instanceof pg.DatabaseError &&
        error.code === '23514' &&
        error.constraint === 'admin_user_ban_history_expiry_check'
      ) {
        throw new UserBanStoreFailure('INVALID_EXPIRY')
      }
      if (
        error instanceof pg.DatabaseError &&
        error.code === '23514' &&
        ['admin_user_ban_history_active_unban_guard', 'admin_user_ban_history_root_action_guard'].includes(
          error.constraint ?? '',
        )
      ) {
        throw new UserBanStoreFailure('CONFLICT')
      }
      if (
        error instanceof pg.DatabaseError &&
        error.code === '23505' &&
        ['admin_user_ban_history_subject_root_unique', 'admin_user_ban_history_previous_event_id_unique'].includes(
          error.constraint ?? '',
        )
      ) {
        throw new UserBanStoreFailure('CONFLICT')
      }
      throw error
    }
  },
})

export type UserBanStoreFailureCode = 'INVALID_EXPIRY' | 'CONFLICT'

export class UserBanStoreFailure extends Error {
  readonly code: UserBanStoreFailureCode

  constructor(code: UserBanStoreFailureCode) {
    super('User-ban persistence failed')
    this.name = 'UserBanStoreFailure'
    this.code = code
  }
}