import type { QueryResultRow } from 'pg'
import { pool } from '../db/index.js'

export const COMMENT_FEED_PREVIEW_MAX_LENGTH = 240 as const
export const COMMENT_FEED_PREVIEW_SOURCE_MAX_LENGTH = 480 as const
export const COMMENT_THREAD_MAX_DEPTH = 10_000 as const
export const COMMENT_CONTEXT_PRODUCTION_CHANNEL = 'production-v1' as const

const UTC_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const POSITIVE_BIGINT_PATTERN = /^[1-9]\d*$/
const PERSISTED_ROLES = new Set(['user', 'admin'])

export type CommentContextDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>
}

export type CommentContextStoreFailureCode = 'CATALOG_UNAVAILABLE' | 'THREAD_INTEGRITY' | 'INVALID_THREAD_CURSOR'

export class CommentContextStoreFailure extends Error {
  readonly code: CommentContextStoreFailureCode

  constructor(code: CommentContextStoreFailureCode, options?: ErrorOptions) {
    super('Administrator comment context could not be loaded', options)
    this.name = 'CommentContextStoreFailure'
    this.code = code
  }
}

export type StoredChartTuple = {
  readonly songId: string
  readonly sheetType: string
  readonly sheetDifficulty: string
}

export type ResolvedStableChartFilter = {
  readonly stableSongId: string
  readonly stableChartId: string
  readonly storedSongIds: readonly string[]
  readonly sheetType: string
  readonly sheetDifficulty: string
}

export type ActiveCatalogPublication = {
  readonly channel: string
  readonly catalogRunId: string
  readonly revision: string
  readonly publishedAt: string
}

export type StoredChartContext = StoredChartTuple & {
  readonly availability: 'current' | 'historical' | 'unresolved' | 'catalog_unavailable'
  readonly stableSongId: string | null
  readonly stableChartId: string | null
  readonly songTitle: string | null
  readonly songArtist: string | null
  readonly songRetiredAt: string | null
  readonly chartRetiredAt: string | null
}

export type RecentCommentStatus = 'active' | 'deleted'

export type RecentCommentLegacyChartFilter = {
  readonly storedSongIds: readonly string[]
  readonly sheetType: string
  readonly sheetDifficulty: string
}

export type RecentCommentFilters = {
  readonly authorUserId?: string
  readonly chart?: RecentCommentLegacyChartFilter
  readonly status?: RecentCommentStatus
  /** Inclusive UTC instant, already normalized by the service. */
  readonly createdAtFrom?: string
  /** Exclusive UTC instant, already normalized by the service. */
  readonly createdAtBefore?: string
}

export type RecentCommentCursor = {
  /** Exact PostgreSQL microsecond representation, never round-tripped through Date. */
  readonly createdAt: string
  readonly id: string
}

export type StoredRecentComment = {
  readonly id: string
  readonly parentId: string | null
  readonly rootId: string | null
  readonly threadIntegrity: 'ok' | 'cycle' | 'depth_limit' | 'missing_root'
  readonly createdAt: string
  readonly status: RecentCommentStatus
  readonly preview: string
  readonly previewTruncated: boolean
  readonly author: {
    readonly userId: string
    readonly displayName: string
    readonly persistedRole: 'user' | 'admin'
    readonly currentlyBanned: boolean
  }
  readonly chart: StoredChartContext
}

export type StoredRecentCommentPage = {
  readonly items: readonly StoredRecentComment[]
  readonly hasMore: boolean
  readonly activePublication: ActiveCatalogPublication | null
}

export type ListRecentCommentsInput = {
  readonly filters: RecentCommentFilters
  readonly cursor?: RecentCommentCursor
  readonly limit: number
}

export type CommentThreadCursor = {
  readonly rootId: string
  readonly highWaterId: string
  readonly lastCommentId: string
}

export type StoredThreadCommentState =
  | {
      readonly status: 'active'
      readonly stateVersion: string | null
      readonly actorUserId: string | null
      readonly moderatedAt: string | null
      readonly reason: null
    }
  | {
      readonly status: 'deleted'
      readonly stateVersion: string
      readonly actorUserId: string
      readonly moderatedAt: string
      readonly reason: string
    }

export type StoredCommentThreadItem = {
  readonly id: string
  readonly parentId: string | null
  readonly rootId: string
  readonly depth: number
  readonly createdAt: string
  readonly originalBody: string
  readonly author: {
    readonly userId: string
    readonly displayName: string
    readonly persistedRole: 'user' | 'admin'
    readonly currentlyBanned: boolean
  }
  readonly chart: StoredChartTuple
  readonly state: StoredThreadCommentState
}

export type StoredCommentThreadSegment = {
  readonly rootId: string
  readonly highWaterId: string
  readonly items: readonly StoredCommentThreadItem[]
  readonly hasMore: boolean
}

export type LoadCommentThreadSegmentInput = {
  readonly commentId: string
  readonly cursor?: CommentThreadCursor
  readonly limit: number
}

export interface CommentContextStore {
  loadExistingUsersById(orderedUserIds: readonly string[]): Promise<readonly { readonly id: string }[]>
  resolveStableChartFilter(stableChartId: string): Promise<ResolvedStableChartFilter | undefined>
  listRecentComments(input: ListRecentCommentsInput): Promise<StoredRecentCommentPage>
  resolveStoredChartContexts(storedCharts: readonly StoredChartTuple[]): Promise<{
    readonly contexts: ReadonlyMap<string, StoredChartContext>
    readonly activePublication: ActiveCatalogPublication | null
  }>
  loadCommentThreadSegment(input: LoadCommentThreadSegmentInput): Promise<StoredCommentThreadSegment | undefined>
}

type StableChartFilterRow = {
  readonly stable_song_id: string
  readonly stable_chart_id: string
  readonly legacy_song_id: string | null
  readonly mapped_song_ids: unknown
  readonly sheet_type: string
  readonly sheet_difficulty: string
}

type RecentCommentRow = {
  readonly comment_id: string
  readonly parent_id: string | null
  readonly root_id: string | null
  readonly ancestry_cycle: boolean
  readonly ancestry_depth_limited: boolean
  readonly created_at_utc: string
  readonly status: string
  readonly preview: string
  readonly preview_truncated: boolean
  readonly author_user_id: string
  readonly display_name: string
  readonly persisted_role: string
  readonly currently_banned: boolean
  readonly song_id: string
  readonly sheet_type: string
  readonly sheet_difficulty: string
}

type ChartContextRow = {
  readonly ordinal: number
  readonly requested_song_id: string
  readonly requested_sheet_type: string
  readonly requested_sheet_difficulty: string
  readonly stable_song_id: string | null
  readonly stable_chart_id: string | null
  readonly song_title: string | null
  readonly song_artist: string | null
  readonly song_retired_at: string | null
  readonly chart_retired_at: string | null
  readonly active_chart_id: string | null
  readonly publication_channel: string | null
  readonly publication_catalog_run_id: string | null
  readonly publication_revision: string | null
  readonly publication_published_at: string | null
}

type ThreadSegmentRow = {
  readonly selected_exists: boolean
  readonly resolved_root_id: string | null
  readonly high_water_id: string | null
  readonly ancestor_cycle: boolean
  readonly ancestor_depth_limited: boolean
  readonly descendant_cycle: boolean
  readonly descendant_depth_limited: boolean
  readonly cursor_valid: boolean
  readonly comment_id: string | null
  readonly parent_id: string | null
  readonly depth: number | null
  readonly created_at_utc: string | null
  readonly original_body: string | null
  readonly author_user_id: string | null
  readonly display_name: string | null
  readonly persisted_role: string | null
  readonly currently_banned: boolean | null
  readonly song_id: string | null
  readonly sheet_type: string | null
  readonly sheet_difficulty: string | null
  readonly established_action: string | null
  readonly state_version: string | null
  readonly state_actor_user_id: string | null
  readonly moderated_at_utc: string | null
  readonly deletion_reason: string | null
}

const exactUtcMicrosecondsSql = (expression: string) => `to_char(${expression}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

const exactUtcTimestamptzMicrosecondsSql = (expression: string) =>
  exactUtcMicrosecondsSql(`timezone('UTC', ${expression})`)

const canonicalDisplayNameSql = `COALESCE(
  CASE WHEN NULLIF(btrim(regexp_replace(normalize(profile.display_name, NFKC), '[[:space:]]+', ' ', 'g')), '') IS NOT NULL
    THEN left(btrim(profile.display_name), 255) END,
  CASE WHEN NULLIF(btrim(regexp_replace(normalize(author.name, NFKC), '[[:space:]]+', ' ', 'g')), '') IS NOT NULL
    THEN left(btrim(author.name), 255) END,
  left(author.id, 255)
)`

const storedChartKey = ({ songId, sheetType, sheetDifficulty }: StoredChartTuple): string =>
  JSON.stringify([songId, sheetType, sheetDifficulty])

const assertString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`Invalid stored comment context ${field}`)
  return value
}

const assertNullableString = (value: unknown, field: string): string | null => {
  if (value === null) return null
  return assertString(value, field)
}

const assertPositiveBigint = (value: unknown, field: string): string => {
  const result = assertString(value, field)
  if (!POSITIVE_BIGINT_PATTERN.test(result)) throw new Error(`Invalid stored comment context ${field}`)
  return result
}

const assertUtcMicroseconds = (value: unknown, field: string): string => {
  const result = assertString(value, field)
  if (!UTC_MICROSECOND_PATTERN.test(result)) throw new Error(`Invalid stored comment context ${field}`)
  return result
}

const assertNullableUtcMicroseconds = (value: unknown, field: string): string | null => {
  if (value === null) return null
  return assertUtcMicroseconds(value, field)
}

const assertPersistedRole = (value: unknown): 'user' | 'admin' => {
  if (typeof value !== 'string' || !PERSISTED_ROLES.has(value)) {
    throw new Error('Invalid stored comment author role')
  }
  return value as 'user' | 'admin'
}

const assertBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`Invalid stored comment context ${field}`)
  return value
}

const assertNonnegativeInteger = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid stored comment context ${field}`)
  }
  return value
}

const catalogUnavailable = (cause: unknown) => new CommentContextStoreFailure('CATALOG_UNAVAILABLE', { cause })

const threadIntegrityFailure = () => new CommentContextStoreFailure('THREAD_INTEGRITY')
const invalidThreadCursorFailure = () => new CommentContextStoreFailure('INVALID_THREAD_CURSOR')

const parseStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || !value.every((candidate) => typeof candidate === 'string' && candidate.length > 0)) {
    throw new Error('Invalid stored chart legacy identities')
  }
  return value
}

const projectStableChartFilter = (row: StableChartFilterRow): ResolvedStableChartFilter => {
  const legacySongId = assertNullableString(row.legacy_song_id, 'legacy song ID')
  const storedSongIds = new Set(parseStringArray(row.mapped_song_ids))
  if (legacySongId !== null && legacySongId.length > 0) storedSongIds.add(legacySongId)
  return {
    stableSongId: assertString(row.stable_song_id, 'stable song ID'),
    stableChartId: assertString(row.stable_chart_id, 'stable chart ID'),
    storedSongIds: [...storedSongIds].sort(),
    sheetType: assertString(row.sheet_type, 'sheet type'),
    sheetDifficulty: assertString(row.sheet_difficulty, 'sheet difficulty'),
  }
}

const unresolvedChartContext = (
  chart: StoredChartTuple,
  availability: 'unresolved' | 'catalog_unavailable',
): StoredChartContext => ({
  ...chart,
  availability,
  stableSongId: null,
  stableChartId: null,
  songTitle: null,
  songArtist: null,
  songRetiredAt: null,
  chartRetiredAt: null,
})

const projectPublication = (row: ChartContextRow): ActiveCatalogPublication | null => {
  const fields = [
    row.publication_channel,
    row.publication_catalog_run_id,
    row.publication_revision,
    row.publication_published_at,
  ]
  if (fields.every((field) => field === null)) return null
  if (fields.some((field) => field === null)) throw new Error('Invalid active catalog publication identity')
  return {
    channel: assertString(row.publication_channel, 'publication channel'),
    catalogRunId: assertPositiveBigint(row.publication_catalog_run_id, 'publication catalog run ID'),
    revision: assertPositiveBigint(row.publication_revision, 'publication revision'),
    publishedAt: assertUtcMicroseconds(row.publication_published_at, 'publication time'),
  }
}

const projectChartContext = (
  row: ChartContextRow,
  publication: ActiveCatalogPublication | null,
): StoredChartContext => {
  const chart = {
    songId: assertString(row.requested_song_id, 'requested song ID'),
    sheetType: assertString(row.requested_sheet_type, 'requested sheet type'),
    sheetDifficulty: assertString(row.requested_sheet_difficulty, 'requested sheet difficulty'),
  }
  const stableSongId = assertNullableString(row.stable_song_id, 'stable song ID')
  const stableChartId = assertNullableString(row.stable_chart_id, 'stable chart ID')
  if (stableSongId === null || stableChartId === null) {
    if (stableSongId !== null || stableChartId !== null) throw new Error('Inconsistent stored chart identity')
    return unresolvedChartContext(chart, publication === null ? 'catalog_unavailable' : 'unresolved')
  }

  return {
    ...chart,
    availability:
      publication === null ? 'catalog_unavailable' : row.active_chart_id === stableChartId ? 'current' : 'historical',
    stableSongId,
    stableChartId,
    songTitle: assertNullableString(row.song_title, 'song title'),
    songArtist: assertNullableString(row.song_artist, 'song artist'),
    songRetiredAt: assertNullableUtcMicroseconds(row.song_retired_at, 'song retirement time'),
    chartRetiredAt: assertNullableUtcMicroseconds(row.chart_retired_at, 'chart retirement time'),
  }
}

const projectRecentCommentBase = (
  row: RecentCommentRow,
): Omit<StoredRecentComment, 'chart'> & {
  readonly storedChart: StoredChartTuple
} => {
  const status = row.status === 'deleted' ? 'deleted' : row.status === 'active' ? 'active' : undefined
  if (!status) throw new Error('Invalid stored recent-comment status')
  const rootId = row.root_id === null ? null : assertPositiveBigint(row.root_id, 'root ID')
  const ancestryCycle = assertBoolean(row.ancestry_cycle, 'ancestry cycle')
  const ancestryDepthLimited = assertBoolean(row.ancestry_depth_limited, 'ancestry depth limit')
  const threadIntegrity = ancestryCycle
    ? 'cycle'
    : ancestryDepthLimited
      ? 'depth_limit'
      : rootId === null
        ? 'missing_root'
        : 'ok'
  return {
    id: assertPositiveBigint(row.comment_id, 'comment ID'),
    parentId: row.parent_id === null ? null : assertPositiveBigint(row.parent_id, 'parent ID'),
    rootId,
    threadIntegrity,
    createdAt: assertUtcMicroseconds(row.created_at_utc, 'comment creation time'),
    status,
    preview: assertString(row.preview, 'comment preview'),
    previewTruncated: assertBoolean(row.preview_truncated, 'comment preview truncation'),
    author: {
      userId: assertString(row.author_user_id, 'author user ID'),
      displayName: assertString(row.display_name, 'author display name'),
      persistedRole: assertPersistedRole(row.persisted_role),
      currentlyBanned: assertBoolean(row.currently_banned, 'author ban state'),
    },
    storedChart: {
      songId: assertString(row.song_id, 'stored song ID'),
      sheetType: assertString(row.sheet_type, 'stored sheet type'),
      sheetDifficulty: assertString(row.sheet_difficulty, 'stored sheet difficulty'),
    },
  }
}

type ParameterBuilder = {
  readonly parameters: unknown[]
  add(value: unknown, cast?: string): string
}

const createParameterBuilder = (): ParameterBuilder => {
  const parameters: unknown[] = []
  return {
    parameters,
    add(value, cast = '') {
      parameters.push(value)
      return `$${parameters.length}${cast}`
    },
  }
}

const buildRecentCommentsQuery = ({ filters, cursor, limit }: ListRecentCommentsInput) => {
  const parameter = createParameterBuilder()
  const sharedPredicates: string[] = []

  if (filters.authorUserId !== undefined) {
    sharedPredicates.push(`comment.created_by = ${parameter.add(filters.authorUserId)}`)
  }
  if (filters.chart !== undefined) {
    const storedSongIds = parameter.add([...filters.chart.storedSongIds], '::text[]')
    sharedPredicates.push(
      filters.chart.storedSongIds.length === 0 ? 'FALSE' : `comment.song_id = ANY(${storedSongIds})`,
      `comment.sheet_type = ${parameter.add(filters.chart.sheetType)}`,
      `comment.sheet_difficulty = ${parameter.add(filters.chart.sheetDifficulty)}`,
    )
  }
  const createdAtFrom =
    filters.createdAtFrom === undefined ? undefined : parameter.add(filters.createdAtFrom, '::timestamptz')
  const createdAtBefore =
    filters.createdAtBefore === undefined ? undefined : parameter.add(filters.createdAtBefore, '::timestamptz')
  let cursorCreatedAt: string | undefined
  let cursorId: string | undefined
  if (cursor !== undefined) {
    if (!UTC_MICROSECOND_PATTERN.test(cursor.createdAt) || !POSITIVE_BIGINT_PATTERN.test(cursor.id)) {
      throw new Error('Recent-comment cursor was not normalized by the service')
    }
    cursorCreatedAt = parameter.add(cursor.createdAt, '::timestamptz')
    cursorId = parameter.add(cursor.id, '::bigint')
  }

  const temporalPredicates = (createdAtExpression: string, idExpression: string): readonly string[] => {
    const predicates: string[] = []
    if (createdAtFrom !== undefined) {
      predicates.push(`${createdAtExpression} >= (${createdAtFrom} AT TIME ZONE 'UTC')`)
    }
    if (createdAtBefore !== undefined) {
      predicates.push(`${createdAtExpression} < (${createdAtBefore} AT TIME ZONE 'UTC')`)
    }
    if (cursorCreatedAt !== undefined && cursorId !== undefined) {
      predicates.push(
        `(${createdAtExpression}, ${idExpression}) < ((${cursorCreatedAt} AT TIME ZONE 'UTC'), ${cursorId})`,
      )
    }
    return predicates
  }
  const whereSql = (predicates: readonly string[]) =>
    predicates.length > 0 ? `WHERE ${predicates.join('\n            AND ')}` : ''

  const pageLimit = parameter.add(limit + 1, '::integer')
  const previewSource = `btrim(regexp_replace(left(comment.content, ${COMMENT_FEED_PREVIEW_SOURCE_MAX_LENGTH}), '[[:space:]]+', ' ', 'g'))`
  const regularPredicates = [...sharedPredicates]
  if (filters.status === 'active') {
    regularPredicates.push(`moderation.established_action IS DISTINCT FROM 'delete'`)
  }
  regularPredicates.push(...temporalPredicates('comment.created_at', 'comment.id'))

  const regularRecentPageSql = `
        recent_page AS MATERIALIZED (
          SELECT
            comment.id,
            comment.parent_id,
            comment.created_at,
            comment.created_by,
            comment.song_id,
            comment.sheet_type,
            comment.sheet_difficulty,
            moderation.established_action,
            CASE
              WHEN moderation.established_action = 'delete' THEN '[deleted]'
              ELSE left(${previewSource}, ${COMMENT_FEED_PREVIEW_MAX_LENGTH})
            END AS preview,
            CASE
              WHEN moderation.established_action = 'delete' THEN FALSE
              ELSE length(comment.content) > ${COMMENT_FEED_PREVIEW_SOURCE_MAX_LENGTH}
                OR length(${previewSource}) > ${COMMENT_FEED_PREVIEW_MAX_LENGTH}
            END AS preview_truncated
          FROM comments comment
          LEFT JOIN admin_comment_moderation_state moderation ON moderation.comment_id = comment.id
          ${whereSql(regularPredicates)}
          ORDER BY comment.created_at DESC NULLS LAST, comment.id DESC NULLS LAST
          LIMIT ${pageLimit}
        )`

  const populatedDeletedPredicates = [
    `moderation.established_action = 'delete'`,
    `moderation.comment_created_at IS NOT NULL`,
    ...sharedPredicates,
    ...temporalPredicates('moderation.comment_created_at', 'moderation.comment_id'),
  ]
  const populatedDeletedBranchSql = `(
          SELECT
            moderation.comment_id AS id,
            comment.parent_id,
            moderation.comment_created_at AS created_at,
            comment.created_by,
            comment.song_id,
            comment.sheet_type,
            comment.sheet_difficulty,
            moderation.established_action,
            '[deleted]'::text AS preview,
            FALSE AS preview_truncated
          FROM admin_comment_moderation_state moderation
          INNER JOIN comments comment ON comment.id = moderation.comment_id
          ${whereSql(populatedDeletedPredicates)}
          ORDER BY moderation.comment_created_at DESC NULLS LAST, moderation.comment_id DESC NULLS LAST
          LIMIT ${pageLimit}
        )`

  const legacyDeletedPredicates = [
    `legacy_deleted.established_action = 'delete'`,
    `legacy_deleted.comment_created_at IS NULL`,
    ...sharedPredicates,
    ...temporalPredicates('comment.created_at', 'comment.id'),
  ]
  const legacyDeletedBranchSql = `(
          SELECT
            comment.id,
            comment.parent_id,
            comment.created_at,
            comment.created_by,
            comment.song_id,
            comment.sheet_type,
            comment.sheet_difficulty,
            legacy_deleted.established_action,
            '[deleted]'::text AS preview,
            FALSE AS preview_truncated
          FROM comments comment
          CROSS JOIN LATERAL (
            SELECT
              legacy_moderation.established_action,
              legacy_moderation.comment_created_at
            FROM admin_comment_moderation_state legacy_moderation
            WHERE legacy_moderation.comment_id = comment.id
            LIMIT 1
          ) legacy_deleted
          ${whereSql(legacyDeletedPredicates)}
          ORDER BY comment.created_at DESC NULLS LAST, comment.id DESC NULLS LAST
          LIMIT ${pageLimit}
        )`

  // The populated branch streams the partial moderation-state index. The
  // temporary NULL branch streams a comments recency index and probes state
  // by primary key, avoiding a full transitional-state sort during backfill.
  const deletedRecentPageSql = `
        deleted_page_candidates AS MATERIALIZED (
          ${populatedDeletedBranchSql}

          UNION ALL

          ${legacyDeletedBranchSql}
        ),
        recent_page AS MATERIALIZED (
          SELECT *
          FROM deleted_page_candidates
          ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
          LIMIT ${pageLimit}
        )`
  const recentPageSql = filters.status === 'deleted' ? deletedRecentPageSql : regularRecentPageSql

  return {
    parameters: parameter.parameters,
    text: `
      /* comment-context-store:list-recent */
      WITH RECURSIVE
        evaluation_clock AS MATERIALIZED (
          SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
        ),
        ${recentPageSql},
        ancestry(origin_id, current_id, parent_id, path, depth, cycle) AS (
          SELECT page.id, page.id, page.parent_id, ARRAY[page.id]::bigint[], 0, FALSE
          FROM recent_page page

          UNION ALL

          SELECT
            ancestry.origin_id,
            parent.id,
            parent.parent_id,
            ancestry.path || parent.id,
            ancestry.depth + 1,
            parent.id = ANY(ancestry.path)
          FROM ancestry
          INNER JOIN comments parent ON parent.id = ancestry.parent_id
          WHERE NOT ancestry.cycle
            AND ancestry.depth < ${COMMENT_THREAD_MAX_DEPTH}
        ),
        ancestry_summary AS MATERIALIZED (
          SELECT
            origin_id,
            (array_agg(current_id ORDER BY depth DESC) FILTER (WHERE parent_id IS NULL))[1] AS root_id,
            bool_or(cycle) AS ancestry_cycle,
            bool_or(depth = ${COMMENT_THREAD_MAX_DEPTH} AND parent_id IS NOT NULL) AS ancestry_depth_limited
          FROM ancestry
          GROUP BY origin_id
        )
      SELECT
        page.id::text AS comment_id,
        page.parent_id::text AS parent_id,
        ancestry.root_id::text AS root_id,
        ancestry.ancestry_cycle,
        ancestry.ancestry_depth_limited,
        ${exactUtcMicrosecondsSql('page.created_at')} AS created_at_utc,
        CASE WHEN page.established_action = 'delete' THEN 'deleted' ELSE 'active' END AS status,
        page.preview,
        page.preview_truncated,
        author.id AS author_user_id,
        ${canonicalDisplayNameSql} AS display_name,
        author.role::text AS persisted_role,
        COALESCE(
          ban.established_action = 'ban'
            AND (ban.ban_expires_at IS NULL OR ban.ban_expires_at > evaluation_clock.evaluated_at),
          FALSE
        ) AS currently_banned,
        page.song_id,
        page.sheet_type,
        page.sheet_difficulty
      FROM recent_page page
      CROSS JOIN evaluation_clock
      INNER JOIN "user" author ON author.id = page.created_by
      LEFT JOIN profiles profile ON profile.id = author.id
      LEFT JOIN admin_user_ban_state ban ON ban.subject_user_id = author.id
      INNER JOIN ancestry_summary ancestry ON ancestry.origin_id = page.id
      ORDER BY page.created_at DESC NULLS LAST, page.id DESC NULLS LAST
    `,
  }
}

const resolveStoredChartContexts = async (
  database: CommentContextDatabase,
  storedCharts: readonly StoredChartTuple[],
): Promise<{
  readonly contexts: ReadonlyMap<string, StoredChartContext>
  readonly activePublication: ActiveCatalogPublication | null
}> => {
  const uniqueCharts = new Map<string, StoredChartTuple>()
  for (const chart of storedCharts) uniqueCharts.set(storedChartKey(chart), chart)
  if (uniqueCharts.size === 0) return { contexts: new Map(), activePublication: null }

  const charts = [...uniqueCharts.values()]
  let rows: ChartContextRow[]
  try {
    const result = await database.query<ChartContextRow>(
      `
        /* comment-context-store:resolve-chart-contexts */
        WITH
          requested AS MATERIALIZED (
            SELECT
              request.song_id,
              request.sheet_type,
              request.sheet_difficulty,
              request.ordinal::integer AS ordinal
            FROM unnest($1::text[], $2::text[], $3::text[])
              WITH ORDINALITY AS request(song_id, sheet_type, sheet_difficulty, ordinal)
          ),
          active_publication AS MATERIALIZED (
            SELECT
              publication.channel,
              publication.catalog_run_id,
              publication.revision,
              publication.published_at
            FROM dxdata.catalog_publications publication
            INNER JOIN dxdata.catalog_snapshots snapshot
              ON snapshot.catalog_run_id = publication.catalog_run_id
            INNER JOIN dxdata.catalog_build_runs build
              ON build.id = publication.catalog_run_id
            WHERE publication.channel = $4
              AND build.status = 'published'
              AND build.api_schema_version = 1
              AND snapshot.api_schema_version = 1
            LIMIT 1
          )
        SELECT
          requested.ordinal,
          requested.song_id AS requested_song_id,
          requested.sheet_type AS requested_sheet_type,
          requested.sheet_difficulty AS requested_sheet_difficulty,
          song.id AS stable_song_id,
          sheet.id AS stable_chart_id,
          song.title AS song_title,
          song.artist AS song_artist,
          ${exactUtcTimestamptzMicrosecondsSql('song.retired_at')} AS song_retired_at,
          ${exactUtcTimestamptzMicrosecondsSql('sheet.retired_at')} AS chart_retired_at,
          active_sheet.sheet_id AS active_chart_id,
          publication.channel AS publication_channel,
          publication.catalog_run_id::text AS publication_catalog_run_id,
          publication.revision::text AS publication_revision,
          ${exactUtcTimestamptzMicrosecondsSql('publication.published_at')} AS publication_published_at
        FROM requested
        LEFT JOIN dxdata.song_source_mappings mapping
          ON mapping.source_id = 'legacy_dxdata'
          AND mapping.external_id = requested.song_id
        LEFT JOIN dxdata.canonical_songs direct_song
          ON direct_song.legacy_song_id = requested.song_id
        LEFT JOIN dxdata.canonical_songs song
          ON song.id = COALESCE(mapping.song_id, direct_song.id)
        LEFT JOIN dxdata.canonical_sheets sheet
          ON sheet.song_id = song.id
          AND sheet.chart_type = requested.sheet_type
          AND sheet.difficulty = requested.sheet_difficulty
        LEFT JOIN active_publication publication ON TRUE
        LEFT JOIN dxdata.catalog_run_sheets active_sheet
          ON active_sheet.catalog_run_id = publication.catalog_run_id
          AND active_sheet.song_id = song.id
          AND active_sheet.sheet_id = sheet.id
        ORDER BY requested.ordinal
      `,
      [
        charts.map((chart) => chart.songId),
        charts.map((chart) => chart.sheetType),
        charts.map((chart) => chart.sheetDifficulty),
        COMMENT_CONTEXT_PRODUCTION_CHANNEL,
      ],
    )
    rows = result.rows
  } catch {
    return {
      contexts: new Map(
        charts.map((chart) => [storedChartKey(chart), unresolvedChartContext(chart, 'catalog_unavailable')]),
      ),
      activePublication: null,
    }
  }

  if (rows.length !== charts.length) {
    return {
      contexts: new Map(
        charts.map((chart) => [storedChartKey(chart), unresolvedChartContext(chart, 'catalog_unavailable')]),
      ),
      activePublication: null,
    }
  }

  try {
    const publication = projectPublication(rows[0])
    const contexts = new Map<string, StoredChartContext>()
    for (const [index, chart] of charts.entries()) {
      const row = rows[index]
      if (!row || row.ordinal !== index + 1) throw new Error('Invalid batched stored chart ordering')
      const rowPublication = projectPublication(row)
      if (JSON.stringify(rowPublication) !== JSON.stringify(publication)) {
        throw new Error('Inconsistent active publication across stored chart contexts')
      }
      contexts.set(storedChartKey(chart), projectChartContext(row, publication))
    }
    return { contexts, activePublication: publication }
  } catch {
    return {
      contexts: new Map(
        charts.map((chart) => [storedChartKey(chart), unresolvedChartContext(chart, 'catalog_unavailable')]),
      ),
      activePublication: null,
    }
  }
}

const buildThreadQuery = ({ commentId, cursor, limit }: LoadCommentThreadSegmentInput) => ({
  parameters: [
    commentId,
    cursor?.highWaterId ?? null,
    cursor?.lastCommentId ?? null,
    cursor?.rootId ?? null,
    limit + 1,
  ],
  text: `
    /* comment-context-store:load-thread-segment */
    WITH RECURSIVE
      selected_comment AS MATERIALIZED (
        SELECT comment.id, comment.parent_id
        FROM comments comment
        WHERE comment.id = $1::bigint
      ),
      high_water AS MATERIALIZED (
        SELECT COALESCE(
          $2::bigint,
          (SELECT max(comment.id) FROM comments comment),
          (SELECT id FROM selected_comment)
        ) AS id
      ),
      ancestors(current_id, parent_id, path, depth, cycle) AS (
        SELECT selected.id, selected.parent_id, ARRAY[selected.id]::bigint[], 0, FALSE
        FROM selected_comment selected

        UNION ALL

        SELECT
          parent.id,
          parent.parent_id,
          ancestors.path || parent.id,
          ancestors.depth + 1,
          parent.id = ANY(ancestors.path)
        FROM ancestors
        INNER JOIN comments parent ON parent.id = ancestors.parent_id
        WHERE NOT ancestors.cycle
          AND ancestors.depth < ${COMMENT_THREAD_MAX_DEPTH}
      ),
      ancestor_summary AS MATERIALIZED (
        SELECT
          (array_agg(current_id ORDER BY depth DESC) FILTER (WHERE parent_id IS NULL))[1] AS root_id,
          bool_or(cycle) AS cycle,
          bool_or(depth = ${COMMENT_THREAD_MAX_DEPTH} AND parent_id IS NOT NULL) AS depth_limited
        FROM ancestors
      ),
      thread(
        id,
        parent_id,
        created_at,
        created_by,
        song_id,
        sheet_type,
        sheet_difficulty,
        content,
        depth,
        identity_path,
        order_path,
        cycle
      ) AS (
        SELECT
          root.id,
          root.parent_id,
          root.created_at,
          root.created_by,
          root.song_id,
          root.sheet_type,
          root.sheet_difficulty,
          root.content,
          0,
          ARRAY[root.id]::bigint[],
          ARRAY[${exactUtcMicrosecondsSql('root.created_at')} || ':' || lpad(root.id::text, 19, '0')]::text[],
          FALSE
        FROM ancestor_summary summary
        INNER JOIN comments root ON root.id = summary.root_id
        CROSS JOIN high_water
        WHERE root.id <= high_water.id

        UNION ALL

        SELECT
          child.id,
          child.parent_id,
          child.created_at,
          child.created_by,
          child.song_id,
          child.sheet_type,
          child.sheet_difficulty,
          child.content,
          parent.depth + 1,
          parent.identity_path || child.id,
          parent.order_path || (${exactUtcMicrosecondsSql('child.created_at')} || ':' || lpad(child.id::text, 19, '0')),
          child.id = ANY(parent.identity_path)
        FROM thread parent
        INNER JOIN comments child ON child.parent_id = parent.id
        CROSS JOIN high_water
        WHERE NOT parent.cycle
          AND parent.depth < ${COMMENT_THREAD_MAX_DEPTH}
          AND child.id <= high_water.id
      ),
      thread_summary AS MATERIALIZED (
        SELECT
          bool_or(cycle) AS cycle,
          bool_or(
            depth = ${COMMENT_THREAD_MAX_DEPTH}
            AND EXISTS (
              SELECT 1
              FROM comments child
              CROSS JOIN high_water
              WHERE child.parent_id = thread.id
                AND child.id <= high_water.id
                AND NOT child.id = ANY(thread.identity_path)
            )
          ) AS depth_limited
        FROM thread
      ),
      cursor_state AS MATERIALIZED (
        SELECT
          CASE
            WHEN $3::bigint IS NULL THEN TRUE
            ELSE EXISTS (SELECT 1 FROM thread WHERE id = $3::bigint)
          END AS valid,
          (SELECT order_path FROM thread WHERE id = $3::bigint) AS after_path
      ),
      segment AS MATERIALIZED (
        SELECT thread.*
        FROM thread
        CROSS JOIN cursor_state
        WHERE cursor_state.after_path IS NULL OR thread.order_path > cursor_state.after_path
        ORDER BY thread.order_path
        LIMIT $5::integer
      ),
      metadata AS MATERIALIZED (
        SELECT
          EXISTS (SELECT 1 FROM selected_comment) AS selected_exists,
          ancestor_summary.root_id,
          high_water.id AS high_water_id,
          COALESCE(ancestor_summary.cycle, FALSE) AS ancestor_cycle,
          COALESCE(ancestor_summary.depth_limited, FALSE) AS ancestor_depth_limited,
          COALESCE(thread_summary.cycle, FALSE) AS descendant_cycle,
          COALESCE(thread_summary.depth_limited, FALSE) AS descendant_depth_limited,
          cursor_state.valid
            AND ($4::bigint IS NULL OR ancestor_summary.root_id = $4::bigint)
            AND ancestor_summary.root_id <= high_water.id
            AND (SELECT id FROM selected_comment) <= high_water.id AS cursor_valid
        FROM ancestor_summary
        CROSS JOIN high_water
        CROSS JOIN thread_summary
        CROSS JOIN cursor_state
      ),
      evaluation_clock AS MATERIALIZED (
        SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
      )
    SELECT
      metadata.selected_exists,
      metadata.root_id::text AS resolved_root_id,
      metadata.high_water_id::text AS high_water_id,
      metadata.ancestor_cycle,
      metadata.ancestor_depth_limited,
      metadata.descendant_cycle,
      metadata.descendant_depth_limited,
      metadata.cursor_valid,
      segment.id::text AS comment_id,
      segment.parent_id::text AS parent_id,
      segment.depth,
      ${exactUtcMicrosecondsSql('segment.created_at')} AS created_at_utc,
      segment.content AS original_body,
      author.id AS author_user_id,
      ${canonicalDisplayNameSql} AS display_name,
      author.role::text AS persisted_role,
      COALESCE(
        ban.established_action = 'ban'
          AND (ban.ban_expires_at IS NULL OR ban.ban_expires_at > evaluation_clock.evaluated_at),
        FALSE
      ) AS currently_banned,
      segment.song_id,
      segment.sheet_type,
      segment.sheet_difficulty,
      moderation.established_action,
      moderation.established_by_event_id::text AS state_version,
      moderation.actor_user_id AS state_actor_user_id,
      ${exactUtcTimestamptzMicrosecondsSql('moderation.moderated_at')} AS moderated_at_utc,
      moderation.deletion_reason
    FROM metadata
    CROSS JOIN evaluation_clock
    LEFT JOIN segment ON TRUE
    LEFT JOIN "user" author ON author.id = segment.created_by
    LEFT JOIN profiles profile ON profile.id = author.id
    LEFT JOIN admin_user_ban_state ban ON ban.subject_user_id = author.id
    LEFT JOIN admin_comment_moderation_state moderation ON moderation.comment_id = segment.id
    ORDER BY segment.order_path NULLS LAST
  `,
})

const projectThreadState = (row: ThreadSegmentRow): StoredThreadCommentState => {
  const action = row.established_action
  if (action === null) {
    if (
      row.state_version !== null ||
      row.state_actor_user_id !== null ||
      row.moderated_at_utc !== null ||
      row.deletion_reason !== null
    ) {
      throw threadIntegrityFailure()
    }
    return { status: 'active', stateVersion: null, actorUserId: null, moderatedAt: null, reason: null }
  }
  if (action !== 'delete' && action !== 'restore') throw threadIntegrityFailure()
  const stateVersion = assertPositiveBigint(row.state_version, 'thread state version')
  const actorUserId = assertString(row.state_actor_user_id, 'thread moderation actor')
  const moderatedAt = assertUtcMicroseconds(row.moderated_at_utc, 'thread moderation time')
  if (action === 'delete') {
    return {
      status: 'deleted',
      stateVersion,
      actorUserId,
      moderatedAt,
      reason: assertString(row.deletion_reason, 'thread deletion reason'),
    }
  }
  if (row.deletion_reason !== null) throw threadIntegrityFailure()
  return { status: 'active', stateVersion, actorUserId, moderatedAt, reason: null }
}

const projectThreadItem = (row: ThreadSegmentRow, rootId: string): StoredCommentThreadItem => ({
  id: assertPositiveBigint(row.comment_id, 'thread comment ID'),
  parentId: row.parent_id === null ? null : assertPositiveBigint(row.parent_id, 'thread parent ID'),
  rootId,
  depth: assertNonnegativeInteger(row.depth, 'thread depth'),
  createdAt: assertUtcMicroseconds(row.created_at_utc, 'thread creation time'),
  originalBody: assertString(row.original_body, 'thread original body'),
  author: {
    userId: assertString(row.author_user_id, 'thread author user ID'),
    displayName: assertString(row.display_name, 'thread author display name'),
    persistedRole: assertPersistedRole(row.persisted_role),
    currentlyBanned: assertBoolean(row.currently_banned, 'thread author ban state'),
  },
  chart: {
    songId: assertString(row.song_id, 'thread song ID'),
    sheetType: assertString(row.sheet_type, 'thread sheet type'),
    sheetDifficulty: assertString(row.sheet_difficulty, 'thread sheet difficulty'),
  },
  state: projectThreadState(row),
})

export const createPostgresCommentContextStore = (
  database: CommentContextDatabase = pool as CommentContextDatabase,
): CommentContextStore => ({
  async loadExistingUsersById(orderedUserIds) {
    if (orderedUserIds.length === 0) return []
    const result = await database.query<{ readonly id: string }>(
      `/* comment-context-store:load-existing-users */
       SELECT id FROM "user" WHERE id = ANY($1::text[]) ORDER BY id`,
      [[...orderedUserIds]],
    )
    return result.rows.map((row) => ({ id: assertString(row.id, 'existing user ID') }))
  },

  async resolveStableChartFilter(stableChartId) {
    try {
      const result = await database.query<StableChartFilterRow>(
        `
          /* comment-context-store:resolve-stable-chart-filter */
          SELECT
            song.id AS stable_song_id,
            sheet.id AS stable_chart_id,
            song.legacy_song_id,
            COALESCE(
              array_agg(DISTINCT mapping.external_id ORDER BY mapping.external_id)
                FILTER (WHERE mapping.external_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS mapped_song_ids,
            sheet.chart_type AS sheet_type,
            sheet.difficulty AS sheet_difficulty
          FROM dxdata.canonical_sheets sheet
          INNER JOIN dxdata.canonical_songs song ON song.id = sheet.song_id
          LEFT JOIN dxdata.song_source_mappings mapping
            ON mapping.song_id = song.id
            AND mapping.source_id = 'legacy_dxdata'
          WHERE sheet.id = $1
          GROUP BY song.id, sheet.id
          LIMIT 1
        `,
        [stableChartId],
      )
      const row = result.rows[0]
      return row ? projectStableChartFilter(row) : undefined
    } catch (error) {
      if (error instanceof CommentContextStoreFailure) throw error
      throw catalogUnavailable(error)
    }
  },

  async listRecentComments(input) {
    const query = buildRecentCommentsQuery(input)
    const result = await database.query<RecentCommentRow>(query.text, query.parameters)
    const hasMore = result.rows.length > input.limit
    const rows = result.rows.slice(0, input.limit).map(projectRecentCommentBase)
    const catalog = await resolveStoredChartContexts(
      database,
      rows.map((row) => row.storedChart),
    )
    return {
      items: rows.map(({ storedChart, ...row }) => ({
        ...row,
        chart:
          catalog.contexts.get(storedChartKey(storedChart)) ??
          unresolvedChartContext(storedChart, 'catalog_unavailable'),
      })),
      hasMore,
      activePublication: catalog.activePublication,
    }
  },

  resolveStoredChartContexts: (storedCharts) => resolveStoredChartContexts(database, storedCharts),

  async loadCommentThreadSegment(input) {
    const query = buildThreadQuery(input)
    const result = await database.query<ThreadSegmentRow>(query.text, query.parameters)
    const first = result.rows[0]
    if (!first || !assertBoolean(first.selected_exists, 'selected comment existence')) return undefined
    if (
      assertBoolean(first.ancestor_cycle, 'ancestor cycle') ||
      assertBoolean(first.ancestor_depth_limited, 'ancestor depth limit') ||
      assertBoolean(first.descendant_cycle, 'descendant cycle') ||
      assertBoolean(first.descendant_depth_limited, 'descendant depth limit')
    ) {
      throw threadIntegrityFailure()
    }
    if (!assertBoolean(first.cursor_valid, 'thread cursor validity')) throw invalidThreadCursorFailure()

    const rootId = assertPositiveBigint(first.resolved_root_id, 'thread root ID')
    const highWaterId = assertPositiveBigint(first.high_water_id, 'thread high-water ID')
    for (const row of result.rows) {
      if (
        row.selected_exists !== first.selected_exists ||
        row.resolved_root_id !== first.resolved_root_id ||
        row.high_water_id !== first.high_water_id ||
        row.ancestor_cycle !== first.ancestor_cycle ||
        row.ancestor_depth_limited !== first.ancestor_depth_limited ||
        row.descendant_cycle !== first.descendant_cycle ||
        row.descendant_depth_limited !== first.descendant_depth_limited ||
        row.cursor_valid !== first.cursor_valid
      ) {
        throw threadIntegrityFailure()
      }
    }
    const itemRows = result.rows.filter((row) => row.comment_id !== null)
    const hasMore = itemRows.length > input.limit
    return {
      rootId,
      highWaterId,
      items: itemRows.slice(0, input.limit).map((row) => projectThreadItem(row, rootId)),
      hasMore,
    }
  },
})