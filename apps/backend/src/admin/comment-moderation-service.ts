import {
  ADMIN_COMMENT_HISTORY_CURSOR_MAX_LENGTH,
  ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT,
  ADMIN_COMMENT_HISTORY_MAX_LIMIT,
  ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH,
  adminAuthorizationForAction,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import { requireTargetAuthorization, type AdminAuthorizationContext } from './authorization.js'
import {
  CommentModerationStoreFailure,
  createPostgresCommentModerationStore,
  type CommentModerationAction,
  type CommentModerationStore,
  type StoredCommentModerationEvent,
  type StoredCommentModerationHistoryCursor,
  type StoredCommentModerationState,
} from './comment-moderation-store.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

export const COMMENT_MODERATION_HISTORY_DEFAULT_LIMIT = ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT
export const COMMENT_MODERATION_HISTORY_MAX_LIMIT = ADMIN_COMMENT_HISTORY_MAX_LIMIT
export const COMMENT_MODERATION_HISTORY_CURSOR_MAX_LENGTH = ADMIN_COMMENT_HISTORY_CURSOR_MAX_LENGTH
export const COMMENT_MODERATION_REASON_MAX_LENGTH = ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH

const MAXIMUM_SIGNED_BIGINT = 9_223_372_036_854_775_807n
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CommentModerationServiceFailureCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'CONFLICT'

export class CommentModerationServiceFailure extends Error {
  readonly code: CommentModerationServiceFailureCode

  constructor(code: CommentModerationServiceFailureCode) {
    super('Comment moderation request failed')
    this.name = 'CommentModerationServiceFailure'
    this.code = code
  }
}

export type CommentModerationDetail = AdminContractOutputs['getCommentModerationDetail']
export type CommentModerationState = CommentModerationDetail['state']
export type CommentModerationEvent = CommentModerationDetail['history']['items'][number]
export type DeleteCommentOutput = AdminContractOutputs['deleteComment']
export type RestoreCommentOutput = AdminContractOutputs['restoreComment']
export type CommentModerationMutationOutput = DeleteCommentOutput | RestoreCommentOutput

export type GetCommentModerationDetailInput = {
  readonly commentId: string
  readonly cursor?: string
  readonly limit?: number
}

type CommentModerationMutationBase = {
  readonly context: AdminAuthorizationContext
  readonly commentId: string
  readonly expectedStateVersion: string | null
  readonly requestCorrelationId?: string | null
}

export type DeleteCommentInput = CommentModerationMutationBase & {
  readonly reason: string
}

export type RestoreCommentInput = Omit<CommentModerationMutationBase, 'expectedStateVersion'> & {
  readonly expectedStateVersion: string
}

export interface CommentModerationService {
  getCommentModerationDetail(input: GetCommentModerationDetailInput): Promise<CommentModerationDetail>
  deleteComment(input: DeleteCommentInput): Promise<DeleteCommentOutput>
  restoreComment(input: RestoreCommentInput): Promise<RestoreCommentOutput>
}

type CursorPayload = {
  readonly version: 1
  readonly commentId: string
  readonly createdAt: string
  readonly id: string
}

const validationFailure = () => new CommentModerationServiceFailure('VALIDATION_FAILED')
const notFoundFailure = () => new CommentModerationServiceFailure('NOT_FOUND')
const conflictFailure = () => new CommentModerationServiceFailure('CONFLICT')

const isPositiveDecimalBigint = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) return false
  return BigInt(value) <= MAXIMUM_SIGNED_BIGINT
}

const validateDecimalId = (value: unknown): string => {
  if (!isPositiveDecimalBigint(value)) throw validationFailure()
  return value
}

const normalizeRequiredReason = (reason: unknown): string => {
  if (typeof reason !== 'string') throw validationFailure()
  const normalized = reason.trim()
  if (normalized.length === 0 || normalized.length > COMMENT_MODERATION_REASON_MAX_LENGTH) throw validationFailure()
  return normalized
}

const validateCorrelationId = (requestCorrelationId: unknown): string => {
  if (typeof requestCorrelationId !== 'string' || !UUID_PATTERN.test(requestCorrelationId)) throw validationFailure()
  return requestCorrelationId.toLowerCase()
}

const encodeHistoryCursor = (commentId: string, event: StoredCommentModerationEvent): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      commentId,
      createdAt: event.createdAt.toISOString(),
      id: event.id,
    } satisfies CursorPayload),
  ).toString('base64url')

const decodeHistoryCursor = (cursor: string, commentId: string): StoredCommentModerationHistoryCursor => {
  if (
    cursor.length === 0 ||
    cursor.length > COMMENT_MODERATION_HISTORY_CURSOR_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw validationFailure()
  }

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw validationFailure()
  }
  if (!payload || typeof payload !== 'object') throw validationFailure()

  const candidate = payload as Partial<CursorPayload>
  if (
    candidate.version !== 1 ||
    candidate.commentId !== commentId ||
    !isPositiveDecimalBigint(candidate.id) ||
    typeof candidate.createdAt !== 'string'
  ) {
    throw validationFailure()
  }
  const createdAt = new Date(candidate.createdAt)
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== candidate.createdAt) {
    throw validationFailure()
  }
  return { id: candidate.id, createdAt }
}

const projectState = (state: StoredCommentModerationState): CommentModerationState => {
  if (state.establishedAction === null) {
    if (
      state.stateVersion !== null ||
      state.actorUserId !== null ||
      state.moderatedAt !== null ||
      state.deletionReason !== null
    ) {
      throw new Error('Inconsistent initial comment-moderation state')
    }
    return {
      status: 'visible',
      stateVersion: null,
      actorUserId: null,
      moderatedAt: null,
      reason: null,
    }
  }

  if (state.stateVersion === null || state.actorUserId === null || state.moderatedAt === null) {
    throw new Error('Inconsistent established comment-moderation state')
  }
  const base = {
    stateVersion: state.stateVersion,
    actorUserId: state.actorUserId,
    moderatedAt: state.moderatedAt.toISOString(),
  }
  if (state.establishedAction === 'delete') {
    if (state.deletionReason === null) throw new Error('Deleted comment-moderation state has no reason')
    return { status: 'deleted', ...base, reason: state.deletionReason }
  }
  if (state.deletionReason !== null) throw new Error('Visible comment-moderation state retains a deletion reason')
  return { status: 'visible', ...base, reason: null }
}

const projectEvent = (event: StoredCommentModerationEvent): CommentModerationEvent => {
  const base = {
    id: event.id,
    commentId: event.commentId,
    actorUserId: event.actorUserId,
    previousEventId: event.previousEventId,
    createdAt: event.createdAt.toISOString(),
  }
  if (event.action === 'delete') {
    if (event.reason === null) throw new Error('Deleted comment-moderation event has no reason')
    return { ...base, action: 'delete', reason: event.reason }
  }
  if (event.previousEventId === null || event.reason !== null) {
    throw new Error('Inconsistent restored comment-moderation event')
  }
  return {
    ...base,
    previousEventId: event.previousEventId,
    action: 'restore',
    reason: null,
  }
}

const DELETE_POLICY = adminAuthorizationForAction('comment.delete', {
  minimumRole: 'admin',
  targetAction: 'moderate',
})
const RESTORE_POLICY = adminAuthorizationForAction('comment.restore', {
  minimumRole: 'admin',
  targetAction: 'moderate',
})

export const createCommentModerationService = ({
  store,
  superAdministrators,
}: {
  readonly store: CommentModerationStore
  readonly superAdministrators: SuperAdministratorAllowlist
}): CommentModerationService => {
  const runMutation = async ({
    context,
    commentId: rawCommentId,
    expectedStateVersion: rawExpectedStateVersion,
    requestCorrelationId: rawRequestCorrelationId,
    action,
    reason,
  }: CommentModerationMutationBase & {
    readonly action: CommentModerationAction
    readonly reason: string | null
  }): Promise<{
    readonly state: CommentModerationState
    readonly event: CommentModerationEvent
  }> => {
    const commentId = validateDecimalId(rawCommentId)
    const expectedStateVersion = rawExpectedStateVersion === null ? null : validateDecimalId(rawExpectedStateVersion)
    const requestCorrelationId = validateCorrelationId(rawRequestCorrelationId)
    if (action === 'restore' && expectedStateVersion === null) throw validationFailure()

    const preResolvedAuthorUserId = await store.resolveCommentAuthor(commentId)
    if (!preResolvedAuthorUserId) throw notFoundFailure()

    try {
      const applied = await store.runInTransaction(async (transaction) => {
        const authorization = await requireTargetAuthorization({
          context,
          targetUserId: preResolvedAuthorUserId,
          action: 'moderate',
          policy: action === 'delete' ? DELETE_POLICY : RESTORE_POLICY,
          transaction: transaction.authorization,
          superAdministrators,
        })
        const locked = await transaction.lockCommentForModeration(commentId)
        if (!locked) throw notFoundFailure()
        if (locked.comment.authorUserId !== authorization.target.id) throw conflictFailure()

        // CAS comparison deliberately precedes the action/no-op check. A stale
        // client must not mistake a later delete/restore cycle for its own view.
        if (locked.state.stateVersion !== expectedStateVersion) throw conflictFailure()
        if (
          action === 'delete'
            ? locked.state.establishedAction === 'delete'
            : locked.state.establishedAction !== 'delete'
        ) {
          throw conflictFailure()
        }

        const transition = await transaction.applyTransition({
          commentId,
          actorUserId: authorization.actor.id,
          expectedStateVersion,
          action,
          reason,
          requestCorrelationId,
        })
        if (!transition) throw conflictFailure()
        return transition
      })
      return {
        state: projectState(applied.state),
        event: projectEvent(applied.event),
      }
    } catch (error) {
      if (error instanceof CommentModerationStoreFailure && error.code === 'CONFLICT') throw conflictFailure()
      throw error
    }
  }

  return {
    async getCommentModerationDetail({ commentId: rawCommentId, cursor: rawCursor, limit: rawLimit }) {
      const commentId = validateDecimalId(rawCommentId)
      const limit = rawLimit ?? COMMENT_MODERATION_HISTORY_DEFAULT_LIMIT
      if (!Number.isInteger(limit) || limit < 1 || limit > COMMENT_MODERATION_HISTORY_MAX_LIMIT) {
        throw validationFailure()
      }
      const cursor = rawCursor === undefined ? undefined : decodeHistoryCursor(rawCursor, commentId)
      const page = await store.loadCommentDetailPage({
        commentId,
        cursor,
        limit,
      })
      if (!page) throw notFoundFailure()
      const lastItem = page.history.items.at(-1)

      return {
        comment: {
          id: page.detail.comment.id,
          parentId: page.detail.comment.parentId,
          authorUserId: page.detail.comment.authorUserId,
          chart: {
            songId: page.detail.comment.songId,
            sheetType: page.detail.comment.sheetType,
            sheetDifficulty: page.detail.comment.sheetDifficulty,
          },
          createdAt: page.detail.comment.createdAt.toISOString(),
          originalBody: page.detail.comment.originalBody,
        },
        state: projectState(page.detail.state),
        history: {
          items: page.history.items.map(projectEvent),
          nextCursor: page.history.hasMore && lastItem ? encodeHistoryCursor(commentId, lastItem) : null,
        },
      }
    },

    async deleteComment(input) {
      const output = await runMutation({
        ...input,
        action: 'delete',
        reason: normalizeRequiredReason(input.reason),
      })
      if (output.state.status !== 'deleted' || output.event.action !== 'delete') {
        throw new Error('Delete transition returned an inconsistent comment-moderation projection')
      }
      return { state: output.state, event: output.event }
    },

    async restoreComment(input) {
      const output = await runMutation({
        ...input,
        action: 'restore',
        reason: null,
      })
      if (output.state.status !== 'visible' || output.event.action !== 'restore') {
        throw new Error('Restore transition returned an inconsistent comment-moderation projection')
      }
      return { state: output.state, event: output.event }
    },
  }
}

export const createPostgresCommentModerationService = ({
  superAdministrators,
  store = createPostgresCommentModerationStore(),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: CommentModerationStore
}): CommentModerationService => createCommentModerationService({ store, superAdministrators })