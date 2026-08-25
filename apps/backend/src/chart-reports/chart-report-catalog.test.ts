import { describe, expect, it } from 'vitest'
import type { ChartReportFieldKey } from './chart-report-domain.js'
import { CHART_REPORT_FIELD_KEYS } from './chart-report-domain.js'
import { ChartReportCatalogFailure, createPostgresChartReportCatalogResolver } from './chart-report-catalog.js'
import type { ChartReportDatabase } from './chart-report-repository.js'

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
      title: 'Example Song',
      artist: 'Example Artist',
      bpm: 180,
      imageName: 'example.png',
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
      searchAcronyms: [],
    },
  ],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
} as const

const row = (overrides: Record<string, unknown> = {}) => ({
  channel: 'production-v1',
  catalog_run_id: '71',
  publication_revision: '23',
  publication_fingerprint_sha256: 'a'.repeat(64),
  snapshot_body_sha256: 'a'.repeat(64),
  body_text: JSON.stringify(catalog),
  ...overrides,
})

const databaseWithRows = (...rows: Record<string, unknown>[]) => {
  const calls: Array<{ readonly text: string; readonly values?: unknown[] }> = []
  const database: ChartReportDatabase = {
    async query<Row>(text: string, values?: unknown[]) {
      calls.push({ text, values })
      return { rows: rows as Row[] }
    },
  }
  return { database, calls }
}

describe('active chart-report catalog resolver', () => {
  it('locks and parses the immutable snapshot behind the active publication receipt', async () => {
    const { database, calls } = databaseWithRows(row())
    const resolved = await createPostgresChartReportCatalogResolver(database).resolveActiveField({
      stableSongId: SONG_ID,
      stableChartId: CHART_ID,
      fieldKey: 'chart.level',
    })

    expect(resolved).toEqual({
      chart: { stableSongId: SONG_ID, stableChartId: CHART_ID },
      publication: {
        channel: 'production-v1',
        catalogRunId: '71',
        revision: '23',
        fingerprintSha256: 'a'.repeat(64),
      },
      currentValue: '14+',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.text).toContain('dxdata.catalog_publication_receipts')
    expect(calls[0]!.text).toContain('dxdata.catalog_snapshots')
    expect(calls[0]!.text).toContain('snapshot.body_sha256 = receipt.publication_fingerprint_sha256')
    expect(calls[0]!.text).toContain('FOR SHARE OF publication')
    expect(calls[0]!.text).not.toMatch(/canonical_songs|canonical_sheets/)
    expect(calls[0]!.values).toEqual(['production-v1', 1])
  })

  it('maps every source-controlled field to its exact published JSON leaf and explicit null', async () => {
    const expected: Record<ChartReportFieldKey, unknown> = {
      'song.title': 'Example Song',
      'song.artist': 'Example Artist',
      'song.category': 'maimai',
      'song.bpm': 180,
      'song.image_name': 'example.png',
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
      const { database } = databaseWithRows(row())
      const resolved = await createPostgresChartReportCatalogResolver(database).resolveActiveField({
        stableSongId: SONG_ID,
        stableChartId: CHART_ID,
        fieldKey,
      })
      expect(resolved.currentValue, fieldKey).toEqual(expected[fieldKey])
    }
  })

  it('returns a safe missing-chart failure with only the active revision', async () => {
    const { database } = databaseWithRows(row())
    const error = await createPostgresChartReportCatalogResolver(database)
      .resolveActiveField({
        stableSongId: SONG_ID,
        stableChartId: 'dsht_pqrstvwxyz',
        fieldKey: 'chart.level',
      })
      .catch((failure: unknown) => failure)
    expect(error).toMatchObject({
      name: 'ChartReportCatalogFailure',
      code: 'CHART_NOT_FOUND',
      activePublicationRevision: '23',
    })
    expect(JSON.stringify(error)).not.toContain('Example Song')
  })

  it('fails closed when the active snapshot fingerprint differs from its receipt and publication', async () => {
    const { database } = databaseWithRows(row({ snapshot_body_sha256: 'b'.repeat(64) }))
    const error = await createPostgresChartReportCatalogResolver(database)
      .resolveActiveField({
        stableSongId: SONG_ID,
        stableChartId: CHART_ID,
        fieldKey: 'chart.level',
      })
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(ChartReportCatalogFailure)
    expect(error).toMatchObject({ code: 'CATALOG_UNAVAILABLE' })
  })

  it('fails closed for missing, malformed, or incompatible publication snapshots', async () => {
    for (const rows of [[], [row({ body_text: '{' })], [row({ publication_revision: '0' })]]) {
      const { database } = databaseWithRows(...rows)
      await expect(
        createPostgresChartReportCatalogResolver(database).resolveActiveField({
          stableSongId: SONG_ID,
          stableChartId: CHART_ID,
          fieldKey: 'chart.level',
        }),
      ).rejects.toBeInstanceOf(ChartReportCatalogFailure)
    }
  })
})