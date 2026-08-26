import { describe, expect, it } from 'vitest'
import {
  CHART_REPORT_FIELD_KEYS,
  type ChartReportFieldKey,
  type ChartReportJsonSnapshot,
  type ChartReportPublicationIdentity,
  type StoredChartReport,
} from '../chart-reports/chart-report-domain.js'
import {
  resolveChartReportReviewContext,
  type ChartReportReviewCatalogSnapshot,
} from './chart-report-review-context.js'

const SONG_ID = 'dsng_23456789ab'
const CHART_ID = 'dsht_abcdefghjk'

const catalog = {
  schemaVersion: 1,
  updatedAt: '2026-08-24T12:00:00.000Z',
  categories: [{ category: 'maimai' }],
  versions: [{ version: 'CiRCLE' }],
  types: [{ type: 'dx', name: 'DX' }],
  difficulties: [{ difficulty: 'master', name: 'Master' }],
  servers: [
    { id: 'jp', name: 'Japan' },
    { id: 'intl', name: 'International' },
  ],
  songs: [
    {
      id: SONG_ID,
      category: 'maimai',
      title: 'Captured Song',
      artist: 'Captured Artist',
      bpm: 180,
      imageName: 'captured.png',
      version: 'CiRCLE',
      isNew: false,
      isLocked: true,
      sheets: [
        {
          id: CHART_ID,
          type: 'dx',
          difficulty: 'master',
          level: '14+',
          internalLevelValue: 14.7,
          noteDesigner: 'Designer',
          noteCounts: { tap: 400, hold: 50, slide: 100, break: 10, total: 560 },
          serverIds: ['jp', 'intl'],
          isSpecial: false,
          version: 'CiRCLE',
          releaseDate: '2026-08-24',
          multiverInternalLevelValue: { BUDDiES: 14.5, CiRCLE: 14.7 },
        },
      ],
      searchAcronyms: ['source-only-secret'],
    },
  ],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [{ song_id: SONG_ID, name: 'raw-alias-secret' }],
}

const publication = (revision = '23', fingerprint = 'a'.repeat(64)): ChartReportPublicationIdentity => ({
  channel: 'production-v1',
  catalogRunId: revision,
  revision,
  fingerprintSha256: fingerprint,
})

const catalogSnapshot = (
  value: unknown = catalog,
  identity: ChartReportPublicationIdentity = publication(),
): ChartReportReviewCatalogSnapshot => ({
  publication: identity,
  bodyText: JSON.stringify(value),
})

const report = (
  fieldKey: ChartReportFieldKey = 'chart.level',
  currentValue: ChartReportJsonSnapshot = '14+',
): Pick<StoredChartReport, 'chart' | 'publication' | 'fieldKey' | 'currentValue'> => ({
  chart: { stableSongId: SONG_ID, stableChartId: CHART_ID },
  publication: publication(),
  fieldKey,
  currentValue,
})

const cloneCatalog = () => structuredClone(catalog)

describe('chart-report review publication context', () => {
  it('projects captured labels and all 28 exact reportable field leaves', () => {
    const expected: Record<ChartReportFieldKey, ChartReportJsonSnapshot> = {
      'song.title': 'Captured Song',
      'song.artist': 'Captured Artist',
      'song.category': 'maimai',
      'song.bpm': 180,
      'song.image_name': 'captured.png',
      'song.is_new': false,
      'song.is_locked': true,
      'song.version': 'CiRCLE',
      'chart.type': 'dx',
      'chart.difficulty': 'master',
      'chart.level': '14+',
      'chart.internal_level': 14.7,
      'chart.multiver_internal_levels': { BUDDiES: 14.5, CiRCLE: 14.7 },
      'chart.note_designer': 'Designer',
      'chart.note_counts.tap': 400,
      'chart.note_counts.hold': 50,
      'chart.note_counts.slide': 100,
      'chart.note_counts.touch': null,
      'chart.note_counts.break': 10,
      'chart.note_counts.total': 560,
      'chart.regions.jp': true,
      'chart.regions.intl': true,
      'chart.regions.cn': false,
      'chart.version': 'CiRCLE',
      'chart.release_date': '2026-08-24',
      'chart.internal_id': null,
      'chart.is_special': false,
      'chart.comment': null,
    }

    for (const fieldKey of CHART_REPORT_FIELD_KEYS) {
      const context = resolveChartReportReviewContext({
        report: report(fieldKey, expected[fieldKey]),
        capturedCatalog: catalogSnapshot(),
        activeCatalog: catalogSnapshot(),
      })
      expect(context.captured.status, fieldKey).toBe('captured')
      if (context.captured.status !== 'captured') continue
      expect(context.captured.fieldValue, fieldKey).toEqual(expected[fieldKey])
      expect(context.activeComparison, fieldKey).toMatchObject({
        status: 'captured',
        currentValue: expected[fieldKey],
      })
    }

    const context = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: catalogSnapshot(),
    })
    expect(context.captured).toMatchObject({
      status: 'captured',
      song: {
        id: SONG_ID,
        label: 'Captured Song',
        artist: 'Captured Artist',
        category: 'maimai',
        version: 'CiRCLE',
      },
      chart: {
        id: CHART_ID,
        label: 'master (dx)',
        type: 'dx',
        difficulty: 'master',
        level: '14+',
        version: 'CiRCLE',
      },
    })
  })

  it('distinguishes an unchanged leaf from a changed leaf after publication drift', () => {
    const unchanged = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: catalogSnapshot(catalog, publication('24', 'b'.repeat(64))),
    })
    expect(unchanged.activeComparison).toEqual({
      status: 'unchanged',
      publication: publication('24', 'b'.repeat(64)),
      currentValue: '14+',
    })

    const activeCatalog = cloneCatalog()
    activeCatalog.songs[0]!.title = 'Mutable Active Title Must Not Replace Captured Label'
    activeCatalog.songs[0]!.sheets[0]!.level = '15'
    const changed = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: catalogSnapshot(activeCatalog, publication('25', 'c'.repeat(64))),
    })
    expect(changed.activeComparison).toEqual({
      status: 'changed',
      publication: publication('25', 'c'.repeat(64)),
      currentValue: '15',
    })
    expect(changed.captured).toMatchObject({
      status: 'captured',
      song: { label: 'Captured Song' },
    })
    expect(JSON.stringify(changed)).not.toContain('Mutable Active Title')
  })

  it('distinguishes retired charts, no active publication, and an unavailable catalog read', () => {
    const retiredCatalog = cloneCatalog()
    retiredCatalog.songs[0]!.sheets = []
    const retired = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: catalogSnapshot(retiredCatalog, publication('24', 'b'.repeat(64))),
    })
    expect(retired.activeComparison).toEqual({
      status: 'retired',
      publication: publication('24', 'b'.repeat(64)),
    })

    for (const activeCatalog of [{ availability: 'not_active' as const }, { availability: 'unavailable' as const }]) {
      expect(
        resolveChartReportReviewContext({
          report: report(),
          capturedCatalog: catalogSnapshot(),
          activeCatalog,
        }).activeComparison,
      ).toEqual({
        status: activeCatalog.availability === 'unavailable' ? 'catalog_unavailable' : 'not_active',
      })
    }
  })

  it('fails closed with redacted states for unavailable, mismatched, or corrupt captured catalogs', () => {
    expect(
      resolveChartReportReviewContext({
        report: report(),
        capturedCatalog: null,
        activeCatalog: { availability: 'not_active' },
      }).captured,
    ).toEqual({ status: 'catalog_unavailable', publication: publication() })

    for (const capturedCatalog of [
      { publication: publication(), bodyText: '{source-only-secret' },
      catalogSnapshot(catalog, publication('24', 'b'.repeat(64))),
      catalogSnapshot({ ...catalog, songs: [] }),
    ]) {
      const context = resolveChartReportReviewContext({
        report: report(),
        capturedCatalog,
        activeCatalog: { availability: 'not_active' },
      })
      expect(context.captured).toEqual({
        status: 'catalog_corrupt',
        publication: publication(),
      })
      expect(JSON.stringify(context)).not.toMatch(/source-only-secret|raw-alias-secret/)
    }

    const mismatchedValue = resolveChartReportReviewContext({
      report: report('chart.level', '13'),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: { availability: 'not_active' },
    })
    expect(mismatchedValue.captured.status).toBe('catalog_corrupt')
  })

  it('redacts unapproved catalog artifacts and sanitizes bounded captured display labels', () => {
    const unsafeCatalog = cloneCatalog()
    unsafeCatalog.songs[0]!.title = `  Captured\u0000  Song  ${'x'.repeat(600)}`
    unsafeCatalog.songs[0]!.artist = 'Artist\nName'
    const context = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(unsafeCatalog),
      activeCatalog: { availability: 'not_active' },
    })

    expect(context.captured.status).toBe('captured')
    if (context.captured.status !== 'captured') return
    expect(context.captured.song.label).toMatch(/^Captured Song x+$/)
    expect(context.captured.song.label.length).toBe(512)
    expect(context.captured.song.artist).toBe('Artist Name')
    const serialized = JSON.stringify(context)
    expect(serialized).not.toMatch(/source-only-secret|raw-alias-secret|searchAcronyms|aliases|updatedAt/)
  })

  it('redacts corrupt active catalog details and rejects same-publication body drift', () => {
    const corrupt = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: {
        publication: publication('24', 'b'.repeat(64)),
        bodyText: '{private-source-detail',
      },
    })
    expect(corrupt.activeComparison).toEqual({
      status: 'catalog_corrupt',
      publication: publication('24', 'b'.repeat(64)),
    })
    expect(JSON.stringify(corrupt)).not.toContain('private-source-detail')

    const impossibleCatalog = cloneCatalog()
    impossibleCatalog.songs[0]!.sheets[0]!.level = '15'
    const impossible = resolveChartReportReviewContext({
      report: report(),
      capturedCatalog: catalogSnapshot(),
      activeCatalog: catalogSnapshot(impossibleCatalog),
    })
    expect(impossible.activeComparison).toEqual({
      status: 'catalog_corrupt',
      publication: publication(),
    })
  })
})