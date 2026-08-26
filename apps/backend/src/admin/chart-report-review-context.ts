import {
  normalizeChartReportJsonSnapshot,
  normalizeChartReportPublicationIdentity,
  type ChartReportJsonSnapshot,
  type ChartReportPublicationIdentity,
  type StoredChartReport,
} from '../chart-reports/chart-report-domain.js'
import {
  parsePublishedChartReportCatalogBody,
  resolvePublishedChartReportField,
  type PublishedChartReportCatalog,
  type PublishedChartReportChart,
  type PublishedChartReportSong,
} from '../chart-reports/chart-report-catalog.js'

const DISPLAY_LABEL_MAX_LENGTH = 512

export type ChartReportReviewCatalogSnapshot = {
  readonly publication: ChartReportPublicationIdentity
  readonly bodyText: string
}

export type PreparedChartReportReviewCatalogSnapshot =
  | {
      readonly publication: ChartReportPublicationIdentity
      readonly catalog: PublishedChartReportCatalog
    }
  | {
      readonly publication: ChartReportPublicationIdentity
      readonly availability: 'corrupt'
    }

type ResolvableChartReportReviewCatalogSnapshot =
  | ChartReportReviewCatalogSnapshot
  | PreparedChartReportReviewCatalogSnapshot

export type ChartReportReviewActiveCatalog =
  | ResolvableChartReportReviewCatalogSnapshot
  | { readonly availability: 'not_active' }
  | { readonly availability: 'unavailable' }

type ReviewReport = Pick<StoredChartReport, 'chart' | 'publication' | 'fieldKey' | 'currentValue'>

export type ChartReportReviewContextInput = {
  readonly report: ReviewReport
  readonly capturedCatalog: ResolvableChartReportReviewCatalogSnapshot | null
  readonly activeCatalog: ChartReportReviewActiveCatalog
}

export type ChartReportReviewSongContext = {
  readonly id: string
  readonly label: string
  readonly artist: string
  readonly category: string
  readonly version: string
}

export type ChartReportReviewChartContext = {
  readonly id: string
  readonly label: string
  readonly type: string
  readonly difficulty: string
  readonly level: string
  readonly version: string
}

export type ChartReportReviewCapturedContext =
  | {
      readonly status: 'captured'
      readonly publication: ChartReportPublicationIdentity
      readonly song: ChartReportReviewSongContext
      readonly chart: ChartReportReviewChartContext
      readonly fieldValue: ChartReportJsonSnapshot
    }
  | {
      readonly status: 'catalog_unavailable' | 'catalog_corrupt'
      readonly publication: ChartReportPublicationIdentity
    }

export type ChartReportReviewActiveComparison =
  | {
      readonly status: 'captured' | 'unchanged' | 'changed'
      readonly publication: ChartReportPublicationIdentity
      readonly currentValue: ChartReportJsonSnapshot
    }
  | {
      readonly status: 'retired'
      readonly publication: ChartReportPublicationIdentity
    }
  | { readonly status: 'not_active' | 'catalog_unavailable' }
  | {
      readonly status: 'catalog_corrupt'
      readonly publication: ChartReportPublicationIdentity | null
    }

export type ChartReportReviewContext = {
  readonly captured: ChartReportReviewCapturedContext
  readonly activeComparison: ChartReportReviewActiveComparison
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

const truncateUtf16 = (value: string, maximumLength: number): string => {
  if (value.length <= maximumLength) return value
  let output = ''
  for (const character of value) {
    if (output.length + character.length > maximumLength) break
    output += character
  }
  return output
}

const safeLabel = (value: string, fallback: string): string => {
  const normalized = normalizeSafeDisplayText(value) || normalizeSafeDisplayText(fallback) || 'Unavailable'
  return truncateUtf16(normalized, DISPLAY_LABEL_MAX_LENGTH)
}

const projectCapturedSong = (song: PublishedChartReportSong): ChartReportReviewSongContext => ({
  id: song.id,
  label: safeLabel(song.title, song.id),
  artist: safeLabel(song.artist, 'Unknown artist'),
  category: safeLabel(song.category, 'Unknown category'),
  version: safeLabel(song.version, 'Unknown version'),
})

const projectCapturedChart = (chart: PublishedChartReportChart): ChartReportReviewChartContext => ({
  id: chart.id,
  label: safeLabel(`${chart.difficulty} (${chart.type})`, chart.id),
  type: safeLabel(chart.type, 'Unknown type'),
  difficulty: safeLabel(chart.difficulty, 'Unknown difficulty'),
  level: safeLabel(chart.level, 'Unknown level'),
  version: safeLabel(chart.version, 'Unknown version'),
})

const equalPublication = (left: ChartReportPublicationIdentity, right: ChartReportPublicationIdentity): boolean =>
  left.channel === right.channel &&
  left.catalogRunId === right.catalogRunId &&
  left.revision === right.revision &&
  left.fingerprintSha256 === right.fingerprintSha256

const equalSnapshot = (left: ChartReportJsonSnapshot, right: ChartReportJsonSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const normalizeSnapshotPublication = (
  snapshot: ResolvableChartReportReviewCatalogSnapshot,
): ChartReportPublicationIdentity | undefined => {
  try {
    return normalizeChartReportPublicationIdentity(snapshot.publication)
  } catch {
    return undefined
  }
}

/**
 * Parses and validates one immutable catalog body once so a queue page can
 * reuse it for every report captured from the same publication.
 */
export const prepareChartReportReviewCatalogSnapshot = (
  snapshot: ChartReportReviewCatalogSnapshot,
): PreparedChartReportReviewCatalogSnapshot => {
  try {
    return Object.freeze({
      publication: snapshot.publication,
      catalog: parsePublishedChartReportCatalogBody(snapshot.bodyText),
    })
  } catch {
    return Object.freeze({ publication: snapshot.publication, availability: 'corrupt' as const })
  }
}

const resolveSnapshotCatalog = (
  snapshot: ResolvableChartReportReviewCatalogSnapshot,
): PublishedChartReportCatalog | undefined => {
  if ('availability' in snapshot) return undefined
  return 'catalog' in snapshot ? snapshot.catalog : parsePublishedChartReportCatalogBody(snapshot.bodyText)
}

const resolveCapturedContext = (
  report: ReviewReport,
  snapshot: ResolvableChartReportReviewCatalogSnapshot | null,
): ChartReportReviewCapturedContext => {
  if (snapshot === null) return { status: 'catalog_unavailable', publication: report.publication }
  const publication = normalizeSnapshotPublication(snapshot)
  if (!publication || !equalPublication(publication, report.publication)) {
    return { status: 'catalog_corrupt', publication: report.publication }
  }

  try {
    const catalog = resolveSnapshotCatalog(snapshot)
    if (!catalog) return { status: 'catalog_corrupt', publication: report.publication }
    const resolved = resolvePublishedChartReportField(catalog, report.chart, report.fieldKey)
    if (!resolved) return { status: 'catalog_corrupt', publication: report.publication }
    const reportValue = normalizeChartReportJsonSnapshot(report.fieldKey, report.currentValue)
    if (!equalSnapshot(resolved.fieldValue, reportValue)) {
      return { status: 'catalog_corrupt', publication: report.publication }
    }
    return {
      status: 'captured',
      publication: report.publication,
      song: projectCapturedSong(resolved.song),
      chart: projectCapturedChart(resolved.chart),
      fieldValue: reportValue,
    }
  } catch {
    return { status: 'catalog_corrupt', publication: report.publication }
  }
}

const isActiveAbsence = (
  activeCatalog: ChartReportReviewContextInput['activeCatalog'],
): activeCatalog is { readonly availability: 'not_active' | 'unavailable' } =>
  'availability' in activeCatalog && activeCatalog.availability !== 'corrupt'

const resolveActiveComparison = (
  report: ReviewReport,
  activeCatalog: ChartReportReviewContextInput['activeCatalog'],
): ChartReportReviewActiveComparison => {
  if (isActiveAbsence(activeCatalog)) {
    return {
      status: activeCatalog.availability === 'unavailable' ? 'catalog_unavailable' : 'not_active',
    }
  }

  const publication = normalizeSnapshotPublication(activeCatalog)
  if (!publication) return { status: 'catalog_corrupt', publication: null }
  if ('availability' in activeCatalog) return { status: 'catalog_corrupt', publication }

  try {
    const catalog = resolveSnapshotCatalog(activeCatalog)
    if (!catalog) return { status: 'catalog_corrupt', publication }
    const resolved = resolvePublishedChartReportField(catalog, report.chart, report.fieldKey)
    if (!resolved) return { status: 'retired', publication }

    const reportValue = normalizeChartReportJsonSnapshot(report.fieldKey, report.currentValue)
    if (equalPublication(publication, report.publication)) {
      if (!equalSnapshot(resolved.fieldValue, reportValue)) return { status: 'catalog_corrupt', publication }
      return {
        status: 'captured',
        publication,
        currentValue: resolved.fieldValue,
      }
    }
    return {
      status: equalSnapshot(resolved.fieldValue, reportValue) ? 'unchanged' : 'changed',
      publication,
      currentValue: resolved.fieldValue,
    }
  } catch {
    return { status: 'catalog_corrupt', publication }
  }
}

/**
 * Projects a review-safe view from already batched immutable catalog bodies.
 * It performs no I/O and deliberately uses captured labels only; active data
 * contributes the comparison value, never replacement labels.
 */
export const resolveChartReportReviewContext = (input: ChartReportReviewContextInput): ChartReportReviewContext =>
  Object.freeze({
    captured: resolveCapturedContext(input.report, input.capturedCatalog),
    activeComparison: resolveActiveComparison(input.report, input.activeCatalog),
  })