import { randomUUID } from 'node:crypto'
import {
  ChartReportDomainFailure,
  normalizeChartReportCategoryKey,
  normalizeChartReportCloseNote,
  normalizeChartReportFieldKey,
  normalizeChartReportId,
  normalizeChartReportIdentity,
  normalizeChartReportJsonSnapshot,
  normalizeChartReportPublicationIdentity,
  normalizeChartReportSourceUrls,
  normalizeChartReportUserId,
  normalizeChartReportExplanation,
  normalizeNewChartReport,
  type ChartReportIdentity,
  type ChartReportPublicationIdentity,
  type StoredChartReport,
} from './chart-report-domain.js'
import type { ChartReportRepository } from './chart-report-repository.js'

export type ChartReportServiceFailureCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'CONFLICT'

export class ChartReportServiceFailure extends Error {
  readonly code: ChartReportServiceFailureCode

  constructor(code: ChartReportServiceFailureCode, options?: ErrorOptions) {
    super('Chart report operation failed', options)
    this.name = 'ChartReportServiceFailure'
    this.code = code
  }
}

export type CreateChartReportInput = {
  /** Always resolved from the authenticated session by the caller. */
  readonly reporterUserId: unknown
  /** Always resolved from the published catalog by the caller. */
  readonly chart: unknown
  /** Always resolved from the active publication by the caller. */
  readonly publication: unknown
  readonly fieldKey: unknown
  readonly category: unknown
  /** Server-validated value from the captured publication, not trusted client data. */
  readonly currentValue: unknown
  readonly proposedValue: unknown
  readonly explanation: unknown
  readonly sourceUrls: unknown
}

export type CloseChartReportInput = {
  readonly reportId: unknown
  /** Always resolved from the authenticated administrator session. */
  readonly actorUserId: unknown
  readonly expectedState: unknown
  readonly internalNote?: unknown
}

export type CloseChartReportResult = {
  readonly report: StoredChartReport
  readonly applied: boolean
}

export interface ChartReportService {
  createReport(input: CreateChartReportInput): Promise<StoredChartReport>
  getReport(reportId: unknown): Promise<StoredChartReport>
  closeReport(input: CloseChartReportInput): Promise<CloseChartReportResult>
}

const validationFailure = (cause?: unknown) =>
  new ChartReportServiceFailure('VALIDATION_FAILED', cause === undefined ? undefined : { cause })

const normalizeForService = <Value>(operation: () => Value): Value => {
  try {
    return operation()
  } catch (error) {
    if (error instanceof ChartReportDomainFailure) throw validationFailure(error)
    throw error
  }
}

export const createChartReportService = ({
  repository,
  generateReportId = randomUUID,
}: {
  readonly repository: ChartReportRepository
  readonly generateReportId?: () => string
}): ChartReportService => ({
  async createReport(input) {
    const report = normalizeForService(() => {
      const fieldKey = normalizeChartReportFieldKey(input.fieldKey)
      return normalizeNewChartReport({
        id: normalizeChartReportId(generateReportId()),
        reporterUserId: normalizeChartReportUserId(input.reporterUserId),
        chart: normalizeChartReportIdentity(input.chart) as ChartReportIdentity,
        publication: normalizeChartReportPublicationIdentity(input.publication) as ChartReportPublicationIdentity,
        fieldKey,
        category: normalizeChartReportCategoryKey(input.category),
        currentValue: normalizeChartReportJsonSnapshot(fieldKey, input.currentValue),
        proposedValue: normalizeChartReportJsonSnapshot(fieldKey, input.proposedValue),
        explanation: normalizeChartReportExplanation(input.explanation),
        sourceUrls: normalizeChartReportSourceUrls(input.sourceUrls),
      })
    })
    // There is deliberately no semantic lookup or duplicate suppression here.
    return repository.create(report)
  },

  async getReport(rawReportId) {
    const reportId = normalizeForService(() => normalizeChartReportId(rawReportId))
    const report = await repository.findById(reportId)
    if (!report) throw new ChartReportServiceFailure('NOT_FOUND')
    return report
  },

  async closeReport(input) {
    const normalized = normalizeForService(() => {
      if (input.expectedState !== 'open') throw validationFailure()
      return {
        reportId: normalizeChartReportId(input.reportId),
        actorUserId: normalizeChartReportUserId(input.actorUserId),
        internalNote: normalizeChartReportCloseNote(input.internalNote),
      }
    })

    const applied = await repository.closeOpen(normalized)
    if (applied) return Object.freeze({ report: applied, applied: true })

    const existing = await repository.findById(normalized.reportId)
    if (!existing) throw new ChartReportServiceFailure('NOT_FOUND')
    if (
      existing.state === 'closed' &&
      existing.closure?.actorUserId === normalized.actorUserId &&
      existing.closure.internalNote === normalized.internalNote
    ) {
      return Object.freeze({ report: existing, applied: false })
    }
    throw new ChartReportServiceFailure('CONFLICT')
  },
})