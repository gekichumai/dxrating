import {
  ChartReportDomainFailure,
  normalizeChartReportCategoryKey,
  normalizeChartReportExplanation,
  normalizeChartReportFieldKey,
  normalizeChartReportIdentity,
  normalizeChartReportJsonSnapshot,
  type ChartReportJsonSnapshot,
} from './chart-report-domain.js'
import {
  ChartReportCatalogFailure,
  type ChartReportCatalogResolver,
  type ResolvedActiveChartReportField,
} from './chart-report-catalog.js'
import type { ChartReportService } from './chart-report-service.js'
import { ChartReportSourceUrlFailure, normalizePublicChartReportSourceUrls } from './chart-report-source-url.js'
import type { ChartReportTurnstileVerifier } from './chart-report-turnstile.js'

export type CreatePublicChartReportInput = {
  readonly songId: unknown
  readonly chartId: unknown
  readonly fieldKey: unknown
  readonly category: unknown
  readonly publicationRevision: unknown
  readonly currentValue: unknown
  readonly proposedValue: unknown
  readonly explanation: unknown
  readonly sourceUrls: unknown
  readonly turnstileToken: unknown
}

export type ChartReportSubmissionFailureCode =
  | 'VALIDATION_FAILED'
  | 'TURNSTILE_REJECTED'
  | 'TURNSTILE_UNAVAILABLE'
  | 'STALE_PUBLICATION'
  | 'CATALOG_UNAVAILABLE'

export class ChartReportSubmissionFailure extends Error {
  readonly code: ChartReportSubmissionFailureCode
  readonly activePublicationRevision: string | undefined

  constructor(code: ChartReportSubmissionFailureCode, activePublicationRevision?: string, options?: ErrorOptions) {
    super('Chart report submission failed', options)
    this.name = 'ChartReportSubmissionFailure'
    this.code = code
    this.activePublicationRevision = activePublicationRevision
  }
}

export type PublicChartReportReceipt = {
  readonly id: string
  readonly state: 'open'
  readonly createdAt: string
}

const snapshotsEqual = (left: ChartReportJsonSnapshot, right: ChartReportJsonSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const stale = (resolved: ResolvedActiveChartReportField): never => {
  throw new ChartReportSubmissionFailure('STALE_PUBLICATION', resolved.publication.revision)
}

export const createChartReportSubmissionService = ({
  catalog,
  reports,
  turnstile,
}: {
  readonly catalog: ChartReportCatalogResolver
  readonly reports: Pick<ChartReportService, 'createReport'>
  readonly turnstile: ChartReportTurnstileVerifier
}) => ({
  async create(reporterUserId: string, input: CreatePublicChartReportInput): Promise<PublicChartReportReceipt> {
    let normalized: {
      readonly chart: ReturnType<typeof normalizeChartReportIdentity>
      readonly fieldKey: ReturnType<typeof normalizeChartReportFieldKey>
      readonly category: ReturnType<typeof normalizeChartReportCategoryKey>
      readonly publicationRevision: string
      readonly currentValue: ChartReportJsonSnapshot
      readonly proposedValue: ChartReportJsonSnapshot
      readonly explanation: string
      readonly sourceUrls: readonly string[]
    }
    try {
      const chart = normalizeChartReportIdentity({ stableSongId: input.songId, stableChartId: input.chartId })
      const fieldKey = normalizeChartReportFieldKey(input.fieldKey)
      if (typeof input.publicationRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(input.publicationRevision)) {
        throw new ChartReportDomainFailure('INVALID_PUBLICATION_IDENTITY')
      }
      const publicationRevision = BigInt(input.publicationRevision)
      if (publicationRevision > 9_223_372_036_854_775_807n) {
        throw new ChartReportDomainFailure('INVALID_PUBLICATION_IDENTITY')
      }
      normalized = {
        chart,
        fieldKey,
        category: normalizeChartReportCategoryKey(input.category),
        publicationRevision: publicationRevision.toString(),
        currentValue: normalizeChartReportJsonSnapshot(fieldKey, input.currentValue),
        proposedValue: normalizeChartReportJsonSnapshot(fieldKey, input.proposedValue),
        explanation: normalizeChartReportExplanation(input.explanation),
        sourceUrls: normalizePublicChartReportSourceUrls(input.sourceUrls),
      }
    } catch (error) {
      if (error instanceof ChartReportDomainFailure || error instanceof ChartReportSourceUrlFailure) {
        throw new ChartReportSubmissionFailure('VALIDATION_FAILED', undefined, { cause: error })
      }
      throw error
    }

    const verification = await turnstile.verify(input.turnstileToken)
    if (!verification.ok) {
      throw new ChartReportSubmissionFailure(
        verification.category === 'REJECTED' ? 'TURNSTILE_REJECTED' : 'TURNSTILE_UNAVAILABLE',
      )
    }

    let resolved: ResolvedActiveChartReportField
    try {
      resolved = await catalog.resolveActiveField({
        stableSongId: normalized.chart.stableSongId,
        stableChartId: normalized.chart.stableChartId,
        fieldKey: normalized.fieldKey,
      })
    } catch (error) {
      if (error instanceof ChartReportCatalogFailure) {
        if (error.code === 'CHART_NOT_FOUND' && error.activePublicationRevision) {
          throw new ChartReportSubmissionFailure('STALE_PUBLICATION', error.activePublicationRevision, {
            cause: error,
          })
        }
        throw new ChartReportSubmissionFailure('CATALOG_UNAVAILABLE', undefined, { cause: error })
      }
      throw error
    }

    if (normalized.publicationRevision !== resolved.publication.revision) stale(resolved)
    if (!snapshotsEqual(normalized.currentValue, resolved.currentValue)) stale(resolved)

    const report = await reports.createReport({
      reporterUserId,
      chart: resolved.chart,
      publication: resolved.publication,
      fieldKey: normalized.fieldKey,
      category: normalized.category,
      currentValue: resolved.currentValue,
      proposedValue: normalized.proposedValue,
      explanation: normalized.explanation,
      sourceUrls: normalized.sourceUrls,
    })
    if (report.state !== 'open') throw new Error('A newly created chart report did not remain open')
    return Object.freeze({ id: report.id, state: report.state, createdAt: report.createdAt.toISOString() })
  },
})