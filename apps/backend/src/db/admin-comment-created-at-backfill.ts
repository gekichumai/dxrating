import type { Pool, PoolClient } from 'pg'
import {
  hashBackfillDefinition,
  runResumableBackfill,
  type BackfillDefinition,
  type BackfillLogger,
  type BackfillRunResult,
} from './backfill-runner.js'

const POSITIVE_DECIMAL_BIGINT = /^[1-9]\d*$/

type CommentModerationCreatedAtBackfillRow = {
  readonly commentId: string
}

const commentIdCursor = {
  serialize: (cursor: string) => cursor,
  deserialize: (value: unknown) => {
    if (typeof value !== 'string' || !POSITIVE_DECIMAL_BIGINT.test(value)) {
      throw new TypeError('comment moderation backfill cursor must be a positive decimal bigint')
    }
    return value
  },
  compare: (left: string, right: string) => {
    const leftValue = BigInt(left)
    const rightValue = BigInt(right)
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
  },
}

const COMMENT_MODERATION_CREATED_AT_DEFINITION = `
source=public.admin_comment_moderation_state where comment_created_at is null
cursor=comment_id bigint ascending through fixed maximum null-projection comment_id
mutation=set comment_created_at to immutable public.comments.created_at only when still null
version=1
`.trim()

export const ADMIN_COMMENT_CREATED_AT_BACKFILL_ID = 'admin_comment_moderation_created_at_v1'

export const createAdminCommentCreatedAtBackfillDefinition = (): BackfillDefinition<
  CommentModerationCreatedAtBackfillRow,
  string
> => ({
  id: ADMIN_COMMENT_CREATED_AT_BACKFILL_ID,
  definitionHash: hashBackfillDefinition(COMMENT_MODERATION_CREATED_AT_DEFINITION),
  cursor: commentIdCursor,

  async getHighWaterMark(client) {
    const result = await client.query<{ readonly comment_id: string | null }>(
      `SELECT max(comment_id)::text AS comment_id
       FROM admin_comment_moderation_state
       WHERE comment_created_at IS NULL`,
    )
    return result.rows[0]?.comment_id ?? null
  },

  async loadBatch(client, { after, through, limit }) {
    const result = await client.query<{ readonly comment_id: string }>(
      `SELECT comment_id::text
       FROM admin_comment_moderation_state
       WHERE comment_created_at IS NULL
         AND ($1::bigint IS NULL OR comment_id > $1::bigint)
         AND comment_id <= $2::bigint
       ORDER BY comment_id
       LIMIT $3::integer
       FOR UPDATE`,
      [after ?? null, through, limit],
    )
    return result.rows.map((row) => ({ commentId: row.comment_id }))
  },

  getCursor: (row) => row.commentId,

  async applyBatch(client: PoolClient, rows) {
    if (rows.length === 0) return
    const commentIds = rows.map((row) => row.commentId)
    await client.query(
      `UPDATE admin_comment_moderation_state state
       SET comment_created_at = comment.created_at
       FROM comments comment
       WHERE state.comment_id = comment.id
         AND state.comment_id = ANY($1::bigint[])
         AND state.comment_created_at IS NULL`,
      [commentIds],
    )
    const unresolved = await client.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM admin_comment_moderation_state
       WHERE comment_id = ANY($1::bigint[])
         AND comment_created_at IS NULL`,
      [commentIds],
    )
    if (unresolved.rows[0]?.count !== '0') {
      throw new Error('Comment moderation creation-time backfill left a selected row unresolved')
    }
  },
})

export const runAdminCommentCreatedAtBackfill = ({
  pool,
  batchSize,
  maxBatches,
  lockTimeoutMs,
  statementTimeoutMs,
  signal,
  logger,
}: {
  readonly pool: Pool
  readonly batchSize: number
  readonly maxBatches?: number
  readonly lockTimeoutMs?: number
  readonly statementTimeoutMs?: number
  readonly signal?: AbortSignal
  readonly logger?: BackfillLogger
}): Promise<BackfillRunResult<string>> =>
  runResumableBackfill({
    pool,
    definition: createAdminCommentCreatedAtBackfillDefinition(),
    batchSize,
    maxBatches,
    lockTimeoutMs,
    statementTimeoutMs,
    signal,
    logger,
  })