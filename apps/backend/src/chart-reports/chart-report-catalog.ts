import { PublishedDxdataCatalogSchema } from '../services/dxdata-openapi.js'
import {
  ChartReportDomainFailure,
  CHART_REPORT_PRODUCTION_CHANNEL,
  normalizeChartReportFieldKey,
  normalizeChartReportIdentity,
  normalizeChartReportJsonSnapshot,
  normalizeChartReportPublicationIdentity,
  type ChartReportFieldKey,
  type ChartReportIdentity,
  type ChartReportJsonSnapshot,
  type ChartReportPublicationIdentity,
} from './chart-report-domain.js'
import type { ChartReportDatabase } from './chart-report-repository.js'

const DXDATA_API_SCHEMA_VERSION = 1

export type ResolvedActiveChartReportField = {
  readonly chart: ChartReportIdentity
  readonly publication: ChartReportPublicationIdentity
  readonly currentValue: ChartReportJsonSnapshot
}

export type ChartReportCatalogFailureCode = 'CATALOG_UNAVAILABLE' | 'CHART_NOT_FOUND'

export class ChartReportCatalogFailure extends Error {
  readonly code: ChartReportCatalogFailureCode
  readonly activePublicationRevision: string | undefined

  constructor(code: ChartReportCatalogFailureCode, activePublicationRevision?: string, options?: ErrorOptions) {
    super('Published chart catalog could not resolve the report target', options)
    this.name = 'ChartReportCatalogFailure'
    this.code = code
    this.activePublicationRevision = activePublicationRevision
  }
}

type PublishedCatalogRow = {
  readonly channel: unknown
  readonly catalog_run_id: unknown
  readonly publication_revision: unknown
  readonly publication_fingerprint_sha256: unknown
  readonly body_text: unknown
}

const requirePublishedCatalogRow = (
  value: PublishedCatalogRow,
): {
  readonly publication: ChartReportPublicationIdentity
  readonly bodyText: string
} => {
  if (
    typeof value.channel !== 'string' ||
    typeof value.catalog_run_id !== 'string' ||
    typeof value.publication_revision !== 'string' ||
    typeof value.publication_fingerprint_sha256 !== 'string' ||
    typeof value.body_text !== 'string'
  ) {
    throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE')
  }

  try {
    return {
      publication: normalizeChartReportPublicationIdentity({
        channel: value.channel,
        catalogRunId: value.catalog_run_id,
        revision: value.publication_revision,
        fingerprintSha256: value.publication_fingerprint_sha256,
      }),
      bodyText: value.body_text,
    }
  } catch (error) {
    throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE', undefined, { cause: error })
  }
}

type PublishedCatalog = ReturnType<typeof PublishedDxdataCatalogSchema.parse>
type PublishedSong = PublishedCatalog['songs'][number]
type PublishedChart = PublishedSong['sheets'][number]

const readChartReportField = (song: PublishedSong, chart: PublishedChart, fieldKey: ChartReportFieldKey): unknown => {
  switch (fieldKey) {
    case 'song.title':
      return song.title
    case 'song.artist':
      return song.artist
    case 'song.category':
      return song.category
    case 'song.bpm':
      return song.bpm ?? null
    case 'song.image_name':
      return song.imageName
    case 'song.is_new':
      return song.isNew
    case 'song.is_locked':
      return song.isLocked
    case 'song.version':
      return song.version
    case 'chart.type':
      return chart.type
    case 'chart.difficulty':
      return chart.difficulty
    case 'chart.level':
      return chart.level
    case 'chart.internal_level':
      return chart.internalLevelValue
    case 'chart.multiver_internal_levels':
      return chart.multiverInternalLevelValue ?? null
    case 'chart.note_designer':
      return chart.noteDesigner ?? null
    case 'chart.note_counts.tap':
      return chart.noteCounts.tap ?? null
    case 'chart.note_counts.hold':
      return chart.noteCounts.hold ?? null
    case 'chart.note_counts.slide':
      return chart.noteCounts.slide ?? null
    case 'chart.note_counts.touch':
      return chart.noteCounts.touch ?? null
    case 'chart.note_counts.break':
      return chart.noteCounts.break ?? null
    case 'chart.note_counts.total':
      return chart.noteCounts.total ?? null
    case 'chart.regions.jp':
      return chart.serverIds.includes('jp')
    case 'chart.regions.intl':
      return chart.serverIds.includes('intl')
    case 'chart.regions.cn':
      return chart.serverIds.includes('cn')
    case 'chart.version':
      return chart.version
    case 'chart.release_date':
      return chart.releaseDate ?? null
    case 'chart.internal_id':
      return chart.internalId ?? null
    case 'chart.is_special':
      return chart.isSpecial
    case 'chart.comment':
      return chart.comment ?? null
  }
}

export interface ChartReportCatalogResolver {
  resolveActiveField(input: {
    readonly stableSongId: unknown
    readonly stableChartId: unknown
    readonly fieldKey: unknown
  }): Promise<ResolvedActiveChartReportField>
}

export const createPostgresChartReportCatalogResolver = (
  database: ChartReportDatabase,
): ChartReportCatalogResolver => ({
  async resolveActiveField(input) {
    let chartIdentity: ChartReportIdentity
    let fieldKey: ChartReportFieldKey
    try {
      chartIdentity = normalizeChartReportIdentity({
        stableSongId: input.stableSongId,
        stableChartId: input.stableChartId,
      })
      fieldKey = normalizeChartReportFieldKey(input.fieldKey)
    } catch (error) {
      if (error instanceof ChartReportDomainFailure) throw error
      throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE', undefined, { cause: error })
    }

    let result: { readonly rows: PublishedCatalogRow[] }
    try {
      result = await database.query<PublishedCatalogRow>(
        `
          /* chart-report-catalog:lock-active-immutable-publication */
          SELECT publication.channel,
                 publication.catalog_run_id::text AS catalog_run_id,
                 publication.revision::text AS publication_revision,
                 publication.publication_fingerprint_sha256,
                 snapshot.body_text
          FROM dxdata.catalog_publications AS publication
          INNER JOIN dxdata.catalog_publication_receipts AS receipt
            ON receipt.channel = publication.channel
            AND receipt.catalog_run_id = publication.catalog_run_id
            AND receipt.revision = publication.revision
            AND receipt.publication_fingerprint_sha256 = publication.publication_fingerprint_sha256
          INNER JOIN dxdata.catalog_snapshots AS snapshot
            ON snapshot.catalog_run_id = publication.catalog_run_id
          INNER JOIN dxdata.catalog_build_runs AS catalog_run
            ON catalog_run.id = publication.catalog_run_id
          WHERE publication.channel = $1
            AND catalog_run.status = 'published'
            AND catalog_run.api_schema_version = $2
            AND snapshot.api_schema_version = $2
          LIMIT 1
          FOR SHARE OF publication
        `,
        [CHART_REPORT_PRODUCTION_CHANNEL, DXDATA_API_SCHEMA_VERSION],
      )
    } catch (error) {
      throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE', undefined, { cause: error })
    }

    const row = result.rows[0]
    if (!row) throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE')
    const { publication, bodyText } = requirePublishedCatalogRow(row)

    let catalog: PublishedCatalog
    try {
      catalog = PublishedDxdataCatalogSchema.parse(JSON.parse(bodyText))
    } catch (error) {
      throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE', publication.revision, { cause: error })
    }

    const song = catalog.songs.find((candidate) => candidate.id === chartIdentity.stableSongId)
    const chart = song?.sheets.find((candidate) => candidate.id === chartIdentity.stableChartId)
    if (!song || !chart) throw new ChartReportCatalogFailure('CHART_NOT_FOUND', publication.revision)

    try {
      return Object.freeze({
        chart: chartIdentity,
        publication,
        currentValue: normalizeChartReportJsonSnapshot(fieldKey, readChartReportField(song, chart, fieldKey)),
      })
    } catch (error) {
      throw new ChartReportCatalogFailure('CATALOG_UNAVAILABLE', publication.revision, { cause: error })
    }
  },
})