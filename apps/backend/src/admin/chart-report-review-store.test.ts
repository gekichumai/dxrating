import type { QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  chartReportReviewPublicationKey,
  createPostgresChartReportReviewStore,
  type ChartReportReviewDatabase,
  type ChartReportReviewPublicationIdentity,
} from './chart-report-review-store.js'

const REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const SECOND_REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd0'
const FINGERPRINT = 'a'.repeat(64)
const SECOND_FINGERPRINT = 'b'.repeat(64)
const SNAPSHOT_AS_OF = '2026-08-24T13:00:00.000Z'
const OPEN_AT_SNAPSHOT_SQL = '(report.closed_at IS NULL OR report.closed_at >= $1::timestamptz)'
const STATE_AT_SNAPSHOT_SQL = `CASE WHEN ${OPEN_AT_SNAPSHOT_SQL} THEN 'open' ELSE 'closed' END`

type QueryHandler = (
  text: string,
  values: unknown[],
) => readonly Record<string, unknown>[] | Promise<readonly Record<string, unknown>[]>

const fakeDatabase = (handler: QueryHandler) => {
  const calls: Array<{ readonly text: string; readonly values: unknown[] }> = []
  const database: ChartReportReviewDatabase = {
    async query<Row extends QueryResultRow>(text: string, values: unknown[] = []) {
      calls.push({ text, values })
      return { rows: (await handler(text, values)) as Row[] }
    },
  }
  return { calls, database }
}

const queueRow = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  state: 'open',
  stable_song_id: 'dsng_23456789ab',
  stable_chart_id: 'dsht_abcdefghjk',
  publication_channel: 'production-v1',
  publication_catalog_run_id: '71',
  publication_revision: '23',
  publication_fingerprint_sha256: FINGERPRINT,
  target_field_key: 'chart.internal_level',
  category: 'incorrect_value',
  current_value: 14.5,
  proposed_value: 14.6,
  explanation: 'The published value differs from the game.',
  created_at_utc: '2026-08-24T12:34:56.123000Z',
  reporter_user_id: 'reporter-user',
  reporter_display_name: 'Visible Reporter',
  reporter_email_verified: false,
  reporter_persisted_role: 'user',
  reporter_currently_banned: false,
  reporter_ban_expires_at_utc: null,
  ...overrides,
})

const detailRow = (overrides: Record<string, unknown> = {}) => ({
  ...queueRow(),
  source_urls: ['https://example.com/evidence'],
  public_chart_reference: {
    legacySongId: 'legacy-song-id',
    sheetType: 'dx',
    sheetDifficulty: 'master',
  },
  closed_by_user_id: null,
  closer_display_name: null,
  closed_at_utc: null,
  close_note: null,
  ...overrides,
})

const publicationRow = (overrides: Record<string, unknown> = {}) => ({
  channel: 'production-v1',
  catalog_run_id: '71',
  publication_revision: '23',
  publication_fingerprint_sha256: FINGERPRINT,
  published_at_utc: '2026-08-24T10:11:12.654321Z',
  body_text: '{"version":1,"songs":[]}',
  ...overrides,
})

const publication = (overrides: Partial<ChartReportReviewPublicationIdentity> = {}) => ({
  channel: 'production-v1' as const,
  catalogRunId: '71',
  revision: '23',
  fingerprintSha256: FINGERPRINT,
  ...overrides,
})

describe('PostgreSQL administrator chart-report review store', () => {
  it('loads limit plus one in exact open-first/newest-first/UUID order and returns only the page', async () => {
    const { calls, database } = fakeDatabase(() => [
      queueRow(),
      queueRow({
        id: SECOND_REPORT_ID,
        state: 'closed',
        created_at_utc: '2026-08-24T12:34:55.999000Z',
        reporter_currently_banned: true,
        reporter_ban_expires_at_utc: '2026-09-01T00:00:00.000000Z',
      }),
      queueRow({ id: '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bcf' }),
    ])
    const store = createPostgresChartReportReviewStore(database)

    const page = await store.listReports({ filters: {}, snapshotAsOf: SNAPSHOT_AS_OF, limit: 2 })

    expect(page.hasMore).toBe(true)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toEqual({
      id: REPORT_ID,
      state: 'open',
      stableSongId: 'dsng_23456789ab',
      stableChartId: 'dsht_abcdefghjk',
      publication: publication(),
      fieldKey: 'chart.internal_level',
      category: 'incorrect_value',
      currentValue: 14.5,
      proposedValue: 14.6,
      explanation: 'The published value differs from the game.',
      createdAt: '2026-08-24T12:34:56.123000Z',
      reporter: {
        userId: 'reporter-user',
        displayName: 'Visible Reporter',
        emailVerified: false,
        persistedRole: 'user',
        currentlyBanned: false,
        banExpiresAt: null,
      },
    })
    expect(page.items[1]?.reporter).toMatchObject({
      currentlyBanned: true,
      banExpiresAt: '2026-09-01T00:00:00.000000Z',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.text).toContain('chart-report-review-store:list')
    expect(calls[0]?.text).toContain('report.created_at < $1::timestamptz')
    expect(calls[0]?.text).toContain(`${STATE_AT_SNAPSHOT_SQL} AS state`)
    expect(calls[0]?.text).toContain(`ORDER BY ${OPEN_AT_SNAPSHOT_SQL} DESC, report.created_at DESC, report.id DESC`)
    expect(calls[0]?.text).toContain('LIMIT $2::integer')
    expect(calls[0]?.values).toEqual([SNAPSHOT_AS_OF, 3])
  })

  it('keeps a report closed between pages in its snapshot-time open position', async () => {
    const { calls, database } = fakeDatabase(() => [queueRow()])
    const store = createPostgresChartReportReviewStore(database)

    const page = await store.listReports({
      filters: {},
      snapshotAsOf: SNAPSHOT_AS_OF,
      cursor: {
        isOpen: true,
        createdAt: '2026-08-24T12:34:57.123000Z',
        id: REPORT_ID,
      },
      limit: 25,
    })

    expect(page.items[0]?.state).toBe('open')
    expect(calls[0]?.text).toContain(`${STATE_AT_SNAPSHOT_SQL} AS state`)
    expect(calls[0]?.text).not.toContain('(report.closed_at IS NULL OR report.closed_at < $1::timestamptz)')
    expect(calls[0]?.text).toContain(
      `(${OPEN_AT_SNAPSHOT_SQL}, report.created_at, report.id) < ($2::boolean, $3::timestamptz, $4::uuid)`,
    )
    expect(calls[0]?.text).toContain(`ORDER BY ${OPEN_AT_SNAPSHOT_SQL} DESC, report.created_at DESC, report.id DESC`)
    expect(calls[0]?.values).toEqual([SNAPSHOT_AS_OF, true, '2026-08-24T12:34:57.123000Z', REPORT_ID, 26])
  })

  it('parameterizes every bounded filter alone and combines the complete normalized filter set with the tuple cursor', async () => {
    const singleFilters = [
      [{ state: 'open' as const }, `${STATE_AT_SNAPSHOT_SQL} = $2`, ['open']],
      [{ stableChartId: 'dsht_abcdefghjk' }, 'report.stable_chart_id = $2', ['dsht_abcdefghjk']],
      [{ fieldKey: 'chart.internal_level' as const }, 'report.target_field_key = $2', ['chart.internal_level']],
      [{ category: 'incorrect_value' as const }, 'report.category = $2', ['incorrect_value']],
      [{ reporterUserId: 'reporter-user' }, 'report.reporter_user_id = $2', ['reporter-user']],
      [
        { createdAtFrom: '2026-08-01T00:00:00.000Z' },
        'report.created_at >= $2::timestamptz',
        ['2026-08-01T00:00:00.000Z'],
      ],
      [
        { createdAtBefore: '2026-09-01T00:00:00.000Z' },
        'report.created_at < $2::timestamptz',
        ['2026-09-01T00:00:00.000Z'],
      ],
      [{ publicationRevision: '23' }, 'report.publication_revision = $2::bigint', ['23']],
    ] as const

    for (const [filters, sqlFragment, expectedValues] of singleFilters) {
      const fake = fakeDatabase(() => [])
      await createPostgresChartReportReviewStore(fake.database).listReports({
        filters,
        snapshotAsOf: SNAPSHOT_AS_OF,
        limit: 4,
      })
      expect(fake.calls[0]?.text).toContain(sqlFragment)
      expect(fake.calls[0]?.values).toEqual([SNAPSHOT_AS_OF, ...expectedValues, 5])
    }

    const { calls, database } = fakeDatabase(() => [])
    await createPostgresChartReportReviewStore(database).listReports({
      filters: {
        state: 'closed',
        stableChartId: 'dsht_abcdefghjk',
        fieldKey: 'chart.internal_level',
        category: 'incorrect_value',
        reporterUserId: 'reporter-user',
        createdAtFrom: '2026-08-01T00:00:00.000Z',
        createdAtBefore: '2026-09-01T00:00:00.000Z',
        publicationRevision: '23',
      },
      snapshotAsOf: SNAPSHOT_AS_OF,
      cursor: {
        isOpen: false,
        createdAt: '2026-08-24T12:34:56.123000Z',
        id: REPORT_ID,
      },
      limit: 25,
    })

    expect(calls[0]?.text).toContain(
      `(${OPEN_AT_SNAPSHOT_SQL}, report.created_at, report.id) < ($10::boolean, $11::timestamptz, $12::uuid)`,
    )
    expect(calls[0]?.text).toContain('LIMIT $13::integer')
    expect(calls[0]?.values).toEqual([
      SNAPSHOT_AS_OF,
      'closed',
      'dsht_abcdefghjk',
      'chart.internal_level',
      'incorrect_value',
      'reporter-user',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      '23',
      false,
      '2026-08-24T12:34:56.123000Z',
      REPORT_ID,
      26,
    ])
  })

  it('rejects a cursor that was not normalized before issuing SQL', async () => {
    const { calls, database } = fakeDatabase(() => [])
    await expect(
      createPostgresChartReportReviewStore(database).listReports({
        filters: {},
        snapshotAsOf: SNAPSHOT_AS_OF,
        cursor: { isOpen: true, createdAt: 'rounded', id: REPORT_ID },
        limit: 25,
      }),
    ).rejects.toThrow('cursor was not normalized')
    expect(calls).toHaveLength(0)
  })

  it('redacts evidence, closure notes, auth artifacts, and raw catalog bodies from queue SQL', async () => {
    const { calls, database } = fakeDatabase(() => [])
    await createPostgresChartReportReviewStore(database).listReports({
      filters: {},
      snapshotAsOf: SNAPSHOT_AS_OF,
      limit: 25,
    })
    const sql = calls[0]!.text

    expect(sql).toContain('report.current_value')
    expect(sql).toContain('report.proposed_value')
    expect(sql).toContain('report.explanation')
    expect(sql).not.toMatch(/source_urls|close_note|closed_by_user_id|body_text/i)
    expect(sql).not.toMatch(/report\.closed_at\s+(?:AS\s+|,)/i)
    expect(sql).not.toMatch(/\b(account|session|passkey|provider|token|ip_address|email)\b/i)
    expect(sql).not.toMatch(/ban_reason|actor_user_id|admin_user_ban_history/i)
  })

  it('loads one detail with stored evidence references, approved reporter moderation fields, and immutable closure metadata', async () => {
    const { calls, database } = fakeDatabase(() => [
      detailRow({
        state: 'closed',
        closed_by_user_id: 'admin-user',
        closer_display_name: 'Closing Admin',
        closed_at_utc: '2026-08-24T13:00:00.000000Z',
        close_note: 'Corrected in the producer.',
      }),
    ])
    const detail = await createPostgresChartReportReviewStore(database).loadReportDetail(REPORT_ID)

    expect(detail).toMatchObject({
      id: REPORT_ID,
      state: 'closed',
      sourceUrls: ['https://example.com/evidence'],
      publicChartReference: {
        legacySongId: 'legacy-song-id',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      },
      closure: {
        actor: { userId: 'admin-user', displayName: 'Closing Admin' },
        closedAt: '2026-08-24T13:00:00.000000Z',
        internalNote: 'Corrected in the producer.',
      },
    })
    const sql = calls[0]!.text
    expect(sql).toContain('chart-report-review-store:detail')
    expect(sql).toContain('report.source_urls')
    expect(sql).toContain('report.close_note')
    expect(sql).toContain('jsonb_build_object')
    expect(sql).toContain('LEFT JOIN dxdata.canonical_sheets canonical_sheet')
    expect(sql).toContain('canonical_sheet.id = report.stable_chart_id')
    expect(sql).toContain('canonical_sheet.song_id = report.stable_song_id')
    expect(sql).toContain('LEFT JOIN dxdata.canonical_songs canonical_song')
    expect(sql).toContain('canonical_song.id = report.stable_song_id')
    expect(sql).toContain('LEFT JOIN "user" closer')
    expect(sql.match(/INNER JOIN "user" reporter/g)).toHaveLength(1)
    expect(sql.match(/CROSS JOIN evaluation_clock/g)).toHaveLength(1)
    expect(sql).not.toMatch(/\b(account|session|passkey|provider|token|ip_address)\b/i)
    expect(sql).not.toMatch(/ban_reason|admin_user_ban_history/i)
    expect(calls[0]?.values).toEqual([REPORT_ID])
    expect(calls).toHaveLength(1)
  })

  it('returns a missing canonical public mapping as a successful null detail field', async () => {
    const { calls, database } = fakeDatabase(() => [detailRow({ public_chart_reference: null })])

    await expect(createPostgresChartReportReviewStore(database).loadReportDetail(REPORT_ID)).resolves.toMatchObject({
      id: REPORT_ID,
      publicChartReference: null,
    })
    expect(calls).toHaveLength(1)
  })

  it('batches and deduplicates captured publication reads by the complete immutable identity', async () => {
    const second = publication({
      catalogRunId: '72',
      revision: '24',
      fingerprintSha256: SECOND_FINGERPRINT,
    })
    const { calls, database } = fakeDatabase(() => [
      publicationRow(),
      publicationRow({
        catalog_run_id: '72',
        publication_revision: '24',
        publication_fingerprint_sha256: SECOND_FINGERPRINT,
        body_text: '{"version":1,"songs":[{"id":"second"}]}',
      }),
    ])
    const store = createPostgresChartReportReviewStore(database)
    const snapshots = await store.loadCapturedPublications([publication(), second, publication()])

    expect(calls).toHaveLength(1)
    expect(snapshots.size).toBe(2)
    expect(snapshots.get(chartReportReviewPublicationKey(publication()))).toMatchObject({
      publication: publication(),
      publishedAt: '2026-08-24T10:11:12.654321Z',
    })
    const sql = calls[0]!.text
    expect(sql).toContain('unnest($1::text[], $2::bigint[], $3::bigint[], $4::text[])')
    expect(sql).toContain('receipt.channel = requested.channel')
    expect(sql).toContain('receipt.catalog_run_id = requested.catalog_run_id')
    expect(sql).toContain('receipt.revision = requested.revision')
    expect(sql).toContain('receipt.publication_fingerprint_sha256 = requested.fingerprint_sha256')
    expect(sql).toContain('snapshot.body_sha256 = receipt.publication_fingerprint_sha256')
    expect(calls[0]?.values).toEqual([
      ['production-v1', 'production-v1'],
      ['71', '72'],
      ['23', '24'],
      [FINGERPRINT, SECOND_FINGERPRINT],
      1,
    ])
  })

  it('loads the active snapshot only through the exact receipt-backed pointer without fetching evidence URLs', async () => {
    const { calls, database } = fakeDatabase(() => [publicationRow()])
    const store = createPostgresChartReportReviewStore(database)

    await expect(store.loadActivePublication('production-v1')).resolves.toMatchObject({
      publication: publication(),
      bodyText: '{"version":1,"songs":[]}',
    })
    const sql = calls[0]!.text
    expect(sql).toContain('dxdata.catalog_publications publication')
    expect(sql).toContain('dxdata.catalog_publication_receipts receipt')
    expect(sql).toContain('receipt.catalog_run_id = publication.catalog_run_id')
    expect(sql).toContain('receipt.revision = publication.revision')
    expect(sql).toContain('receipt.publication_fingerprint_sha256 = publication.publication_fingerprint_sha256')
    expect(sql).toContain("build.status = 'published'")
    expect(sql).not.toMatch(/source_urls|https?:|fetch|curl/i)
    expect(calls[0]?.values).toEqual(['production-v1', 1])
  })

  it('rejects inconsistent reporter, closure, and publication projections rather than leaking corrupt rows', async () => {
    const badRole = fakeDatabase(() => [queueRow({ reporter_persisted_role: 'owner' })])
    await expect(
      createPostgresChartReportReviewStore(badRole.database).listReports({
        filters: {},
        snapshotAsOf: SNAPSHOT_AS_OF,
        limit: 1,
      }),
    ).rejects.toThrow('reporter role')

    const orphanClosure = fakeDatabase(() => [detailRow({ close_note: 'orphaned' })])
    await expect(
      createPostgresChartReportReviewStore(orphanClosure.database).loadReportDetail(REPORT_ID),
    ).rejects.toThrow('closure projection')

    const malformedPublicReference = fakeDatabase(() => [
      detailRow({
        public_chart_reference: {
          legacySongId: 'legacy-song-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
          guessedLabel: 'not allowed',
        },
      }),
    ])
    await expect(
      createPostgresChartReportReviewStore(malformedPublicReference.database).loadReportDetail(REPORT_ID),
    ).rejects.toThrow('public chart reference')

    const unexpectedPublication = fakeDatabase(() => [publicationRow({ publication_revision: '24' })])
    await expect(
      createPostgresChartReportReviewStore(unexpectedPublication.database).loadCapturedPublications([publication()]),
    ).rejects.toThrow('captured chart-report publication projection')
  })
})