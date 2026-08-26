import { createHash } from 'node:crypto'
import {
  ADMIN_CHART_REPORT_DEFAULT_LIMIT,
  ADMIN_CHART_REPORT_MAX_LIMIT,
  ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH,
  type AdminContractInputs,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import {
  ChartReportDomainFailure,
  normalizeChartReportCategoryKey,
  normalizeChartReportFieldKey,
  normalizeChartReportId,
  normalizeChartReportUserId,
} from '../chart-reports/chart-report-domain.js'
import { createPostgresChartReportRepository } from '../chart-reports/chart-report-repository.js'
import {
  ChartReportServiceFailure,
  createChartReportService,
  type ChartReportService,
} from '../chart-reports/chart-report-service.js'
import {
  prepareChartReportReviewCatalogSnapshot,
  resolveChartReportReviewContext,
  type ChartReportReviewContext,
  type PreparedChartReportReviewCatalogSnapshot,
} from './chart-report-review-context.js'
import {
  chartReportReviewPublicationKey,
  createPostgresChartReportReviewStore,
  type ChartReportReviewFilters,
  type ChartReportReviewStore,
  type StoredChartReportReviewDetail,
  type StoredChartReportReviewQueueItem,
} from './chart-report-review-store.js'
import { resolveEffectiveRole } from './role-policy.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

const MAXIMUM_SIGNED_BIGINT = 9_223_372_036_854_775_807n
const MAXIMUM_CATALOGS_PER_REVIEW_BATCH = 4
const UTC_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const PUBLIC_CHART_ID_PATTERN = /^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$/

export type ChartReportReviewServiceFailureCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'CHART_UNAVAILABLE'
  | 'CONFLICT'

export class ChartReportReviewServiceFailure extends Error {
  readonly code: ChartReportReviewServiceFailureCode

  constructor(code: ChartReportReviewServiceFailureCode, options?: ErrorOptions) {
    super('Administrator chart-report review request failed', options)
    this.name = 'ChartReportReviewServiceFailure'
    this.code = code
  }
}

export type ListChartReportsInput = AdminContractInputs['listChartReports']['query']
export type ListChartReportsOutput = AdminContractOutputs['listChartReports']
export type GetChartReportDetailOutput = AdminContractOutputs['getChartReportDetail']
export type CloseChartReportOutput = AdminContractOutputs['closeChartReport']

export type GetChartReportDetailInput = { readonly reportId: unknown }
export type CloseChartReportInput = {
  readonly reportId: unknown
  /** Resolved from the authenticated administrator principal, never from the request body. */
  readonly actorUserId: unknown
  readonly expectedState: unknown
  readonly internalNote?: unknown
}

export interface ChartReportReviewService {
  listChartReports(input: ListChartReportsInput): Promise<ListChartReportsOutput>
  getChartReportDetail(input: GetChartReportDetailInput): Promise<GetChartReportDetailOutput>
  closeChartReport(input: CloseChartReportInput): Promise<CloseChartReportOutput>
}

type NormalizedFilters = ListChartReportsOutput['normalizedFilters']
type ReporterSummary = ListChartReportsOutput['items'][number]['reporter']
type ChartSummary = ListChartReportsOutput['items'][number]['chart']

type CursorPayload = {
  readonly version: 1
  readonly filterDigest: string
  readonly asOf: string
  readonly isOpen: boolean
  readonly createdAt: string
  readonly id: string
}

const failure = (code: ChartReportReviewServiceFailureCode, cause?: unknown) =>
  new ChartReportReviewServiceFailure(code, cause === undefined ? undefined : { cause })

const normalizeDomainValue = <Value>(operation: () => Value): Value => {
  try {
    return operation()
  } catch (error) {
    if (error instanceof ChartReportDomainFailure) throw failure('VALIDATION_FAILED', error)
    throw error
  }
}

const normalizeNullable = <Value>(value: unknown, normalize: (candidate: unknown) => Value): Value | null =>
  value === undefined || value === null ? null : normalize(value)

const normalizeChartId = (value: unknown): string => {
  if (typeof value !== 'string' || !PUBLIC_CHART_ID_PATTERN.test(value)) throw failure('VALIDATION_FAILED')
  return value
}

const normalizeRevision = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || value.length > 19) {
    throw failure('VALIDATION_FAILED')
  }
  try {
    if (BigInt(value) > MAXIMUM_SIGNED_BIGINT) throw failure('VALIDATION_FAILED')
  } catch (error) {
    if (error instanceof ChartReportReviewServiceFailure) throw error
    throw failure('VALIDATION_FAILED', error)
  }
  return value
}

const normalizeDateBound = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw failure('VALIDATION_FAILED')
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw failure('VALIDATION_FAILED')
  return parsed.toISOString()
}

const normalizeFilters = (input: ListChartReportsInput): NormalizedFilters => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('VALIDATION_FAILED')
  const raw = input as Record<string, unknown>
  const normalized: NormalizedFilters = {
    state: normalizeNullable(raw.state, (value) => {
      if (value !== 'open' && value !== 'closed') throw failure('VALIDATION_FAILED')
      return value
    }),
    chartId: normalizeNullable(raw.chartId, normalizeChartId),
    fieldKey: normalizeNullable(raw.fieldKey, (value) =>
      normalizeDomainValue(() => normalizeChartReportFieldKey(value)),
    ),
    category: normalizeNullable(raw.category, (value) =>
      normalizeDomainValue(() => normalizeChartReportCategoryKey(value)),
    ),
    reporterUserId: normalizeNullable(raw.reporterUserId, (value) =>
      normalizeDomainValue(() => normalizeChartReportUserId(value)),
    ),
    submittedAtFromInclusive: normalizeNullable(raw.submittedAtFromInclusive, normalizeDateBound),
    submittedAtBeforeExclusive: normalizeNullable(raw.submittedAtBeforeExclusive, normalizeDateBound),
    publicationRevision: normalizeNullable(raw.publicationRevision, normalizeRevision),
  }
  if (
    normalized.submittedAtFromInclusive !== null &&
    normalized.submittedAtBeforeExclusive !== null &&
    Date.parse(normalized.submittedAtFromInclusive) >= Date.parse(normalized.submittedAtBeforeExclusive)
  ) {
    throw failure('VALIDATION_FAILED')
  }
  return normalized
}

const normalizeLimit = (value: unknown): number => {
  const limit = value ?? ADMIN_CHART_REPORT_DEFAULT_LIMIT
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > ADMIN_CHART_REPORT_MAX_LIMIT) {
    throw failure('VALIDATION_FAILED')
  }
  return limit as number
}

const filtersForStore = (filters: NormalizedFilters): ChartReportReviewFilters => ({
  ...(filters.state === null ? {} : { state: filters.state }),
  ...(filters.chartId === null ? {} : { stableChartId: filters.chartId }),
  ...(filters.fieldKey === null ? {} : { fieldKey: filters.fieldKey }),
  ...(filters.category === null ? {} : { category: filters.category }),
  ...(filters.reporterUserId === null ? {} : { reporterUserId: filters.reporterUserId }),
  ...(filters.submittedAtFromInclusive === null ? {} : { createdAtFrom: filters.submittedAtFromInclusive }),
  ...(filters.submittedAtBeforeExclusive === null ? {} : { createdAtBefore: filters.submittedAtBeforeExclusive }),
  ...(filters.publicationRevision === null ? {} : { publicationRevision: filters.publicationRevision }),
})

/** The array fixes filter order independently of object insertion order. */
const digestFilters = (filters: NormalizedFilters): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        filters.state,
        filters.chartId,
        filters.fieldKey,
        filters.category,
        filters.reporterUserId,
        filters.submittedAtFromInclusive,
        filters.submittedAtBeforeExclusive,
        filters.publicationRevision,
      ]),
    )
    .digest('hex')

const encodeCursor = (item: StoredChartReportReviewQueueItem, filterDigest: string, asOf: string): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      filterDigest,
      asOf,
      isOpen: item.state === 'open',
      createdAt: item.createdAt,
      id: item.id,
    } satisfies CursorPayload),
  ).toString('base64url')

const isCanonicalUtcInstant = (value: string, microsecondsRequired = false): boolean => {
  const pattern = microsecondsRequired ? UTC_MICROSECOND_PATTERN : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  if (!pattern.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === `${value.slice(0, 23)}Z`
}

const decodeCursor = (
  value: unknown,
  expectedFilterDigest: string,
  expectedState: NormalizedFilters['state'],
): CursorPayload => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw failure('INVALID_CURSOR')
  }
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    if (Buffer.from(decoded).toString('base64url') !== value) throw failure('INVALID_CURSOR')
    const payload = JSON.parse(decoded) as Partial<CursorPayload>
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 6 ||
      payload.version !== 1 ||
      payload.filterDigest !== expectedFilterDigest ||
      typeof payload.asOf !== 'string' ||
      !isCanonicalUtcInstant(payload.asOf) ||
      typeof payload.isOpen !== 'boolean' ||
      typeof payload.createdAt !== 'string' ||
      !isCanonicalUtcInstant(payload.createdAt, true) ||
      (expectedState === 'open' && !payload.isOpen) ||
      (expectedState === 'closed' && payload.isOpen) ||
      typeof payload.id !== 'string'
    ) {
      throw failure('INVALID_CURSOR')
    }
    return {
      version: 1,
      filterDigest: payload.filterDigest,
      asOf: payload.asOf,
      isOpen: payload.isOpen,
      createdAt: payload.createdAt,
      id: normalizeDomainValue(() => normalizeChartReportId(payload.id)),
    }
  } catch (error) {
    if (error instanceof ChartReportReviewServiceFailure) {
      throw error.code === 'VALIDATION_FAILED' ? failure('INVALID_CURSOR', error) : error
    }
    throw failure('INVALID_CURSOR', error)
  }
}

const truncateUtf16 = (
  value: string,
  maximumLength: number,
): { readonly text: string; readonly truncated: boolean } => {
  if (value.length <= maximumLength) return { text: value, truncated: false }
  let text = ''
  for (const character of value) {
    if (text.length + character.length > maximumLength) break
    text += character
  }
  return { text, truncated: true }
}

const serializePreviewValue = (value: StoredChartReportReviewQueueItem['currentValue']): string =>
  value !== null && typeof value === 'object'
    ? JSON.stringify(
        Object.fromEntries(Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))),
      )
    : JSON.stringify(value)

const previewValue = (value: StoredChartReportReviewQueueItem['currentValue']) =>
  truncateUtf16(serializePreviewValue(value), ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH)

const chartSummary = (context: ChartReportReviewContext): ChartSummary => {
  if (context.captured.status !== 'captured') throw failure('CHART_UNAVAILABLE')
  return {
    songId: context.captured.song.id,
    chartId: context.captured.chart.id,
    songLabel: context.captured.song.label,
    chartLabel: context.captured.chart.label,
  }
}

const reporterSummary = (
  reporter: StoredChartReportReviewQueueItem['reporter'],
  superAdministrators: SuperAdministratorAllowlist,
): ReporterSummary => ({
  userId: reporter.userId,
  displayName: reporter.displayName,
  emailVerified: reporter.emailVerified,
  effectiveRole: resolveEffectiveRole({ id: reporter.userId, role: reporter.persistedRole }, superAdministrators),
  accountStatus: !reporter.currentlyBanned
    ? { status: 'active' }
    : reporter.banExpiresAt === null
      ? { status: 'permanently_banned' }
      : { status: 'temporarily_banned', expiresAt: reporter.banExpiresAt },
})

const resolveCaptured = (
  report: StoredChartReportReviewQueueItem,
  capturedCatalog: Parameters<typeof resolveChartReportReviewContext>[0]['capturedCatalog'],
): ChartReportReviewContext => {
  const context = resolveChartReportReviewContext({
    report: {
      chart: { stableSongId: report.stableSongId, stableChartId: report.stableChartId },
      publication: report.publication,
      fieldKey: report.fieldKey,
      currentValue: report.currentValue,
    },
    capturedCatalog,
    activeCatalog: { availability: 'not_active' },
  })
  if (context.captured.status !== 'captured') throw failure('CHART_UNAVAILABLE')
  return context
}

const projectQueueItem = (
  report: StoredChartReportReviewQueueItem,
  context: ChartReportReviewContext,
  superAdministrators: SuperAdministratorAllowlist,
): ListChartReportsOutput['items'][number] => {
  const explanation = truncateUtf16(report.explanation, ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH)
  const currentValuePreview = previewValue(report.currentValue)
  const proposedValuePreview = previewValue(report.proposedValue)
  return {
    id: report.id,
    state: report.state,
    chart: chartSummary(context),
    fieldKey: report.fieldKey,
    category: report.category,
    currentValuePreview,
    proposedValuePreview,
    explanationPreview: explanation.text,
    explanationPreviewTruncated: explanation.truncated,
    createdAt: report.createdAt,
    capturedPublication: report.publication,
    reporter: reporterSummary(report.reporter, superAdministrators),
  }
}

const capturedSnapshot = (
  snapshots: ReadonlyMap<string, PreparedChartReportReviewCatalogSnapshot>,
  report: StoredChartReportReviewQueueItem,
) => snapshots.get(chartReportReviewPublicationKey(report.publication)) ?? null

const prepareCapturedSnapshots = (
  snapshots: Awaited<ReturnType<ChartReportReviewStore['loadCapturedPublications']>>,
): ReadonlyMap<string, PreparedChartReportReviewCatalogSnapshot> => {
  const prepared = new Map<string, PreparedChartReportReviewCatalogSnapshot>()
  for (const [key, snapshot] of snapshots) {
    prepared.set(key, prepareChartReportReviewCatalogSnapshot(snapshot))
  }
  return prepared
}

const projectQueuePage = async (
  reports: readonly StoredChartReportReviewQueueItem[],
  store: ChartReportReviewStore,
  superAdministrators: SuperAdministratorAllowlist,
): Promise<ListChartReportsOutput['items']> => {
  const groups = new Map<
    string,
    {
      readonly publication: StoredChartReportReviewQueueItem['publication']
      readonly entries: Array<{ readonly index: number; readonly report: StoredChartReportReviewQueueItem }>
    }
  >()
  reports.forEach((report, index) => {
    const key = chartReportReviewPublicationKey(report.publication)
    const group = groups.get(key)
    if (group) group.entries.push({ index, report })
    else groups.set(key, { publication: report.publication, entries: [{ index, report }] })
  })

  const projected: Array<ListChartReportsOutput['items'][number] | undefined> = new Array(reports.length)
  const publicationGroups = [...groups.values()]
  for (let offset = 0; offset < publicationGroups.length; offset += MAXIMUM_CATALOGS_PER_REVIEW_BATCH) {
    const batch = publicationGroups.slice(offset, offset + MAXIMUM_CATALOGS_PER_REVIEW_BATCH)
    const publications = prepareCapturedSnapshots(
      await store.loadCapturedPublications(batch.map(({ publication }) => publication)),
    )
    for (const group of batch) {
      for (const { index, report } of group.entries) {
        projected[index] = projectQueueItem(
          report,
          resolveCaptured(report, capturedSnapshot(publications, report)),
          superAdministrators,
        )
      }
    }
  }

  return projected.map((item) => {
    if (!item) throw new Error('Chart-report queue projection was incomplete')
    return item
  })
}

const projectClosure = (detail: StoredChartReportReviewDetail) =>
  detail.closure === null
    ? null
    : {
        actorUserId: detail.closure.actor.userId,
        closedAt: detail.closure.closedAt,
        internalNote: detail.closure.internalNote,
      }

const mapReportServiceFailure = (error: unknown): never => {
  if (error instanceof ChartReportServiceFailure) {
    if (error.code === 'VALIDATION_FAILED') throw failure('VALIDATION_FAILED', error)
    if (error.code === 'NOT_FOUND') throw failure('NOT_FOUND', error)
    if (error.code === 'CONFLICT') throw failure('CONFLICT', error)
  }
  throw error
}

export const createChartReportReviewService = ({
  store,
  reports,
  superAdministrators,
  now = () => new Date(),
}: {
  readonly store: ChartReportReviewStore
  readonly reports: ChartReportService
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly now?: () => Date
}): ChartReportReviewService => ({
  async listChartReports(input) {
    const normalizedFilters = normalizeFilters(input)
    const limit = normalizeLimit((input as unknown as Record<string, unknown>).limit)
    const filterDigest = digestFilters(normalizedFilters)
    const rawCursor = (input as unknown as Record<string, unknown>).cursor
    const cursor = rawCursor === undefined ? undefined : decodeCursor(rawCursor, filterDigest, normalizedFilters.state)
    const snapshotAsOf = cursor?.asOf ?? now().toISOString()
    const page = await store.listReports({
      filters: filtersForStore(normalizedFilters),
      snapshotAsOf,
      ...(cursor === undefined
        ? {}
        : { cursor: { isOpen: cursor.isOpen, createdAt: cursor.createdAt, id: cursor.id } }),
      limit,
    })
    const items = await projectQueuePage(page.items, store, superAdministrators)
    const lastItem = page.items.at(-1)
    return {
      items,
      nextCursor: page.hasMore && lastItem ? encodeCursor(lastItem, filterDigest, snapshotAsOf) : null,
      normalizedFilters,
    }
  },

  async getChartReportDetail(input) {
    const reportId = normalizeDomainValue(() => normalizeChartReportId(input.reportId))
    const detail = await store.loadReportDetail(reportId)
    if (!detail) throw failure('NOT_FOUND')
    const [capturedPublications, activePublication] = await Promise.all([
      store.loadCapturedPublications([detail.publication]),
      store.loadActivePublication(detail.publication.channel),
    ])
    if (!activePublication) throw failure('CHART_UNAVAILABLE')
    const preparedCapturedPublications = prepareCapturedSnapshots(capturedPublications)
    const preparedCapturedPublication = capturedSnapshot(preparedCapturedPublications, detail)
    const preparedActivePublication =
      chartReportReviewPublicationKey(activePublication.publication) ===
        chartReportReviewPublicationKey(detail.publication) && preparedCapturedPublication
        ? preparedCapturedPublication
        : prepareChartReportReviewCatalogSnapshot(activePublication)
    const context = resolveChartReportReviewContext({
      report: {
        chart: { stableSongId: detail.stableSongId, stableChartId: detail.stableChartId },
        publication: detail.publication,
        fieldKey: detail.fieldKey,
        currentValue: detail.currentValue,
      },
      capturedCatalog: preparedCapturedPublication,
      activeCatalog: preparedActivePublication,
    })
    const capturedChart = chartSummary(context)
    let currentContext: GetChartReportDetailOutput['currentContext']
    switch (context.activeComparison.status) {
      case 'retired':
        currentContext = {
          availability: 'retired',
          publication: context.activeComparison.publication,
          songId: detail.stableSongId,
          chartId: detail.stableChartId,
        }
        break
      case 'captured':
      case 'unchanged':
      case 'changed':
        currentContext = {
          availability: 'current',
          publication: context.activeComparison.publication,
          chart: capturedChart,
          currentValue: context.activeComparison.currentValue,
        }
        break
      case 'catalog_corrupt':
      case 'catalog_unavailable':
      case 'not_active':
        throw failure('CHART_UNAVAILABLE')
    }
    const closure = projectClosure(detail)
    return {
      reporter: reporterSummary(detail.reporter, superAdministrators),
      report: {
        id: detail.id,
        state: detail.state,
        fieldKey: detail.fieldKey,
        category: detail.category,
        submittedCurrentValue: detail.currentValue,
        submittedProposedValue: detail.proposedValue,
        explanation: detail.explanation,
        sourceUrls: [...detail.sourceUrls],
        createdAt: detail.createdAt,
        capturedContext: { publication: detail.publication, chart: capturedChart },
        closure,
      } as GetChartReportDetailOutput['report'],
      currentContext,
      publicChartReference:
        currentContext.availability === 'retired' || detail.publicChartReference === null
          ? null
          : {
              legacySongId: detail.publicChartReference.legacySongId,
              sheetType: detail.publicChartReference.sheetType,
              sheetDifficulty: detail.publicChartReference.sheetDifficulty,
            },
    }
  },

  async closeChartReport(input) {
    try {
      const result = await reports.closeReport({
        reportId: input.reportId,
        actorUserId: input.actorUserId,
        expectedState: input.expectedState,
        internalNote: input.internalNote,
      })
      if (result.report.state !== 'closed' || result.report.closure === null) throw new Error('Invalid closure result')
      return {
        id: result.report.id,
        state: 'closed',
        closure: {
          actorUserId: result.report.closure.actorUserId,
          closedAt: result.report.closure.closedAt.toISOString(),
          internalNote: result.report.closure.internalNote,
        },
      }
    } catch (error) {
      return mapReportServiceFailure(error)
    }
  },
})

export const createPostgresChartReportReviewService = ({
  superAdministrators,
  store = createPostgresChartReportReviewStore(),
  reports = createChartReportService({ repository: createPostgresChartReportRepository() }),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: ChartReportReviewStore
  readonly reports?: ChartReportService
}): ChartReportReviewService => createChartReportReviewService({ store, reports, superAdministrators })