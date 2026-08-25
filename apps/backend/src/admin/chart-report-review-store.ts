import type { QueryResultRow } from 'pg'
import { pool } from '../db/index.js'
import {
  normalizeChartReportCategoryKey,
  normalizeChartReportFieldKey,
  normalizeChartReportId,
  normalizeChartReportIdentity,
  normalizeChartReportJsonSnapshot,
  normalizeChartReportPublicationIdentity,
  normalizeChartReportState,
  normalizeChartReportUserId,
  type ChartReportCategoryKey,
  type ChartReportFieldKey,
  type ChartReportJsonSnapshot,
  type ChartReportPublicationIdentity,
  type ChartReportState,
} from '../chart-reports/chart-report-domain.js'

const UTC_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PERSISTED_ROLES = new Set(['user', 'admin'])
const DXDATA_API_SCHEMA_VERSION = 1

export type ChartReportReviewDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ readonly rows: Row[] }>
}

export type ChartReportReviewFilters = {
  readonly state?: ChartReportState
  readonly stableChartId?: string
  readonly fieldKey?: ChartReportFieldKey
  readonly category?: ChartReportCategoryKey
  readonly reporterUserId?: string
  /** Inclusive UTC instant, normalized and bounded by the service. */
  readonly createdAtFrom?: string
  /** Exclusive UTC instant, normalized and bounded by the service. */
  readonly createdAtBefore?: string
  readonly publicationRevision?: string
}

export type ChartReportReviewCursor = {
  readonly isOpen: boolean
  /** Exact PostgreSQL microsecond representation, never round-tripped through Date. */
  readonly createdAt: string
  readonly id: string
}

export type ListChartReportReviewsInput = {
  readonly filters: ChartReportReviewFilters
  /** Stable traversal boundary. Later closure transitions remain open until a fresh traversal. */
  readonly snapshotAsOf: string
  readonly cursor?: ChartReportReviewCursor
  readonly limit: number
}

export type StoredChartReportReviewReporter = {
  readonly userId: string
  readonly displayName: string
  readonly emailVerified: boolean
  readonly persistedRole: 'user' | 'admin'
  readonly currentlyBanned: boolean
  /** Present only for a currently active temporary ban. */
  readonly banExpiresAt: string | null
}

export type StoredChartReportReviewQueueItem = {
  readonly id: string
  readonly state: ChartReportState
  readonly stableSongId: string
  readonly stableChartId: string
  readonly publication: ChartReportPublicationIdentity
  readonly fieldKey: ChartReportFieldKey
  readonly category: ChartReportCategoryKey
  readonly currentValue: ChartReportJsonSnapshot
  readonly proposedValue: ChartReportJsonSnapshot
  /** Kept in the store result so the service can produce a compact, bounded preview. */
  readonly explanation: string
  readonly createdAt: string
  readonly reporter: StoredChartReportReviewReporter
}

export type StoredChartReportReviewClosure = {
  readonly actor: {
    readonly userId: string
    readonly displayName: string
  }
  readonly closedAt: string
  readonly internalNote: string | null
}

export type StoredChartReportPublicReference = {
  readonly legacySongId: string
  readonly sheetType: string
  readonly sheetDifficulty: string
}

export type StoredChartReportReviewDetail = StoredChartReportReviewQueueItem & {
  readonly sourceUrls: readonly string[]
  readonly closure: StoredChartReportReviewClosure | null
  readonly publicChartReference: StoredChartReportPublicReference | null
}

export type StoredChartReportReviewPage = {
  readonly items: readonly StoredChartReportReviewQueueItem[]
  readonly hasMore: boolean
}

export type ChartReportReviewPublicationIdentity = ChartReportPublicationIdentity

export type StoredChartReportPublicationSnapshot = {
  readonly publication: ChartReportReviewPublicationIdentity
  readonly publishedAt: string
  /** Immutable, receipt-backed public catalog payload. Parsing belongs to the service. */
  readonly bodyText: string
}

export interface ChartReportReviewStore {
  listReports(input: ListChartReportReviewsInput): Promise<StoredChartReportReviewPage>
  loadReportDetail(reportId: string): Promise<StoredChartReportReviewDetail | undefined>
  loadCapturedPublications(
    identities: readonly ChartReportReviewPublicationIdentity[],
  ): Promise<ReadonlyMap<string, StoredChartReportPublicationSnapshot>>
  loadActivePublication(channel: string): Promise<StoredChartReportPublicationSnapshot | undefined>
}

type QueueRow = {
  readonly id: string
  readonly state: string
  readonly stable_song_id: string
  readonly stable_chart_id: string
  readonly publication_channel: string
  readonly publication_catalog_run_id: string
  readonly publication_revision: string
  readonly publication_fingerprint_sha256: string
  readonly target_field_key: string
  readonly category: string
  readonly current_value: unknown
  readonly proposed_value: unknown
  readonly explanation: string
  readonly created_at_utc: string
  readonly reporter_user_id: string
  readonly reporter_display_name: string
  readonly reporter_email_verified: boolean
  readonly reporter_persisted_role: string
  readonly reporter_currently_banned: boolean
  readonly reporter_ban_expires_at_utc: string | null
}

type DetailRow = QueueRow & {
  readonly source_urls: unknown
  readonly public_chart_reference: unknown
  readonly closed_by_user_id: string | null
  readonly closer_display_name: string | null
  readonly closed_at_utc: string | null
  readonly close_note: string | null
}

type PublicationRow = {
  readonly channel: string
  readonly catalog_run_id: string
  readonly publication_revision: string
  readonly publication_fingerprint_sha256: string
  readonly published_at_utc: string
  readonly body_text: string
}

const exactUtcMicrosecondsSql = (expression: string): string =>
  `to_char(timezone('UTC', ${expression}), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

const canonicalDisplayNameSql = (userAlias: string, profileAlias: string): string => `COALESCE(
  CASE WHEN NULLIF(btrim(regexp_replace(normalize(${profileAlias}.display_name, NFKC), '[[:space:]]+', ' ', 'g')), '') IS NOT NULL
    THEN left(btrim(${profileAlias}.display_name), 255) END,
  CASE WHEN NULLIF(btrim(regexp_replace(normalize(${userAlias}.name, NFKC), '[[:space:]]+', ' ', 'g')), '') IS NOT NULL
    THEN left(btrim(${userAlias}.name), 255) END,
  left(${userAlias}.id, 255)
)`

const activeBanSql = (banAlias: string): string => `(
  ${banAlias}.established_action = 'ban'
    AND (${banAlias}.ban_expires_at IS NULL OR ${banAlias}.ban_expires_at > evaluation_clock.evaluated_at)
)`

const reportOpenAtSnapshotSql = (snapshotBoundary: string): string =>
  `(report.closed_at IS NULL OR report.closed_at >= ${snapshotBoundary})`

const reportStateAtSnapshotSql = (snapshotBoundary: string): string =>
  `CASE WHEN ${reportOpenAtSnapshotSql(snapshotBoundary)} THEN 'open' ELSE 'closed' END`

const reportColumnsSql = (stateExpression = 'report.state'): string => `
  report.id::text AS id,
  ${stateExpression} AS state,
  report.stable_song_id,
  report.stable_chart_id,
  report.publication_channel,
  report.publication_catalog_run_id::text AS publication_catalog_run_id,
  report.publication_revision::text AS publication_revision,
  report.publication_fingerprint_sha256,
  report.target_field_key,
  report.category,
  report.current_value,
  report.proposed_value,
  report.explanation,
  ${exactUtcMicrosecondsSql('report.created_at')} AS created_at_utc,
  reporter.id AS reporter_user_id,
  ${canonicalDisplayNameSql('reporter', 'reporter_profile')} AS reporter_display_name,
  reporter.email_verified AS reporter_email_verified,
  reporter.role::text AS reporter_persisted_role,
  COALESCE(${activeBanSql('reporter_ban')}, FALSE) AS reporter_currently_banned,
  CASE WHEN ${activeBanSql('reporter_ban')} AND reporter_ban.ban_expires_at IS NOT NULL
    THEN ${exactUtcMicrosecondsSql('reporter_ban.ban_expires_at')}
    ELSE NULL
  END AS reporter_ban_expires_at_utc
`

const reportJoinsSql = `
  CROSS JOIN evaluation_clock
  INNER JOIN "user" reporter ON reporter.id = report.reporter_user_id
  LEFT JOIN profiles reporter_profile ON reporter_profile.id = reporter.id
  LEFT JOIN admin_user_ban_state reporter_ban ON reporter_ban.subject_user_id = reporter.id
`

const parseExactTimestamp = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UTC_MICROSECOND_PATTERN.test(value)) {
    throw new Error(`Invalid stored chart-report ${field}`)
  }
  return value
}

const parsePersistedRole = (value: string): 'user' | 'admin' => {
  if (!PERSISTED_ROLES.has(value)) throw new Error('Invalid stored chart-report reporter role')
  return value as 'user' | 'admin'
}

const projectQueueRow = (row: QueueRow): StoredChartReportReviewQueueItem => {
  const state = normalizeChartReportState(row.state)
  const identity = normalizeChartReportIdentity({
    stableSongId: row.stable_song_id,
    stableChartId: row.stable_chart_id,
  })
  const publication = normalizeChartReportPublicationIdentity({
    channel: row.publication_channel,
    catalogRunId: row.publication_catalog_run_id,
    revision: row.publication_revision,
    fingerprintSha256: row.publication_fingerprint_sha256,
  })
  const fieldKey = normalizeChartReportFieldKey(row.target_field_key)
  const category = normalizeChartReportCategoryKey(row.category)
  const banExpiresAt =
    row.reporter_ban_expires_at_utc === null
      ? null
      : parseExactTimestamp(row.reporter_ban_expires_at_utc, 'reporter ban expiry')
  if (!row.reporter_currently_banned && banExpiresAt !== null) {
    throw new Error('Inconsistent stored chart-report reporter ban projection')
  }

  return Object.freeze({
    id: normalizeChartReportId(row.id),
    state,
    stableSongId: identity.stableSongId,
    stableChartId: identity.stableChartId,
    publication,
    fieldKey,
    category,
    currentValue: normalizeChartReportJsonSnapshot(fieldKey, row.current_value),
    proposedValue: normalizeChartReportJsonSnapshot(fieldKey, row.proposed_value),
    explanation: row.explanation,
    createdAt: parseExactTimestamp(row.created_at_utc, 'creation timestamp'),
    reporter: Object.freeze({
      userId: normalizeChartReportUserId(row.reporter_user_id),
      displayName: row.reporter_display_name,
      emailVerified: row.reporter_email_verified,
      persistedRole: parsePersistedRole(row.reporter_persisted_role),
      currentlyBanned: row.reporter_currently_banned,
      banExpiresAt,
    }),
  })
}

const projectDetailRow = (row: DetailRow): StoredChartReportReviewDetail => {
  const report = projectQueueRow(row)
  if (!Array.isArray(row.source_urls) || !row.source_urls.every((value) => typeof value === 'string')) {
    throw new Error('Invalid stored chart-report evidence URLs')
  }

  const hasClosureIdentity = row.closed_by_user_id !== null || row.closed_at_utc !== null
  if (
    (report.state === 'open' && (hasClosureIdentity || row.closer_display_name !== null || row.close_note !== null)) ||
    (report.state === 'closed' &&
      (!hasClosureIdentity ||
        row.closed_by_user_id === null ||
        row.closer_display_name === null ||
        row.closed_at_utc === null))
  ) {
    throw new Error('Inconsistent stored chart-report closure projection')
  }

  const closure =
    report.state === 'closed'
      ? Object.freeze({
          actor: Object.freeze({
            userId: normalizeChartReportUserId(row.closed_by_user_id as string),
            displayName: row.closer_display_name as string,
          }),
          closedAt: parseExactTimestamp(row.closed_at_utc, 'closure timestamp'),
          internalNote: row.close_note,
        })
      : null

  const publicChartReference = (() => {
    if (row.public_chart_reference === null) return null
    if (
      typeof row.public_chart_reference !== 'object' ||
      Array.isArray(row.public_chart_reference) ||
      row.public_chart_reference === null
    ) {
      throw new Error('Invalid stored chart-report public chart reference')
    }
    const reference = row.public_chart_reference as Record<string, unknown>
    if (
      Object.keys(reference).sort().join(',') !== 'legacySongId,sheetDifficulty,sheetType' ||
      typeof reference.legacySongId !== 'string' ||
      reference.legacySongId.length === 0 ||
      typeof reference.sheetType !== 'string' ||
      reference.sheetType.length === 0 ||
      typeof reference.sheetDifficulty !== 'string' ||
      reference.sheetDifficulty.length === 0
    ) {
      throw new Error('Invalid stored chart-report public chart reference')
    }
    return Object.freeze({
      legacySongId: reference.legacySongId,
      sheetType: reference.sheetType,
      sheetDifficulty: reference.sheetDifficulty,
    })
  })()

  return Object.freeze({
    ...report,
    sourceUrls: Object.freeze([...row.source_urls]),
    closure,
    publicChartReference,
  })
}

const projectPublicationRow = (row: PublicationRow): StoredChartReportPublicationSnapshot => {
  if (typeof row.body_text !== 'string') throw new Error('Invalid stored chart-report catalog snapshot')
  return Object.freeze({
    publication: normalizeChartReportPublicationIdentity({
      channel: row.channel,
      catalogRunId: row.catalog_run_id,
      revision: row.publication_revision,
      fingerprintSha256: row.publication_fingerprint_sha256,
    }),
    publishedAt: parseExactTimestamp(row.published_at_utc, 'publication timestamp'),
    bodyText: row.body_text,
  })
}

type ParameterBuilder = {
  readonly values: unknown[]
  add(value: unknown, cast?: string): string
}

const createParameterBuilder = (): ParameterBuilder => {
  const values: unknown[] = []
  return {
    values,
    add(value, cast = '') {
      values.push(value)
      return `$${values.length}${cast}`
    },
  }
}

const buildListQuery = ({ filters, snapshotAsOf, cursor, limit }: ListChartReportReviewsInput) => {
  const parameter = createParameterBuilder()
  if (!UTC_MILLISECOND_PATTERN.test(snapshotAsOf)) {
    throw new Error('Chart-report review snapshot boundary was not normalized by the service')
  }
  const snapshotBoundary = parameter.add(snapshotAsOf, '::timestamptz')
  const openAtSnapshot = reportOpenAtSnapshotSql(snapshotBoundary)
  const stateAtSnapshot = reportStateAtSnapshotSql(snapshotBoundary)
  const predicates: string[] = [`report.created_at < ${snapshotBoundary}`]

  if (filters.state !== undefined) predicates.push(`${stateAtSnapshot} = ${parameter.add(filters.state)}`)
  if (filters.stableChartId !== undefined) {
    predicates.push(`report.stable_chart_id = ${parameter.add(filters.stableChartId)}`)
  }
  if (filters.fieldKey !== undefined) {
    predicates.push(`report.target_field_key = ${parameter.add(filters.fieldKey)}`)
  }
  if (filters.category !== undefined) predicates.push(`report.category = ${parameter.add(filters.category)}`)
  if (filters.reporterUserId !== undefined) {
    predicates.push(`report.reporter_user_id = ${parameter.add(filters.reporterUserId)}`)
  }
  if (filters.createdAtFrom !== undefined) {
    predicates.push(`report.created_at >= ${parameter.add(filters.createdAtFrom, '::timestamptz')}`)
  }
  if (filters.createdAtBefore !== undefined) {
    predicates.push(`report.created_at < ${parameter.add(filters.createdAtBefore, '::timestamptz')}`)
  }
  if (filters.publicationRevision !== undefined) {
    predicates.push(`report.publication_revision = ${parameter.add(filters.publicationRevision, '::bigint')}`)
  }
  if (cursor !== undefined) {
    if (!UTC_MICROSECOND_PATTERN.test(cursor.createdAt) || !UUID_PATTERN.test(cursor.id)) {
      throw new Error('Chart-report review cursor was not normalized by the service')
    }
    predicates.push(
      `(${openAtSnapshot}, report.created_at, report.id) < (${parameter.add(cursor.isOpen, '::boolean')}, ${parameter.add(cursor.createdAt, '::timestamptz')}, ${parameter.add(cursor.id, '::uuid')})`,
    )
  }
  const pageLimit = parameter.add(limit + 1, '::integer')

  return {
    text: `
      /* chart-report-review-store:list */
      WITH evaluation_clock AS MATERIALIZED (
        SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
      )
      SELECT ${reportColumnsSql(stateAtSnapshot)}
      FROM public.chart_reports report
      ${reportJoinsSql}
      ${predicates.length > 0 ? `WHERE ${predicates.join('\n        AND ')}` : ''}
      ORDER BY ${openAtSnapshot} DESC, report.created_at DESC, report.id DESC
      LIMIT ${pageLimit}
    `,
    values: parameter.values,
  }
}

export const chartReportReviewPublicationKey = (identity: ChartReportReviewPublicationIdentity): string => {
  const normalized = normalizeChartReportPublicationIdentity(identity)
  return [normalized.channel, normalized.catalogRunId, normalized.revision, normalized.fingerprintSha256].join(':')
}

export const createPostgresChartReportReviewStore = (
  database: ChartReportReviewDatabase = pool as ChartReportReviewDatabase,
): ChartReportReviewStore => ({
  async listReports(input) {
    const query = buildListQuery(input)
    const result = await database.query<QueueRow>(query.text, query.values)
    return Object.freeze({
      items: Object.freeze(result.rows.slice(0, input.limit).map(projectQueueRow)),
      hasMore: result.rows.length > input.limit,
    })
  },

  async loadReportDetail(reportId) {
    const result = await database.query<DetailRow>(
      `
        /* chart-report-review-store:detail */
        WITH evaluation_clock AS MATERIALIZED (
          SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
        )
        SELECT
          ${reportColumnsSql()},
          report.source_urls,
          CASE
            WHEN canonical_song.legacy_song_id IS NULL OR canonical_sheet.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'legacySongId', canonical_song.legacy_song_id,
              'sheetType', canonical_sheet.chart_type,
              'sheetDifficulty', canonical_sheet.difficulty
            )
          END AS public_chart_reference,
          closer.id AS closed_by_user_id,
          CASE WHEN closer.id IS NULL THEN NULL
            ELSE ${canonicalDisplayNameSql('closer', 'closer_profile')}
          END AS closer_display_name,
          ${exactUtcMicrosecondsSql('report.closed_at')} AS closed_at_utc,
          report.close_note
        FROM public.chart_reports report
        ${reportJoinsSql}
        LEFT JOIN dxdata.canonical_sheets canonical_sheet
          ON canonical_sheet.id = report.stable_chart_id
          AND canonical_sheet.song_id = report.stable_song_id
        LEFT JOIN dxdata.canonical_songs canonical_song
          ON canonical_song.id = report.stable_song_id
          AND canonical_song.id = canonical_sheet.song_id
        LEFT JOIN "user" closer ON closer.id = report.closed_by_user_id
        LEFT JOIN profiles closer_profile ON closer_profile.id = closer.id
        WHERE report.id = $1::uuid
        LIMIT 1
      `,
      [normalizeChartReportId(reportId)],
    )
    const row = result.rows[0]
    return row === undefined ? undefined : projectDetailRow(row)
  },

  async loadCapturedPublications(identities) {
    const unique = new Map<string, ChartReportReviewPublicationIdentity>()
    for (const identity of identities) {
      const normalized = normalizeChartReportPublicationIdentity(identity)
      unique.set(chartReportReviewPublicationKey(normalized), normalized)
    }
    if (unique.size === 0) return new Map()

    const requested = [...unique.values()]
    const result = await database.query<PublicationRow>(
      `
        /* chart-report-review-store:captured-publications */
        WITH requested AS MATERIALIZED (
          SELECT request.channel,
                 request.catalog_run_id,
                 request.revision,
                 request.fingerprint_sha256
          FROM unnest($1::text[], $2::bigint[], $3::bigint[], $4::text[])
            AS request(channel, catalog_run_id, revision, fingerprint_sha256)
        )
        SELECT
          receipt.channel,
          receipt.catalog_run_id::text AS catalog_run_id,
          receipt.revision::text AS publication_revision,
          receipt.publication_fingerprint_sha256,
          ${exactUtcMicrosecondsSql('receipt.published_at')} AS published_at_utc,
          snapshot.body_text
        FROM requested
        INNER JOIN dxdata.catalog_publication_receipts receipt
          ON receipt.channel = requested.channel
          AND receipt.catalog_run_id = requested.catalog_run_id
          AND receipt.revision = requested.revision
          AND receipt.publication_fingerprint_sha256 = requested.fingerprint_sha256
        INNER JOIN dxdata.catalog_snapshots snapshot
          ON snapshot.catalog_run_id = receipt.catalog_run_id
          AND snapshot.body_sha256 = receipt.publication_fingerprint_sha256
          AND snapshot.api_schema_version = $5::integer
      `,
      [
        requested.map((identity) => identity.channel),
        requested.map((identity) => identity.catalogRunId),
        requested.map((identity) => identity.revision),
        requested.map((identity) => identity.fingerprintSha256),
        DXDATA_API_SCHEMA_VERSION,
      ],
    )

    const snapshots = new Map<string, StoredChartReportPublicationSnapshot>()
    for (const row of result.rows) {
      const snapshot = projectPublicationRow(row)
      const key = chartReportReviewPublicationKey(snapshot.publication)
      if (!unique.has(key) || snapshots.has(key)) {
        throw new Error('Inconsistent captured chart-report publication projection')
      }
      snapshots.set(key, snapshot)
    }
    return snapshots
  },

  async loadActivePublication(channel) {
    const result = await database.query<PublicationRow>(
      `
        /* chart-report-review-store:active-publication */
        SELECT
          publication.channel,
          publication.catalog_run_id::text AS catalog_run_id,
          publication.revision::text AS publication_revision,
          publication.publication_fingerprint_sha256,
          ${exactUtcMicrosecondsSql('receipt.published_at')} AS published_at_utc,
          snapshot.body_text
        FROM dxdata.catalog_publications publication
        INNER JOIN dxdata.catalog_publication_receipts receipt
          ON receipt.channel = publication.channel
          AND receipt.catalog_run_id = publication.catalog_run_id
          AND receipt.revision = publication.revision
          AND receipt.publication_fingerprint_sha256 = publication.publication_fingerprint_sha256
        INNER JOIN dxdata.catalog_snapshots snapshot
          ON snapshot.catalog_run_id = receipt.catalog_run_id
          AND snapshot.body_sha256 = receipt.publication_fingerprint_sha256
          AND snapshot.api_schema_version = $2::integer
        INNER JOIN dxdata.catalog_build_runs build
          ON build.id = publication.catalog_run_id
          AND build.status = 'published'
          AND build.api_schema_version = $2::integer
        WHERE publication.channel = $1
        LIMIT 1
      `,
      [channel, DXDATA_API_SCHEMA_VERSION],
    )
    const row = result.rows[0]
    return row === undefined ? undefined : projectPublicationRow(row)
  },
})