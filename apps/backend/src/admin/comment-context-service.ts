import { createHash, timingSafeEqual } from 'node:crypto'
import {
  ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT,
  ADMIN_COMMENT_HISTORY_MAX_LIMIT,
  ADMIN_COMMENT_PREVIEW_MAX_LENGTH,
  ADMIN_COMMENT_THREAD_CURSOR_MAX_LENGTH,
  ADMIN_COMMENT_THREAD_DEFAULT_LIMIT,
  ADMIN_COMMENT_THREAD_MAX_LIMIT,
  ADMIN_DELETED_COMMENT_PREVIEW,
  ADMIN_RECENT_COMMENT_CURSOR_MAX_LENGTH,
  ADMIN_RECENT_COMMENT_DEFAULT_LIMIT,
  ADMIN_RECENT_COMMENT_MAX_LIMIT,
  ADMIN_USER_HISTORY_DEFAULT_LIMIT,
  ADMIN_USER_HISTORY_MAX_LIMIT,
  type AdminContractInputs,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import {
  CommentContextStoreFailure,
  createPostgresCommentContextStore,
  type ActiveCatalogPublication,
  type CommentContextStore,
  type CommentThreadCursor,
  type StoredChartContext,
  type StoredCommentThreadItem,
  type StoredRecentComment,
} from './comment-context-store.js'
import { createPostgresCommentModerationService, type CommentModerationService } from './comment-moderation-service.js'
import { resolveEffectiveRole } from './role-policy.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  createPostgresUserModerationService,
  UserModerationServiceFailure,
  type UserModerationService,
} from './user-moderation-service.js'

const MAXIMUM_SIGNED_BIGINT = 9_223_372_036_854_775_807n
const MAXIMUM_USER_ID_LENGTH = 255
const UTC_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const STABLE_CHART_ID_PATTERN = /^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$/
const STABLE_SONG_ID_PATTERN = /^dsng_[23456789abcdefghjkmnpqrstvwxyz]{10}$/

export type CommentContextServiceFailureCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'CHART_UNAVAILABLE'

export class CommentContextServiceFailure extends Error {
  readonly code: CommentContextServiceFailureCode

  constructor(code: CommentContextServiceFailureCode) {
    super('Administrator comment context request failed')
    this.name = 'CommentContextServiceFailure'
    this.code = code
  }
}

export type ListRecentCommentsInput = AdminContractInputs['listRecentComments']['query']
export type ListRecentCommentsOutput = AdminContractOutputs['listRecentComments']
export type GetCommentContextDetailInput = {
  readonly commentId: string
} & AdminContractInputs['getCommentModerationDetail']['query']
export type CommentContextDetailOutput = AdminContractOutputs['getCommentModerationDetail']

export interface CommentContextService {
  listRecentComments(input: ListRecentCommentsInput): Promise<ListRecentCommentsOutput>
  getCommentModerationDetail(input: GetCommentContextDetailInput): Promise<CommentContextDetailOutput>
}

type FeedCursorPayload = {
  readonly version: 1
  readonly filterDigest: string
  readonly lastCreatedAt: string
  readonly lastCommentId: string
}

type ThreadCursorPayload = {
  readonly version: 1
  readonly selectedCommentId: string
  readonly rootId: string
  readonly highWaterId: string
  readonly lastCommentId: string
}

type NormalizedRecentCommentFilters = ListRecentCommentsOutput['normalizedFilters']
type CommentChartContext = ListRecentCommentsOutput['items'][number]['chart']
type CommentAuthorSummary = ListRecentCommentsOutput['items'][number]['author']

const validationFailure = () => new CommentContextServiceFailure('VALIDATION_FAILED')
const invalidCursorFailure = () => new CommentContextServiceFailure('INVALID_CURSOR')
const notFoundFailure = () => new CommentContextServiceFailure('NOT_FOUND')
const chartUnavailableFailure = () => new CommentContextServiceFailure('CHART_UNAVAILABLE')

const isPositiveDecimalBigint = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9]\d*$/.test(value)) return false
  return BigInt(value) <= MAXIMUM_SIGNED_BIGINT
}

const validateCommentId = (value: unknown): string => {
  if (!isPositiveDecimalBigint(value)) throw validationFailure()
  return value
}

const containsAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 0x1f || codePoint === 0x7f
  })

const validateUserId = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAXIMUM_USER_ID_LENGTH ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value)
  ) {
    throw validationFailure()
  }
  return value
}

const normalizeUtcInstant = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw validationFailure()
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime())) throw validationFailure()
  return instant.toISOString()
}

const normalizeRecentFilters = (input: ListRecentCommentsInput): NormalizedRecentCommentFilters => {
  const authorUserId = input.authorUserId === undefined ? null : validateUserId(input.authorUserId)
  const chartId = input.chartId ?? null
  if (chartId !== null && !STABLE_CHART_ID_PATTERN.test(chartId)) throw validationFailure()
  const status = input.status ?? null
  if (status !== null && status !== 'active' && status !== 'deleted') throw validationFailure()
  const createdAtFromInclusive =
    input.createdAtFromInclusive === undefined ? null : normalizeUtcInstant(input.createdAtFromInclusive)
  const createdAtBeforeExclusive =
    input.createdAtBeforeExclusive === undefined ? null : normalizeUtcInstant(input.createdAtBeforeExclusive)
  if (
    createdAtFromInclusive !== null &&
    createdAtBeforeExclusive !== null &&
    createdAtFromInclusive >= createdAtBeforeExclusive
  ) {
    throw validationFailure()
  }
  return {
    authorUserId,
    chartId,
    status,
    createdAtFromInclusive,
    createdAtBeforeExclusive,
  }
}

const digestRecentFilters = (filters: NormalizedRecentCommentFilters): string =>
  createHash('sha256').update(JSON.stringify(filters)).digest('hex')

const equalDigests = (left: string, right: string): boolean => {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

const parseOpaqueCursor = (cursor: unknown, maximumLength: number): unknown => {
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > maximumLength ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw invalidCursorFailure()
  }
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursorFailure()
  }
}

const decodeFeedCursor = (
  cursor: string,
  expectedFilterDigest: string,
): { readonly createdAt: string; readonly id: string } => {
  const parsed = parseOpaqueCursor(cursor, ADMIN_RECENT_COMMENT_CURSOR_MAX_LENGTH)
  if (!parsed || typeof parsed !== 'object') throw invalidCursorFailure()
  const candidate = parsed as Partial<FeedCursorPayload>
  if (
    candidate.version !== 1 ||
    typeof candidate.filterDigest !== 'string' ||
    !equalDigests(candidate.filterDigest, expectedFilterDigest) ||
    typeof candidate.lastCreatedAt !== 'string' ||
    !UTC_MICROSECOND_PATTERN.test(candidate.lastCreatedAt) ||
    !isPositiveDecimalBigint(candidate.lastCommentId)
  ) {
    throw invalidCursorFailure()
  }
  return { createdAt: candidate.lastCreatedAt, id: candidate.lastCommentId }
}

const encodeFeedCursor = (item: StoredRecentComment, filterDigest: string): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      filterDigest,
      lastCreatedAt: item.createdAt,
      lastCommentId: item.id,
    } satisfies FeedCursorPayload),
  ).toString('base64url')

const decodeThreadCursor = (cursor: string, selectedCommentId: string): CommentThreadCursor => {
  const parsed = parseOpaqueCursor(cursor, ADMIN_COMMENT_THREAD_CURSOR_MAX_LENGTH)
  if (!parsed || typeof parsed !== 'object') throw invalidCursorFailure()
  const candidate = parsed as Partial<ThreadCursorPayload>
  if (
    candidate.version !== 1 ||
    candidate.selectedCommentId !== selectedCommentId ||
    !isPositiveDecimalBigint(candidate.rootId) ||
    !isPositiveDecimalBigint(candidate.highWaterId) ||
    !isPositiveDecimalBigint(candidate.lastCommentId)
  ) {
    throw invalidCursorFailure()
  }
  return {
    rootId: candidate.rootId,
    highWaterId: candidate.highWaterId,
    lastCommentId: candidate.lastCommentId,
  }
}

const encodeThreadCursor = (
  selectedCommentId: string,
  rootId: string,
  highWaterId: string,
  lastCommentId: string,
): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      selectedCommentId,
      rootId,
      highWaterId,
      lastCommentId,
    } satisfies ThreadCursorPayload),
  ).toString('base64url')

const truncateUtf16 = (
  value: string,
  maximumLength: number,
): { readonly value: string; readonly truncated: boolean } => {
  if (value.length <= maximumLength) return { value, truncated: false }
  let output = ''
  for (const character of value) {
    if (output.length + character.length > maximumLength) break
    output += character
  }
  return { value: output, truncated: true }
}

const normalizeSafeDisplayText = (value: string): string =>
  [...value.normalize('NFKC')]
    .map((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()

const safeDisplayLabel = (value: string | null, fallback: string, maximumLength: number): string => {
  const normalized = normalizeSafeDisplayText(value ?? '') || normalizeSafeDisplayText(fallback) || 'Unavailable'
  return truncateUtf16(normalized, maximumLength).value
}

const validateLegacyChartReference = (chart: StoredChartContext) => {
  if (
    chart.songId.length === 0 ||
    chart.songId.length > 1_024 ||
    chart.sheetType.length === 0 ||
    chart.sheetType.length > 255 ||
    chart.sheetDifficulty.length === 0 ||
    chart.sheetDifficulty.length > 255
  ) {
    throw new Error('Stored comment chart identity exceeds the administrator contract')
  }
  return {
    legacySongId: chart.songId,
    sheetType: chart.sheetType,
    sheetDifficulty: chart.sheetDifficulty,
  }
}

const projectChart = (chart: StoredChartContext): CommentChartContext => {
  const legacyReference = validateLegacyChartReference(chart)
  const songLabel = safeDisplayLabel(chart.songTitle, chart.stableSongId ?? chart.songId, 512)
  const chartLabel = safeDisplayLabel(
    `${chart.sheetDifficulty} (${chart.sheetType})`,
    chart.stableChartId ?? chart.sheetDifficulty,
    512,
  )
  if (chart.availability === 'current' || chart.availability === 'historical') {
    if (
      chart.stableSongId === null ||
      chart.stableChartId === null ||
      !STABLE_SONG_ID_PATTERN.test(chart.stableSongId) ||
      !STABLE_CHART_ID_PATTERN.test(chart.stableChartId)
    ) {
      throw new Error('Stored comment chart context has an invalid stable identity')
    }
    return {
      availability: chart.availability,
      legacyReference,
      songLabel,
      chartLabel,
      songId: chart.stableSongId,
      chartId: chart.stableChartId,
    }
  }
  return {
    availability: 'unresolved',
    legacyReference,
    songLabel,
    chartLabel,
    songId: null,
    chartId: null,
  }
}

const projectPublication = (
  publication: ActiveCatalogPublication | null,
): ListRecentCommentsOutput['activePublication'] => {
  if (publication === null) return null
  if (publication.channel !== 'production-v1') throw new Error('Unexpected active catalog publication channel')
  return {
    channel: 'production-v1',
    catalogRunId: publication.catalogRunId,
    revision: publication.revision,
  }
}

const projectAuthor = (
  author: StoredRecentComment['author'] | StoredCommentThreadItem['author'],
  superAdministrators: SuperAdministratorAllowlist,
): CommentAuthorSummary => ({
  userId: author.userId,
  displayName: safeDisplayLabel(author.displayName, author.userId, 255),
  effectiveRole: resolveEffectiveRole({ id: author.userId, role: author.persistedRole }, superAdministrators),
  isBanned: author.currentlyBanned,
})

const projectThreadState = (
  item: StoredCommentThreadItem,
): CommentContextDetailOutput['thread']['items'][number]['state'] => {
  if (item.state.status === 'deleted') {
    return {
      status: 'deleted',
      stateVersion: item.state.stateVersion,
      actorUserId: item.state.actorUserId,
      moderatedAt: item.state.moderatedAt,
      reason: item.state.reason,
    }
  }
  return {
    status: 'visible',
    stateVersion: item.state.stateVersion,
    actorUserId: item.state.actorUserId,
    moderatedAt: item.state.moderatedAt,
    reason: null,
  }
}

const validateLimit = (value: unknown, defaultValue: number, maximumValue: number): number => {
  const limit = value ?? defaultValue
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > maximumValue) {
    throw validationFailure()
  }
  return limit as number
}

const mapThreadStoreFailure = (error: unknown): never => {
  if (error instanceof CommentContextStoreFailure && error.code === 'INVALID_THREAD_CURSOR') {
    throw invalidCursorFailure()
  }
  throw error
}

const mapAuthorHistoryFailure = (error: unknown, cursorWasSupplied: boolean): never => {
  if (cursorWasSupplied && error instanceof UserModerationServiceFailure && error.code === 'VALIDATION_FAILED') {
    throw invalidCursorFailure()
  }
  throw error
}

export const createCommentContextService = ({
  store,
  commentModeration,
  userModeration,
  superAdministrators,
}: {
  readonly store: CommentContextStore
  readonly commentModeration: CommentModerationService
  readonly userModeration: UserModerationService
  readonly superAdministrators: SuperAdministratorAllowlist
}): CommentContextService => ({
  async listRecentComments(input) {
    const normalizedFilters = normalizeRecentFilters(input)
    const limit = validateLimit(input.limit, ADMIN_RECENT_COMMENT_DEFAULT_LIMIT, ADMIN_RECENT_COMMENT_MAX_LIMIT)
    const filterDigest = digestRecentFilters(normalizedFilters)
    const cursor = input.cursor === undefined ? undefined : decodeFeedCursor(input.cursor, filterDigest)

    let chartFilter: Awaited<ReturnType<CommentContextStore['resolveStableChartFilter']>>
    if (normalizedFilters.chartId !== null) {
      try {
        chartFilter = await store.resolveStableChartFilter(normalizedFilters.chartId)
      } catch (error) {
        if (error instanceof CommentContextStoreFailure && error.code === 'CATALOG_UNAVAILABLE') {
          throw chartUnavailableFailure()
        }
        throw error
      }
      if (!chartFilter) throw chartUnavailableFailure()
    }

    const page = await store.listRecentComments({
      filters: {
        ...(normalizedFilters.authorUserId === null ? {} : { authorUserId: normalizedFilters.authorUserId }),
        ...(chartFilter
          ? {
              chart: {
                storedSongIds: chartFilter.storedSongIds,
                sheetType: chartFilter.sheetType,
                sheetDifficulty: chartFilter.sheetDifficulty,
              },
            }
          : {}),
        ...(normalizedFilters.status === null ? {} : { status: normalizedFilters.status }),
        ...(normalizedFilters.createdAtFromInclusive === null
          ? {}
          : { createdAtFrom: normalizedFilters.createdAtFromInclusive }),
        ...(normalizedFilters.createdAtBeforeExclusive === null
          ? {}
          : { createdAtBefore: normalizedFilters.createdAtBeforeExclusive }),
      },
      cursor,
      limit,
    })
    const lastItem = page.items.at(-1)
    return {
      items: page.items.map((item) => {
        if (item.threadIntegrity !== 'ok' || item.rootId === null) {
          throw new Error('Stored comment thread ancestry is not safe to expose')
        }
        const preview =
          item.status === 'deleted'
            ? { value: ADMIN_DELETED_COMMENT_PREVIEW, truncated: false }
            : truncateUtf16(normalizeSafeDisplayText(item.preview), ADMIN_COMMENT_PREVIEW_MAX_LENGTH)
        return {
          id: item.id,
          parentId: item.parentId,
          rootId: item.rootId,
          createdAt: item.createdAt,
          status: item.status,
          bodyPreview: preview.value,
          bodyPreviewTruncated: item.status === 'deleted' ? false : item.previewTruncated || preview.truncated,
          author: projectAuthor(item.author, superAdministrators),
          chart: projectChart(item.chart),
        }
      }),
      nextCursor: page.hasMore && lastItem ? encodeFeedCursor(lastItem, filterDigest) : null,
      normalizedFilters,
      activePublication: projectPublication(page.activePublication),
    }
  },

  async getCommentModerationDetail(input) {
    const commentId = validateCommentId(input.commentId)
    const threadLimit = validateLimit(
      input.threadLimit,
      ADMIN_COMMENT_THREAD_DEFAULT_LIMIT,
      ADMIN_COMMENT_THREAD_MAX_LIMIT,
    )
    const commentHistoryLimit = validateLimit(
      input.commentHistoryLimit,
      ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT,
      ADMIN_COMMENT_HISTORY_MAX_LIMIT,
    )
    const authorBanHistoryLimit = validateLimit(
      input.authorBanHistoryLimit,
      ADMIN_USER_HISTORY_DEFAULT_LIMIT,
      ADMIN_USER_HISTORY_MAX_LIMIT,
    )
    const threadCursor =
      input.threadCursor === undefined ? undefined : decodeThreadCursor(input.threadCursor, commentId)

    const evidence = await commentModeration.getCommentModerationDetail({
      commentId,
      cursor: input.commentHistoryCursor,
      limit: commentHistoryLimit,
    })

    const threadPromise = store
      .loadCommentThreadSegment({
        commentId,
        cursor: threadCursor,
        limit: threadLimit,
      })
      .catch(mapThreadStoreFailure)
    const authorPromise = userModeration.getUserModerationDetail(evidence.comment.authorUserId)
    const authorBanHistoryPromise = userModeration
      .listBanHistory({
        userId: evidence.comment.authorUserId,
        cursor: input.authorBanHistoryCursor,
        limit: authorBanHistoryLimit,
      })
      .catch((error) => mapAuthorHistoryFailure(error, input.authorBanHistoryCursor !== undefined))
    const chartPromise = store.resolveStoredChartContexts([evidence.comment.chart])
    const [thread, author, authorBanHistory, catalog] = await Promise.all([
      threadPromise,
      authorPromise,
      authorBanHistoryPromise,
      chartPromise,
    ])
    if (!thread) throw notFoundFailure()
    const selectedChart = catalog.contexts.values().next().value as StoredChartContext | undefined
    if (!selectedChart) throw new Error('Stored comment chart context was not resolved')
    const lastThreadItem = thread.items.at(-1)

    return {
      activePublication: projectPublication(catalog.activePublication),
      comment: {
        id: evidence.comment.id,
        parentId: evidence.comment.parentId,
        rootId: thread.rootId,
        authorUserId: evidence.comment.authorUserId,
        chart: projectChart(selectedChart),
        createdAt: evidence.comment.createdAt,
        originalBody: evidence.comment.originalBody,
      },
      state: evidence.state,
      author,
      thread: {
        items: thread.items.map((item) => ({
          id: item.id,
          parentId: item.parentId,
          rootId: item.rootId,
          depth: item.depth,
          createdAt: item.createdAt,
          originalBody: item.originalBody,
          state: projectThreadState(item),
          author: projectAuthor(item.author, superAdministrators),
        })),
        completeness: thread.hasMore ? 'partial' : 'complete',
        nextCursor:
          thread.hasMore && lastThreadItem
            ? encodeThreadCursor(commentId, thread.rootId, thread.highWaterId, lastThreadItem.id)
            : null,
      },
      commentHistory: {
        items: [...evidence.commentHistory.items],
        nextCursor: evidence.commentHistory.nextCursor,
      },
      authorBanHistory,
    }
  },
})

export const createPostgresCommentContextService = ({
  superAdministrators,
  store = createPostgresCommentContextStore(),
  commentModeration = createPostgresCommentModerationService({
    superAdministrators,
  }),
  userModeration = createPostgresUserModerationService({ superAdministrators }),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: CommentContextStore
  readonly commentModeration?: CommentModerationService
  readonly userModeration?: UserModerationService
}): CommentContextService =>
  createCommentContextService({
    store,
    commentModeration,
    userModeration,
    superAdministrators,
  })