import type { QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import type { NewChartReport } from './chart-report-domain.js'
import { createPostgresChartReportRepository, type ChartReportDatabase } from './chart-report-repository.js'

const REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const CREATED_AT = new Date('2026-08-24T12:00:00.000Z')

const input: NewChartReport = {
  id: REPORT_ID,
  reporterUserId: 'reporter-user',
  chart: { stableSongId: 'dsng_23456789ab', stableChartId: 'dsht_abcdefghjk' },
  publication: {
    channel: 'production-v1',
    catalogRunId: '71',
    revision: '23',
    fingerprintSha256: 'a'.repeat(64),
  },
  fieldKey: 'chart.multiver_internal_levels',
  category: 'incorrect_value',
  currentValue: { BUDDiES: 14.5 },
  proposedValue: { BUDDiES: 14.6 },
  explanation: 'The published value differs from the game.',
  sourceUrls: ['https://example.com/evidence'],
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  reporter_user_id: 'reporter-user',
  stable_song_id: 'dsng_23456789ab',
  stable_chart_id: 'dsht_abcdefghjk',
  publication_channel: 'production-v1',
  publication_catalog_run_id: '71',
  publication_revision: '23',
  publication_fingerprint_sha256: 'a'.repeat(64),
  target_field_key: 'chart.multiver_internal_levels',
  category: 'incorrect_value',
  current_value: { BUDDiES: 14.5 },
  proposed_value: { BUDDiES: 14.6 },
  explanation: 'The published value differs from the game.',
  source_urls: ['https://example.com/evidence'],
  state: 'open',
  created_at: CREATED_AT,
  closed_by_user_id: null,
  closed_at: null,
  close_note: null,
  ...overrides,
})

const databaseWithRows = (...rows: QueryResultRow[]) => {
  const calls: Array<readonly [string, unknown[] | undefined]> = []
  const database: ChartReportDatabase = {
    async query<Row extends QueryResultRow>(text: string, values?: unknown[]) {
      calls.push([text, values])
      return { rows: rows as Row[] }
    },
  }
  return { database, calls }
}

describe('PostgreSQL chart report repository', () => {
  it('inserts every submission directly as an independent immutable row', async () => {
    const { database, calls } = databaseWithRows(row())
    const repository = createPostgresChartReportRepository(database)

    const created = await repository.create(input)

    expect(created).toMatchObject({
      id: REPORT_ID,
      state: 'open',
      closure: null,
      publication: {
        channel: 'production-v1',
        catalogRunId: '71',
        revision: '23',
      },
    })
    expect(Object.isFrozen(created)).toBe(true)
    const [sql, parameters] = calls[0]!
    expect(sql).toContain('INSERT INTO public.chart_reports')
    expect(sql).toContain('$11::jsonb')
    expect(sql).toContain('$12::jsonb')
    expect(sql).toContain('$14::text[]')
    expect(sql).not.toMatch(/ON CONFLICT|duplicate|similar|existing/i)
    expect(parameters).toEqual([
      REPORT_ID,
      'reporter-user',
      'dsng_23456789ab',
      'dsht_abcdefghjk',
      'production-v1',
      '71',
      '23',
      'a'.repeat(64),
      'chart.multiver_internal_levels',
      'incorrect_value',
      JSON.stringify({ BUDDiES: 14.5 }),
      JSON.stringify({ BUDDiES: 14.6 }),
      'The published value differs from the game.',
      ['https://example.com/evidence'],
    ])
  })

  it('loads one durable report without joining mutable user or catalog projections', async () => {
    const { database, calls } = databaseWithRows(row())
    const repository = createPostgresChartReportRepository(database)

    expect(await repository.findById(REPORT_ID)).toMatchObject({
      reporterUserId: 'reporter-user',
    })
    const [sql, parameters] = calls[0]!
    expect(sql).toContain('FROM public.chart_reports')
    expect(sql).not.toMatch(/\bJOIN\b/i)
    expect(parameters).toEqual([REPORT_ID])
  })

  it('closes only an open row with one atomic server-timestamped update', async () => {
    const closedAt = new Date('2026-08-24T12:01:00.000Z')
    const { database, calls } = databaseWithRows(
      row({
        state: 'closed',
        closed_by_user_id: 'admin-user',
        closed_at: closedAt,
        close_note: 'Corrected upstream.',
      }),
    )
    const repository = createPostgresChartReportRepository(database)

    const closed = await repository.closeOpen({
      reportId: REPORT_ID,
      actorUserId: 'admin-user',
      internalNote: 'Corrected upstream.',
    })

    expect(closed).toMatchObject({
      state: 'closed',
      closure: {
        actorUserId: 'admin-user',
        closedAt,
        internalNote: 'Corrected upstream.',
      },
    })
    const [sql, parameters] = calls[0]!
    expect(sql).toContain("state = 'closed'")
    expect(sql).toContain('closed_at = clock_timestamp()')
    expect(sql).toContain("AND state = 'open'")
    expect(sql.match(/\bUPDATE\b/g)).toHaveLength(1)
    const updateAssignments = sql.slice(sql.indexOf('SET'), sql.indexOf('WHERE'))
    expect(updateAssignments).not.toMatch(
      /reporter_user_id|stable_song_id|stable_chart_id|publication_|target_field_key|category|current_value|proposed_value|explanation|source_urls/,
    )
    expect(parameters).toEqual([REPORT_ID, 'admin-user', 'Corrected upstream.'])
  })

  it('returns undefined when the atomic open-state predicate loses a race', async () => {
    const { database } = databaseWithRows()
    const repository = createPostgresChartReportRepository(database)
    await expect(
      repository.closeOpen({
        reportId: REPORT_ID,
        actorUserId: 'admin-user',
        internalNote: null,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects inconsistent stored lifecycle and typed values instead of projecting corruption', async () => {
    const inconsistent = databaseWithRows(row({ state: 'open', close_note: 'orphan note' }))
    await expect(createPostgresChartReportRepository(inconsistent.database).findById(REPORT_ID)).rejects.toThrow(
      'Stored chart-report closure is incomplete',
    )

    const wrongType = databaseWithRows(row({ current_value: 'not a number' }))
    await expect(createPostgresChartReportRepository(wrongType.database).findById(REPORT_ID)).rejects.toMatchObject({
      name: 'ChartReportDomainFailure',
      code: 'INVALID_JSON_SNAPSHOT',
    })
  })
})