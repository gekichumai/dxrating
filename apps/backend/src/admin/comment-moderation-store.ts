import pg, { type Pool, type PoolClient } from 'pg'
import { pool } from '../db/index.js'
import type { AdminMutationAuthorizationTransaction } from './authorization.js'
import { createPostgresAdminMutationAuthorizationTransaction } from './mutation-authorization-store.js'
import { isRetryableAdminTransactionFailure, runRetryableAdminTransaction } from './retryable-transaction.js'

export type CommentModerationAction = 'delete' | 'restore'

export type StoredCommentEvidence = {
  readonly id: string
  readonly parentId: string | null
  readonly authorUserId: string
  readonly songId: string
  readonly sheetType: string
  readonly sheetDifficulty: string
  readonly createdAt: Date
  readonly originalBody: string
}

export type StoredCommentModerationState = {
  readonly commentId: string
  readonly establishedAction: CommentModerationAction | null
  readonly stateVersion: string | null
  readonly actorUserId: string | null
  readonly moderatedAt: Date | null
  readonly deletionReason: string | null
}

export type StoredCommentModerationDetail = {
  readonly comment: StoredCommentEvidence
  readonly state: StoredCommentModerationState
}

export type StoredCommentModerationEvent = {
  readonly id: string
  readonly commentId: string
  readonly actorUserId: string
  readonly previousEventId: string | null
  readonly action: CommentModerationAction
  readonly reason: string | null
  /** Persistence-only request linkage. Never project this into an API response. */
  readonly requestCorrelationId: string
  readonly createdAt: Date
}

export type StoredCommentModerationHistoryCursor = {
  readonly id: string
  readonly createdAt: Date
}

export type StoredCommentModerationHistoryPage = {
  readonly items: readonly StoredCommentModerationEvent[]
  readonly hasMore: boolean
}

export type CommentModerationTransitionInput = {
  readonly commentId: string
  readonly actorUserId: string
  readonly expectedStateVersion: string | null
  readonly action: CommentModerationAction
  readonly reason: string | null
  readonly requestCorrelationId: string
}

export type AppliedCommentModerationTransition = {
  readonly event: StoredCommentModerationEvent
  readonly state: StoredCommentModerationState
}

export type CommentModerationTransaction = {
  readonly authorization: AdminMutationAuthorizationTransaction
  /**
   * Locks the immutable comment row after actor/author authorization locks and
   * returns a state evaluated in the same transaction. A missing state row is
   * the initial visible state.
   */
  lockCommentForModeration(commentId: string): Promise<StoredCommentModerationDetail | undefined>
  /** Appends one event and advances its projection as one atomic CAS operation. */
  applyTransition(input: CommentModerationTransitionInput): Promise<AppliedCommentModerationTransition | undefined>
}

export interface CommentModerationStore {
  /** Pre-resolves the target author; mutations revalidate it under row locks. */
  resolveCommentAuthor(commentId: string): Promise<string | undefined>
  /** Loads evidence, state, and history from one PostgreSQL statement snapshot. */
  loadCommentDetailPage(input: {
    readonly commentId: string
    readonly cursor?: StoredCommentModerationHistoryCursor
    readonly limit: number
  }): Promise<
    | {
        readonly detail: StoredCommentModerationDetail
        readonly history: StoredCommentModerationHistoryPage
      }
    | undefined
  >
  runInTransaction<Result>(operation: (transaction: CommentModerationTransaction) => Promise<Result>): Promise<Result>
}

type CommentDetailRow = {
  readonly comment_id: string
  readonly parent_id: string | null
  readonly author_user_id: string
  readonly song_id: string
  readonly sheet_type: string
  readonly sheet_difficulty: string
  readonly comment_created_at: Date
  readonly original_body: string
  readonly established_action: string | null
  readonly deletion_reason: string | null
  readonly actor_user_id: string | null
  readonly established_by_event_id: string | null
  readonly moderated_at: Date | null
}

type CommentModerationStateRow = {
  readonly comment_id: string
  readonly established_action: string
  readonly deletion_reason: string | null
  readonly actor_user_id: string
  readonly established_by_event_id: string
  readonly moderated_at: Date
}

type CommentModerationHistoryRow = {
  readonly id: string
  readonly comment_id: string
  readonly actor_user_id: string
  readonly previous_event_id: string | null
  readonly action: string
  readonly reason: string | null
  readonly request_correlation_id: string
  readonly created_at: Date
}

type CommentDetailPageRow = CommentDetailRow & {
  readonly history_id: string | null
  readonly history_comment_id: string | null
  readonly history_actor_user_id: string | null
  readonly history_previous_event_id: string | null
  readonly history_action: string | null
  readonly history_reason: string | null
  readonly history_request_correlation_id: string | null
  readonly history_created_at: Date | null
}

const parseAction = (action: string | null): CommentModerationAction | null => {
  if (action === null || action === 'delete' || action === 'restore') return action
  throw new Error('Invalid stored comment-moderation action')
}

const projectState = ({
  commentId,
  action,
  stateVersion,
  actorUserId,
  moderatedAt,
  deletionReason,
}: {
  readonly commentId: string
  readonly action: string | null
  readonly stateVersion: string | null
  readonly actorUserId: string | null
  readonly moderatedAt: Date | null
  readonly deletionReason: string | null
}): StoredCommentModerationState => {
  const establishedAction = parseAction(action)

  if (establishedAction === null) {
    if (stateVersion !== null || actorUserId !== null || moderatedAt !== null || deletionReason !== null) {
      throw new Error('Inconsistent initial comment-moderation state')
    }
  } else if (stateVersion === null || actorUserId === null || moderatedAt === null) {
    throw new Error('Inconsistent established comment-moderation state identity')
  } else if (establishedAction === 'delete') {
    if (deletionReason === null) throw new Error('Deleted comment-moderation state has no reason')
  } else if (deletionReason !== null) {
    throw new Error('Restored comment-moderation state retains a deletion reason')
  }

  return {
    commentId,
    establishedAction,
    stateVersion,
    actorUserId,
    moderatedAt,
    deletionReason,
  }
}

const initialState = (commentId: string): StoredCommentModerationState =>
  projectState({
    commentId,
    action: null,
    stateVersion: null,
    actorUserId: null,
    moderatedAt: null,
    deletionReason: null,
  })

const projectStateRow = (row: CommentModerationStateRow): StoredCommentModerationState =>
  projectState({
    commentId: row.comment_id,
    action: row.established_action,
    stateVersion: row.established_by_event_id,
    actorUserId: row.actor_user_id,
    moderatedAt: row.moderated_at,
    deletionReason: row.deletion_reason,
  })

const projectDetail = (row: CommentDetailRow): StoredCommentModerationDetail => ({
  comment: {
    id: row.comment_id,
    parentId: row.parent_id,
    authorUserId: row.author_user_id,
    songId: row.song_id,
    sheetType: row.sheet_type,
    sheetDifficulty: row.sheet_difficulty,
    createdAt: row.comment_created_at,
    originalBody: row.original_body,
  },
  state: projectState({
    commentId: row.comment_id,
    action: row.established_action,
    stateVersion: row.established_by_event_id,
    actorUserId: row.actor_user_id,
    moderatedAt: row.moderated_at,
    deletionReason: row.deletion_reason,
  }),
})

const projectHistoryEvent = (row: CommentModerationHistoryRow): StoredCommentModerationEvent => {
  const action = parseAction(row.action)
  if (action === null) throw new Error('Invalid null comment-moderation history action')
  if ((action === 'delete') !== (row.reason !== null)) {
    throw new Error('Inconsistent stored comment-moderation history reason')
  }
  if (action === 'restore' && row.previous_event_id === null) {
    throw new Error('A restoration cannot be the first comment-moderation event')
  }
  return {
    id: row.id,
    commentId: row.comment_id,
    actorUserId: row.actor_user_id,
    previousEventId: row.previous_event_id,
    action,
    reason: row.reason,
    requestCorrelationId: row.request_correlation_id,
    createdAt: row.created_at,
  }
}

const commentDetailSelect = `
  comment.id::text AS comment_id,
  comment.parent_id::text AS parent_id,
  comment.created_by AS author_user_id,
  comment.song_id,
  comment.sheet_type,
  comment.sheet_difficulty,
  comment.created_at AS comment_created_at,
  comment.content AS original_body,
  state.established_action,
  state.deletion_reason,
  state.actor_user_id,
  state.established_by_event_id::text,
  state.moderated_at`

const loadPostgresCommentModerationState = async (
  database: Pool | PoolClient,
  commentId: string,
  lockForUpdate = false,
): Promise<StoredCommentModerationState> => {
  const result = await database.query<CommentModerationStateRow>(
    `
      SELECT
        comment_id::text,
        established_action,
        deletion_reason,
        actor_user_id,
        established_by_event_id::text,
        moderated_at
      FROM admin_comment_moderation_state
      WHERE comment_id = $1::bigint
      ${lockForUpdate ? 'FOR UPDATE NOWAIT' : ''}
    `,
    [commentId],
  )
  const row = result.rows[0]
  return row ? projectStateRow(row) : initialState(commentId)
}

const applyTransition = async (
  transaction: PoolClient,
  input: CommentModerationTransitionInput,
): Promise<AppliedCommentModerationTransition | undefined> => {
  const inserted = await transaction.query<CommentModerationHistoryRow>(
    `
      /* comment-moderation-store:append-event-and-project-state */
      WITH
        version_match AS MATERIALIZED (
          SELECT
            CASE
              WHEN $3::bigint IS NULL THEN NOT EXISTS (
                SELECT 1
                FROM admin_comment_moderation_state
                WHERE comment_id = $1::bigint
              )
              ELSE EXISTS (
                SELECT 1
                FROM admin_comment_moderation_state
                WHERE comment_id = $1::bigint
                  AND established_by_event_id = $3::bigint
              )
            END AS matches
        ),
        inserted_history AS (
          INSERT INTO admin_comment_moderation_history (
            comment_id,
            actor_user_id,
            previous_event_id,
            action,
            reason,
            request_correlation_id
          )
          SELECT
            $1::bigint,
            $2,
            $3::bigint,
            $4,
            $5,
            $6::uuid
          FROM version_match
          WHERE matches
          RETURNING
            id,
            comment_id,
            actor_user_id,
            previous_event_id,
            action,
            reason,
            request_correlation_id,
            created_at
        ),
        updated_state AS (
          UPDATE admin_comment_moderation_state state
          SET
            established_action = history.action,
            deletion_reason = CASE WHEN history.action = 'delete' THEN history.reason ELSE NULL END,
            actor_user_id = history.actor_user_id,
            established_by_event_id = history.id,
            moderated_at = history.created_at
          FROM inserted_history history
          WHERE
            $3::bigint IS NOT NULL
            AND state.comment_id = history.comment_id
            AND state.established_by_event_id = $3::bigint
          RETURNING state.established_by_event_id
        ),
        inserted_state AS (
          INSERT INTO admin_comment_moderation_state (
            comment_id,
            established_action,
            deletion_reason,
            actor_user_id,
            established_by_event_id,
            moderated_at
          )
          SELECT
            comment_id,
            action,
            CASE WHEN action = 'delete' THEN reason ELSE NULL END,
            actor_user_id,
            id,
            created_at
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
        history.comment_id::text,
        history.actor_user_id,
        history.previous_event_id::text,
        history.action,
        history.reason,
        history.request_correlation_id::text,
        history.created_at
      FROM inserted_history history
      INNER JOIN advanced_state state ON state.established_by_event_id = history.id
    `,
    [
      input.commentId,
      input.actorUserId,
      input.expectedStateVersion,
      input.action,
      input.reason,
      input.requestCorrelationId,
    ],
  )
  const row = inserted.rows[0]
  if (!row) return undefined
  return {
    event: projectHistoryEvent(row),
    state: await loadPostgresCommentModerationState(transaction, input.commentId),
  }
}

const createTransaction = (transaction: PoolClient): CommentModerationTransaction => ({
  authorization: createPostgresAdminMutationAuthorizationTransaction(transaction),

  async lockCommentForModeration(commentId) {
    const result = await transaction.query<CommentDetailRow>(
      `
        SELECT ${commentDetailSelect}
        FROM comments comment
        LEFT JOIN admin_comment_moderation_state state ON state.comment_id = comment.id
        WHERE comment.id = $1::bigint
        FOR UPDATE OF comment NOWAIT
      `,
      [commentId],
    )
    const row = result.rows[0]
    if (!row) return undefined

    // State rows are independently protected because PostgreSQL cannot lock
    // the nullable side of the LEFT JOIN. The comment lock serializes the
    // initial no-state transition; this lock serializes existing projections.
    const state = await loadPostgresCommentModerationState(transaction, commentId, true)
    return { ...projectDetail(row), state }
  },

  applyTransition: (input) => applyTransition(transaction, input),
})

export const createPostgresCommentModerationStore = (database: Pool = pool): CommentModerationStore => ({
  async resolveCommentAuthor(commentId) {
    const result = await database.query<{ readonly author_user_id: string }>(
      `SELECT created_by AS author_user_id FROM comments WHERE id = $1::bigint`,
      [commentId],
    )
    return result.rows[0]?.author_user_id
  },

  async loadCommentDetailPage({ commentId, cursor, limit }) {
    const parameters: unknown[] = [commentId]
    const cursorPredicate = cursor
      ? (() => {
          parameters.push(cursor.createdAt, cursor.id)
          return 'AND (history.created_at, history.id) < ($2::timestamptz, $3::bigint)'
        })()
      : ''
    parameters.push(limit + 1)
    const limitParameter = `$${parameters.length}`
    const result = await database.query<CommentDetailPageRow>(
      `
        /* comment-moderation-store:consistent-detail-page */
        WITH
          requested_comment AS MATERIALIZED (
            SELECT ${commentDetailSelect}
            FROM comments comment
            LEFT JOIN admin_comment_moderation_state state ON state.comment_id = comment.id
            WHERE comment.id = $1::bigint
          ),
          history_page AS MATERIALIZED (
            SELECT
              history.id::text AS history_id,
              history.comment_id::text AS history_comment_id,
              history.actor_user_id AS history_actor_user_id,
              history.previous_event_id::text AS history_previous_event_id,
              history.action AS history_action,
              history.reason AS history_reason,
              history.request_correlation_id::text AS history_request_correlation_id,
              history.created_at AS history_created_at
            FROM admin_comment_moderation_history history
            WHERE history.comment_id = $1::bigint
              AND EXISTS (SELECT 1 FROM requested_comment)
              ${cursorPredicate}
            ORDER BY history.created_at DESC, history.id DESC
            LIMIT ${limitParameter}
          )
        SELECT requested_comment.*, history_page.*
        FROM requested_comment
        LEFT JOIN history_page ON TRUE
        ORDER BY history_created_at DESC NULLS LAST, history_id::bigint DESC NULLS LAST
      `,
      parameters,
    )
    const firstRow = result.rows[0]
    if (!firstRow) return undefined
    const historyRows = result.rows.flatMap((row): CommentModerationHistoryRow[] => {
      if (row.history_id === null) return []
      if (
        row.history_comment_id === null ||
        row.history_actor_user_id === null ||
        row.history_action === null ||
        row.history_request_correlation_id === null ||
        row.history_created_at === null
      ) {
        throw new Error('Inconsistent nullable comment-moderation history page')
      }
      return [
        {
          id: row.history_id,
          comment_id: row.history_comment_id,
          actor_user_id: row.history_actor_user_id,
          previous_event_id: row.history_previous_event_id,
          action: row.history_action,
          reason: row.history_reason,
          request_correlation_id: row.history_request_correlation_id,
          created_at: row.history_created_at,
        },
      ]
    })
    return {
      detail: projectDetail(firstRow),
      history: {
        items: historyRows.slice(0, limit).map(projectHistoryEvent),
        hasMore: historyRows.length > limit,
      },
    }
  },

  async runInTransaction(operation) {
    try {
      return await runRetryableAdminTransaction(database, (transaction) => operation(createTransaction(transaction)))
    } catch (error) {
      if (
        error instanceof pg.DatabaseError &&
        ((error.code === '23505' &&
          [
            'admin_comment_moderation_history_comment_root_unique',
            'admin_comment_moderation_history_previous_event_id_unique',
          ].includes(error.constraint ?? '')) ||
          (error.code === '23514' &&
            [
              'admin_comment_moderation_history_root_action_guard',
              'admin_comment_moderation_history_state_version_guard',
              'admin_comment_moderation_history_transition_guard',
              'admin_comment_moderation_state_advance_guard',
            ].includes(error.constraint ?? '')))
      ) {
        throw new CommentModerationStoreFailure('CONFLICT')
      }
      if (isRetryableAdminTransactionFailure(error)) throw new CommentModerationStoreFailure('CONFLICT')
      throw error
    }
  },
})

export type CommentModerationStoreFailureCode = 'CONFLICT'

export class CommentModerationStoreFailure extends Error {
  readonly code: CommentModerationStoreFailureCode

  constructor(code: CommentModerationStoreFailureCode) {
    super('Comment-moderation persistence failed')
    this.name = 'CommentModerationStoreFailure'
    this.code = code
  }
}