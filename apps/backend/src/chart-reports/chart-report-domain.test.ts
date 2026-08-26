import { describe, expect, it } from 'vitest'
import {
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_CLOSE_NOTE_MAX_LENGTH,
  CHART_REPORT_EXPLANATION_MAX_LENGTH,
  CHART_REPORT_FIELD_KEYS,
  CHART_REPORT_FIELD_VALUE_KINDS,
  CHART_REPORT_SOURCE_URL_MAX_COUNT,
  ChartReportDomainFailure,
  normalizeChartReportCloseNote,
  normalizeChartReportIdentity,
  normalizeChartReportJsonSnapshot,
  normalizeChartReportPublicationIdentity,
  normalizeChartReportSourceUrls,
  normalizeNewChartReport,
  normalizeStoredChartReport,
  type ChartReportFieldKey,
  type ChartReportJsonSnapshot,
  type NewChartReport,
} from './chart-report-domain.js'

const REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const REPORTER_ID = 'reporter-user'
const CHART = {
  stableSongId: 'dsng_23456789ab',
  stableChartId: 'dsht_abcdefghjk',
} as const
const PUBLICATION = {
  channel: 'production-v1',
  catalogRunId: '71',
  revision: '23',
  fingerprintSha256: 'a'.repeat(64),
} as const

const VALID_VALUES = {
  'song.title': 'Song title',
  'song.artist': 'Artist',
  'song.category': 'maimai',
  'song.bpm': 180,
  'song.image_name': 'cover.png',
  'song.is_new': false,
  'song.is_locked': true,
  'song.version': 'CiRCLE PLUS',
  'chart.type': 'dx',
  'chart.difficulty': 'master',
  'chart.level': '14+',
  'chart.internal_level': 14.7,
  'chart.multiver_internal_levels': { BUDDiES: 14.5, CiRCLE: 14.7 },
  'chart.note_designer': 'Chart designer',
  'chart.note_counts.tap': 500,
  'chart.note_counts.hold': 50,
  'chart.note_counts.slide': 75,
  'chart.note_counts.touch': 25,
  'chart.note_counts.break': 10,
  'chart.note_counts.total': 660,
  'chart.regions.jp': true,
  'chart.regions.intl': true,
  'chart.regions.cn': false,
  'chart.version': 'CiRCLE',
  'chart.release_date': '2026-03-19',
  'chart.internal_id': 12_345,
  'chart.is_special': false,
  'chart.comment': 'Published note',
} satisfies Record<ChartReportFieldKey, ChartReportJsonSnapshot>

const report = (overrides: Partial<NewChartReport> = {}): NewChartReport => ({
  id: REPORT_ID,
  reporterUserId: REPORTER_ID,
  chart: CHART,
  publication: PUBLICATION,
  fieldKey: 'chart.level',
  category: 'incorrect_value',
  currentValue: '14',
  proposedValue: '14+',
  explanation: 'The in-game chart shows 14+.',
  sourceUrls: ['HTTPS://Example.COM:443/evidence/../chart?id=1'],
  ...overrides,
})

const expectDomainFailure = (operation: () => unknown, code: ChartReportDomainFailure['code']) => {
  expect(operation).toThrowError(expect.objectContaining({ name: 'ChartReportDomainFailure', code }))
}

describe('chart report source-controlled keys', () => {
  it('keeps stored keys label-free, unique, and paired with an explicit JSON kind', () => {
    expect(CHART_REPORT_CATEGORY_KEYS).toEqual(['incorrect_value', 'missing_value', 'outdated_value', 'other'])
    expect(new Set(CHART_REPORT_FIELD_KEYS).size).toBe(CHART_REPORT_FIELD_KEYS.length)
    expect(Object.keys(CHART_REPORT_FIELD_VALUE_KINDS).sort()).toEqual([...CHART_REPORT_FIELD_KEYS].sort())
    expect(Object.values(CHART_REPORT_FIELD_VALUE_KINDS)).toContain('nullable_number_map')
    expect(JSON.stringify(CHART_REPORT_FIELD_KEYS)).not.toMatch(/title label|display|translation/i)
  })

  it('accepts a correctly typed snapshot for every reportable leaf', () => {
    for (const fieldKey of CHART_REPORT_FIELD_KEYS) {
      expect(normalizeChartReportJsonSnapshot(fieldKey, VALID_VALUES[fieldKey])).toEqual(VALID_VALUES[fieldKey])
    }
  })

  it('rejects wrong scalar kinds, non-finite numbers, and invalid dates', () => {
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.level', 14), 'INVALID_JSON_SNAPSHOT')
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.is_special', 'false'), 'INVALID_JSON_SNAPSHOT')
    expectDomainFailure(
      () => normalizeChartReportJsonSnapshot('chart.internal_level', Number.NaN),
      'INVALID_JSON_SNAPSHOT',
    )
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.internal_level', 1e-7), 'INVALID_JSON_SNAPSHOT')
    expect(normalizeChartReportJsonSnapshot('chart.internal_level', 12.345)).toBe(12.345)
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.note_counts.tap', 1.5), 'INVALID_JSON_SNAPSHOT')
    expectDomainFailure(
      () => normalizeChartReportJsonSnapshot('chart.release_date', '2026-02-30'),
      'INVALID_JSON_SNAPSHOT',
    )
    expectDomainFailure(
      () => normalizeChartReportJsonSnapshot('chart.release_date', '0000-01-01'),
      'INVALID_JSON_SNAPSHOT',
    )
  })

  it('preserves explicit null only for fields where published absence is meaningful', () => {
    for (const fieldKey of [
      'song.bpm',
      'chart.multiver_internal_levels',
      'chart.note_designer',
      'chart.note_counts.touch',
      'chart.release_date',
      'chart.internal_id',
      'chart.comment',
    ] as const) {
      expect(normalizeChartReportJsonSnapshot(fieldKey, null)).toBeNull()
    }
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('song.title', null), 'INVALID_JSON_SNAPSHOT')
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.is_special', null), 'INVALID_JSON_SNAPSHOT')
    expectDomainFailure(() => normalizeChartReportJsonSnapshot('chart.regions.jp', null), 'INVALID_JSON_SNAPSHOT')
  })

  it('copies, sorts, freezes, and bounds multiversion snapshots', () => {
    const input = { CiRCLE: 14.7, BUDDiES: 14.5 }
    const normalized = normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', input)
    expect(normalized).toEqual({ BUDDiES: 14.5, CiRCLE: 14.7 })
    expect(normalized).not.toBe(input)
    expect(Object.isFrozen(normalized)).toBe(true)
    input.CiRCLE = 1
    expect(normalized).toEqual({ BUDDiES: 14.5, CiRCLE: 14.7 })
    expectDomainFailure(
      () =>
        normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', {
          CiRCLE: Number.POSITIVE_INFINITY,
        }),
      'INVALID_JSON_SNAPSHOT',
    )
  })

  it('shares the exact compact JSON byte boundary enforced by PostgreSQL', () => {
    const mapAtBoundary = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => {
        const keyLength = index === 0 ? 250 : 251
        const prefix = index.toString().padStart(2, '0')
        return [`${prefix}${'k'.repeat(keyLength - prefix.length)}`, 1]
      }),
    )
    expect(Buffer.byteLength(JSON.stringify(mapAtBoundary), 'utf8')).toBe(4_096)
    expect(normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', mapAtBoundary)).toEqual(mapAtBoundary)

    const firstKey = Object.keys(mapAtBoundary)[0]
    const mapOverBoundary = { ...mapAtBoundary, [`${firstKey}k`]: 1 }
    delete mapOverBoundary[firstKey]
    expect(Buffer.byteLength(JSON.stringify(mapOverBoundary), 'utf8')).toBe(4_097)
    expectDomainFailure(
      () => normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', mapOverBoundary),
      'INVALID_JSON_SNAPSHOT',
    )
  })

  it('bounds JSON snapshots by UTF-8 size, not only JavaScript character count', () => {
    expectDomainFailure(
      () => normalizeChartReportJsonSnapshot('chart.comment', '界'.repeat(2_000)),
      'INVALID_JSON_SNAPSHOT',
    )
  })
})

describe('chart report content validation', () => {
  it('normalizes exact stable identities and immutable publication identity', () => {
    expect(normalizeChartReportIdentity(CHART)).toEqual(CHART)
    expect(normalizeChartReportPublicationIdentity(PUBLICATION)).toEqual(PUBLICATION)
    expectDomainFailure(
      () =>
        normalizeChartReportIdentity({
          stableSongId: 'legacy-id',
          stableChartId: CHART.stableChartId,
        }),
      'INVALID_CHART_IDENTITY',
    )
    expectDomainFailure(
      () =>
        normalizeChartReportPublicationIdentity({
          ...PUBLICATION,
          catalogRunId: '0',
        }),
      'INVALID_PUBLICATION_IDENTITY',
    )
    expectDomainFailure(
      () =>
        normalizeChartReportPublicationIdentity({
          ...PUBLICATION,
          revision: '01',
        }),
      'INVALID_PUBLICATION_IDENTITY',
    )
    expectDomainFailure(
      () =>
        normalizeChartReportPublicationIdentity({
          ...PUBLICATION,
          fingerprintSha256: 'A'.repeat(64),
        }),
      'INVALID_PUBLICATION_IDENTITY',
    )
  })

  it('normalizes credential-free HTTP(S) evidence URLs without fetching them', () => {
    const urls = normalizeChartReportSourceUrls([
      'HTTPS://Example.COM:443/evidence/../chart?id=1',
      'http://example.com:80/reference#source',
    ])
    expect(urls).toEqual(['https://example.com/chart?id=1', 'http://example.com/reference#source'])
    expect(Object.isFrozen(urls)).toBe(true)
    expectDomainFailure(() => normalizeChartReportSourceUrls(['ftp://example.com/file']), 'INVALID_SOURCE_URLS')
    expectDomainFailure(
      () => normalizeChartReportSourceUrls(['https://user:secret@example.com/']),
      'INVALID_SOURCE_URLS',
    )
    expectDomainFailure(
      () =>
        normalizeChartReportSourceUrls(
          Array.from({ length: CHART_REPORT_SOURCE_URL_MAX_COUNT + 1 }, () => 'https://example.com/'),
        ),
      'INVALID_SOURCE_URLS',
    )
  })

  it('normalizes bounded explanations and optional internal close notes', () => {
    expect(normalizeNewChartReport(report({ explanation: '  Useful evidence  ' })).explanation).toBe('Useful evidence')
    expect(normalizeChartReportCloseNote(undefined)).toBeNull()
    expect(normalizeChartReportCloseNote('   ')).toBeNull()
    expect(normalizeChartReportCloseNote('  handled upstream  ')).toBe('handled upstream')
    expectDomainFailure(
      () =>
        normalizeNewChartReport(
          report({
            explanation: 'x'.repeat(CHART_REPORT_EXPLANATION_MAX_LENGTH + 1),
          }),
        ),
      'INVALID_EXPLANATION',
    )
    expectDomainFailure(
      () => normalizeChartReportCloseNote('x'.repeat(CHART_REPORT_CLOSE_NOTE_MAX_LENGTH + 1)),
      'INVALID_CLOSE_NOTE',
    )
  })

  it('copies and freezes all submitted content before persistence', () => {
    const sourceUrls = ['https://example.com/evidence']
    const normalized = normalizeNewChartReport(report({ sourceUrls }))
    sourceUrls[0] = 'https://attacker.example/changed'
    expect(normalized.sourceUrls).toEqual(['https://example.com/evidence'])
    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized.chart)).toBe(true)
    expect(Object.isFrozen(normalized.publication)).toBe(true)
    expect(Object.isFrozen(normalized.sourceUrls)).toBe(true)
  })
})

describe('chart report lifecycle invariants', () => {
  const createdAt = new Date('2026-08-24T12:00:00.000Z')

  it('accepts only open-without-closure and closed-with-complete-closure shapes', () => {
    expect(
      normalizeStoredChartReport({
        ...report(),
        createdAt,
        state: 'open',
        closure: null,
      }),
    ).toMatchObject({
      state: 'open',
      closure: null,
    })
    expect(
      normalizeStoredChartReport({
        ...report(),
        createdAt,
        state: 'closed',
        closure: {
          actorUserId: 'admin-user',
          closedAt: new Date('2026-08-24T12:01:00.000Z'),
          internalNote: null,
        },
      }),
    ).toMatchObject({
      state: 'closed',
      closure: { actorUserId: 'admin-user', internalNote: null },
    })

    expectDomainFailure(
      () =>
        normalizeStoredChartReport({
          ...report(),
          createdAt,
          state: 'open',
          closure: {
            actorUserId: 'admin-user',
            closedAt: createdAt,
            internalNote: null,
          },
        }),
      'INVALID_LIFECYCLE',
    )
    expectDomainFailure(
      () =>
        normalizeStoredChartReport({
          ...report(),
          createdAt,
          state: 'closed',
          closure: null,
        }),
      'INVALID_LIFECYCLE',
    )
  })

  it('rejects a closure timestamp before immutable report creation', () => {
    expectDomainFailure(
      () =>
        normalizeStoredChartReport({
          ...report(),
          createdAt,
          state: 'closed',
          closure: {
            actorUserId: 'admin-user',
            closedAt: new Date('2026-08-24T11:59:59.999Z'),
            internalNote: null,
          },
        }),
      'INVALID_LIFECYCLE',
    )
  })
})