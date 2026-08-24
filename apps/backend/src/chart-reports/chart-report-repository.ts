import type { QueryResultRow } from 'pg'
import { pool } from '../db/index.js'
import {
  normalizeChartReportCloseNote,
  normalizeChartReportId,
  normalizeChartReportUserId,
  normalizeNewChartReport,
  normalizeStoredChartReport,
  type NewChartReport,
  type StoredChartReport,
} from './chart-report-domain.js'

export type CloseOpenChartReport = {
  readonly reportId: string
  readonly actorUserId: string
  readonly internalNote: string | null
}

export type ChartReportDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ readonly rows: Row[] }>
}

/**
 * Intentionally narrow persistence boundary. Submitted content has no update,
 * delete, merge, assignment, or deduplication operation; closure is the only
 * state mutation.
 */
export interface ChartReportRepository {
  /**
   * Persists an already server-resolved publication snapshot. The API caller
   * must bind this repository to the same transaction that resolved the active
   * producer-owned catalog pointer; client publication metadata is never an
   * authority for this method.
   */
  create(report: NewChartReport): Promise<StoredChartReport>
  findById(reportId: string): Promise<StoredChartReport | undefined>
  closeOpen(input: CloseOpenChartReport): Promise<StoredChartReport | undefined>
}

type ChartReportRow = {
  readonly id: string
  readonly reporter_user_id: string
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
  readonly source_urls: unknown
  readonly state: string
  readonly created_at: Date
  readonly closed_by_user_id: string | null
  readonly closed_at: Date | null
  readonly close_note: string | null
}

const REPORT_COLUMNS = `
  id::text AS id,
  reporter_user_id,
  stable_song_id,
  stable_chart_id,
  publication_channel,
  publication_catalog_run_id::text AS publication_catalog_run_id,
  publication_revision::text AS publication_revision,
  publication_fingerprint_sha256,
  target_field_key,
  category,
  current_value,
  proposed_value,
  explanation,
  source_urls,
  state,
  created_at,
  closed_by_user_id,
  closed_at,
  close_note
`

const projectRow = (row: ChartReportRow): StoredChartReport => {
  const closureFields = [row.closed_by_user_id, row.closed_at, row.close_note]
  const hasClosureIdentity = row.closed_by_user_id !== null || row.closed_at !== null
  if (!Array.isArray(row.source_urls) || !row.source_urls.every((value) => typeof value === 'string')) {
    throw new Error('Stored chart-report source URLs are invalid')
  }
  if (!hasClosureIdentity && closureFields.some((value) => value !== null)) {
    throw new Error('Stored chart-report closure is incomplete')
  }

  return normalizeStoredChartReport({
    id: row.id,
    reporterUserId: row.reporter_user_id,
    chart: {
      stableSongId: row.stable_song_id,
      stableChartId: row.stable_chart_id,
    },
    publication: {
      channel: row.publication_channel as 'production-v1',
      catalogRunId: row.publication_catalog_run_id,
      revision: row.publication_revision,
      fingerprintSha256: row.publication_fingerprint_sha256,
    },
    fieldKey: row.target_field_key as StoredChartReport['fieldKey'],
    category: row.category as StoredChartReport['category'],
    currentValue: row.current_value as StoredChartReport['currentValue'],
    proposedValue: row.proposed_value as StoredChartReport['proposedValue'],
    explanation: row.explanation,
    sourceUrls: row.source_urls,
    createdAt: row.created_at,
    state: row.state as StoredChartReport['state'],
    closure: hasClosureIdentity
      ? {
          actorUserId: row.closed_by_user_id as string,
          closedAt: row.closed_at as Date,
          internalNote: row.close_note,
        }
      : null,
  })
}

export const createPostgresChartReportRepository = (
  database: ChartReportDatabase = pool as ChartReportDatabase,
): ChartReportRepository => ({
  async create(report) {
    const normalized = normalizeNewChartReport(report)
    const result = await database.query<ChartReportRow>(
      `
        /* chart-report-repository:create-independent-report */
        INSERT INTO public.chart_reports (
          id,
          reporter_user_id,
          stable_song_id,
          stable_chart_id,
          publication_channel,
          publication_catalog_run_id,
          publication_revision,
          publication_fingerprint_sha256,
          target_field_key,
          category,
          current_value,
          proposed_value,
          explanation,
          source_urls,
          state
        ) VALUES (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6::bigint,
          $7::bigint,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::jsonb,
          $13,
          $14::text[],
          'open'
        )
        RETURNING ${REPORT_COLUMNS}
      `,
      [
        normalized.id,
        normalized.reporterUserId,
        normalized.chart.stableSongId,
        normalized.chart.stableChartId,
        normalized.publication.channel,
        normalized.publication.catalogRunId,
        normalized.publication.revision,
        normalized.publication.fingerprintSha256,
        normalized.fieldKey,
        normalized.category,
        JSON.stringify(normalized.currentValue),
        JSON.stringify(normalized.proposedValue),
        normalized.explanation,
        [...normalized.sourceUrls],
      ],
    )
    const row = result.rows[0]
    if (!row) throw new Error('PostgreSQL did not return the created chart report')
    return projectRow(row)
  },

  async findById(reportId) {
    const normalizedReportId = normalizeChartReportId(reportId)
    const result = await database.query<ChartReportRow>(
      `
        /* chart-report-repository:find-by-id */
        SELECT ${REPORT_COLUMNS}
        FROM public.chart_reports
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [normalizedReportId],
    )
    const row = result.rows[0]
    return row === undefined ? undefined : projectRow(row)
  },

  async closeOpen(input) {
    const reportId = normalizeChartReportId(input.reportId)
    const actorUserId = normalizeChartReportUserId(input.actorUserId)
    const internalNote = normalizeChartReportCloseNote(input.internalNote)
    const result = await database.query<ChartReportRow>(
      `
        /* chart-report-repository:close-open */
        UPDATE public.chart_reports
        SET
          state = 'closed',
          closed_by_user_id = $2,
          closed_at = clock_timestamp(),
          close_note = $3
        WHERE id = $1::uuid
          AND state = 'open'
        RETURNING ${REPORT_COLUMNS}
      `,
      [reportId, actorUserId, internalNote],
    )
    const row = result.rows[0]
    return row === undefined ? undefined : projectRow(row)
  },
})