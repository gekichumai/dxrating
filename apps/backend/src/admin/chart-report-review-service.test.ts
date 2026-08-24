import { describe, expect, it, vi } from 'vitest'
import { AdminGetChartReportDetailOutputSchema, AdminListChartReportsOutputSchema } from '@gekichumai/admin-contract'
import type { ChartReportPublicationIdentity, StoredChartReport } from '../chart-reports/chart-report-domain.js'
import type { ChartReportRepository } from '../chart-reports/chart-report-repository.js'
import { createChartReportService, type ChartReportService } from '../chart-reports/chart-report-service.js'
import type {
  ChartReportReviewStore,
  StoredChartReportReviewDetail,
  StoredChartReportReviewQueueItem,
} from './chart-report-review-store.js'
import { ChartReportReviewServiceFailure, createChartReportReviewService } from './chart-report-review-service.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'

const SONG_ID = 'dsng_23456789ab'
const CHART_ID = 'dsht_abcdefghjk'
const REPORT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_REPORT_ID = '22222222-2222-4222-8222-222222222222'
const CREATED_AT = '2026-08-24T12:00:00.123456Z'
const SNAPSHOT_AS_OF = '2026-08-24T13:00:00.000Z'

const publication = (revision = '23', fingerprint = 'a'.repeat(64)): ChartReportPublicationIdentity => ({
  channel: 'production-v1',
  catalogRunId: revision,
  revision,
  fingerprintSha256: fingerprint,
})

const catalog = (level = '14+', includeChart = true) => ({
  schemaVersion: 1,
  updatedAt: '2026-08-24T12:00:00.000Z',
  categories: [{ category: 'maimai' }],
  versions: [{ version: 'CiRCLE' }],
  types: [{ type: 'dx', name: 'DX' }],
  difficulties: [{ difficulty: 'master', name: 'Master' }],
  servers: [{ id: 'jp', name: 'Japan' }],
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
      isLocked: false,
      searchAcronyms: [],
      sheets: includeChart
        ? [
            {
              id: CHART_ID,
              type: 'dx',
              difficulty: 'master',
              level,
              internalLevelValue: 14.7,
              noteDesigner: 'Designer',
              noteCounts: { tap: 400, hold: 0, slide: 0, touch: 0, break: 0, total: 400 },
              serverIds: ['jp'],
              isSpecial: false,
              version: 'CiRCLE',
              releaseDate: '2026-08-24',
              multiverInternalLevelValue: {},
            },
          ]
        : [],
    },
  ],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
})

const snapshot = (identity = publication(), body: unknown = catalog()) => ({
  publication: identity,
  publishedAt: CREATED_AT,
  bodyText: JSON.stringify(body),
})

const queueItem = (overrides: Partial<StoredChartReportReviewQueueItem> = {}): StoredChartReportReviewQueueItem => ({
  id: REPORT_ID,
  state: 'open',
  stableSongId: SONG_ID,
  stableChartId: CHART_ID,
  publication: publication(),
  fieldKey: 'chart.level',
  category: 'incorrect_value',
  currentValue: '14+',
  proposedValue: '15',
  explanation: 'The displayed level does not match the source.',
  createdAt: CREATED_AT,
  reporter: {
    userId: 'reporter-id',
    displayName: 'Reporter',
    emailVerified: false,
    persistedRole: 'user',
    currentlyBanned: false,
    banExpiresAt: null,
  },
  ...overrides,
})

const detail = (overrides: Partial<StoredChartReportReviewDetail> = {}): StoredChartReportReviewDetail => ({
  ...queueItem(),
  sourceUrls: ['https://example.com/evidence'],
  closure: null,
  publicChartReference: {
    legacySongId: 'legacy-song-id',
    sheetType: 'dx',
    sheetDifficulty: 'master',
  },
  ...overrides,
})

const store = (overrides: Partial<ChartReportReviewStore> = {}): ChartReportReviewStore => ({
  listReports: vi.fn(async () => ({ items: [], hasMore: false })),
  loadReportDetail: vi.fn(async () => undefined),
  loadCapturedPublications: vi.fn(async () => new Map()),
  loadActivePublication: vi.fn(async () => undefined),
  ...overrides,
})

const unusedReports: ChartReportService = {
  createReport: vi.fn(),
  getReport: vi.fn(),
  closeReport: vi.fn(),
}

const allowlist = (ids: readonly string[] = []) =>
  parseSuperAdministratorAllowlist(JSON.stringify(ids), ids.length === 0 ? undefined : '2026-01-01T00:00:00.000Z')

const service = (
  reviewStore: ChartReportReviewStore,
  superAdminIds: readonly string[] = [],
  reports: ChartReportService = unusedReports,
) =>
  createChartReportReviewService({
    store: reviewStore,
    reports,
    superAdministrators: allowlist(superAdminIds),
    now: () => new Date(SNAPSHOT_AS_OF),
  })

const expectFailure = async (operation: Promise<unknown>, code: ChartReportReviewServiceFailure['code']) => {
  await expect(operation).rejects.toMatchObject({ name: 'ChartReportReviewServiceFailure', code })
}

describe('chart-report review service', () => {
  it('normalizes filters, batches captured bodies, preserves duplicates, and emits a stable bound cursor', async () => {
    const first = queueItem({
      reporter: {
        ...queueItem().reporter,
        userId: 'super-reporter',
        emailVerified: false,
        persistedRole: 'admin',
        currentlyBanned: true,
        banExpiresAt: '2026-09-01T00:00:00.000000Z',
      },
      explanation: `${'😀'.repeat(120)}tail`,
    })
    const duplicate = queueItem({ id: OTHER_REPORT_ID })
    const listReports = vi.fn(async () => ({ items: [first, duplicate], hasMore: true }))
    const rawSnapshot = snapshot()
    let catalogBodyReads = 0
    const sharedSnapshot = {
      publication: rawSnapshot.publication,
      publishedAt: rawSnapshot.publishedAt,
      get bodyText() {
        catalogBodyReads += 1
        return rawSnapshot.bodyText
      },
    }
    const loadCapturedPublications = vi.fn(async (identities: readonly ChartReportPublicationIdentity[]) =>
      identities.length === 0 ? new Map() : new Map([['production-v1:23:23:' + 'a'.repeat(64), sharedSnapshot]]),
    )
    const reviewStore = store({ listReports, loadCapturedPublications })
    const review = service(reviewStore, ['super-reporter'])
    const output = await review.listChartReports({
      state: 'open',
      chartId: CHART_ID,
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      reporterUserId: 'super-reporter',
      submittedAtFromInclusive: '2026-08-01T00:00:00Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00+00:00',
      publicationRevision: '23',
      limit: 2,
    })

    expect(AdminListChartReportsOutputSchema.parse(output)).toEqual(output)
    expect(output.items).toHaveLength(2)
    expect(output.items.map((item) => item.id)).toEqual([REPORT_ID, OTHER_REPORT_ID])
    expect(output.items[0]).toMatchObject({
      chart: { songLabel: 'Captured Song', chartLabel: 'master (dx)' },
      reporter: {
        userId: 'super-reporter',
        emailVerified: false,
        effectiveRole: 'super_admin',
        accountStatus: { status: 'temporarily_banned', expiresAt: '2026-09-01T00:00:00.000000Z' },
      },
      explanationPreviewTruncated: true,
    })
    expect(output.items[0]!.explanationPreview.length).toBe(240)
    expect(output.items[0]!.explanationPreview.endsWith('\ud83d')).toBe(false)
    expect(output.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(output.normalizedFilters).toMatchObject({
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
    })
    expect(loadCapturedPublications).toHaveBeenCalledTimes(1)
    expect(loadCapturedPublications).toHaveBeenCalledWith([publication()])
    expect(catalogBodyReads).toBe(1)

    listReports.mockResolvedValueOnce({ items: [], hasMore: false })
    await review.listChartReports({
      state: 'open',
      chartId: CHART_ID,
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      reporterUserId: 'super-reporter',
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: '23',
      cursor: output.nextCursor!,
      limit: 2,
    })
    expect(listReports).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshotAsOf: SNAPSHOT_AS_OF,
        cursor: { isOpen: true, createdAt: CREATED_AT, id: OTHER_REPORT_ID },
      }),
    )
    expect(catalogBodyReads).toBe(1)
  })

  it('bounds distinct full-catalog bodies per review batch while preserving queue order', async () => {
    const items = Array.from({ length: 5 }, (_, index) => {
      const revision = String(index + 1)
      return queueItem({
        id: `10000000-0000-4000-8000-00000000000${revision}`,
        publication: publication(revision, revision.repeat(64)),
      })
    })
    const requestSizes: number[] = []
    const loadCapturedPublications = vi.fn(async (identities: readonly ChartReportPublicationIdentity[]) => {
      requestSizes.push(identities.length)
      return new Map(
        identities.map((identity) => [
          `production-v1:${identity.catalogRunId}:${identity.revision}:${identity.fingerprintSha256}`,
          snapshot(identity),
        ]),
      )
    })
    const review = service(
      store({
        listReports: vi.fn(async () => ({ items, hasMore: false })),
        loadCapturedPublications,
      }),
    )

    const output = await review.listChartReports({ limit: 5 })

    expect(output.items.map(({ id }) => id)).toEqual(items.map(({ id }) => id))
    expect(requestSizes).toEqual([4, 1])
  })

  it('renders sorted deterministic JSON previews without splitting Unicode and derives all account states', async () => {
    const items = [
      queueItem({
        id: REPORT_ID,
        reporter: { ...queueItem().reporter, currentlyBanned: true, banExpiresAt: null },
      }),
      queueItem({
        id: OTHER_REPORT_ID,
        reporter: { ...queueItem().reporter, userId: 'admin-id', persistedRole: 'admin' },
      }),
    ]
    const review = service(
      store({
        listReports: vi.fn(async () => ({ items, hasMore: false })),
        loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot()]])),
      }),
    )
    const output = await review.listChartReports({ limit: 50 })
    expect(output.items.map((item) => item.reporter.accountStatus)).toEqual([
      { status: 'permanently_banned' },
      { status: 'active' },
    ])
    expect(output.items[1]!.reporter.effectiveRole).toBe('admin')

    const mapItem = queueItem({
      fieldKey: 'chart.multiver_internal_levels',
      currentValue: { z: 1, a: 2 },
      proposedValue: { z: 3, a: 4 },
    })
    const mapCatalog = catalog() as any
    mapCatalog.songs[0].sheets[0].multiverInternalLevelValue = { a: 2, z: 1 }
    const mapOutput = await service(
      store({
        listReports: vi.fn(async () => ({ items: [mapItem], hasMore: false })),
        loadCapturedPublications: vi.fn(
          async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot(publication(), mapCatalog)]]),
        ),
      }),
    ).listChartReports({ limit: 1 })
    expect(mapOutput.items[0]!.currentValuePreview).toEqual({ text: '{"a":2,"z":1}', truncated: false })
  })

  it('rejects malformed filters, inverted dates, tampered cursors, and cross-filter cursor reuse', async () => {
    const reviewStore = store({
      listReports: vi.fn(async () => ({ items: [queueItem()], hasMore: true })),
      loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot()]])),
    })
    const review = service(reviewStore)
    await expectFailure(review.listChartReports({ limit: 0 } as any), 'VALIDATION_FAILED')
    await expectFailure(
      review.listChartReports({
        submittedAtFromInclusive: '2026-09-01T00:00:00Z',
        submittedAtBeforeExclusive: '2026-08-01T00:00:00Z',
        limit: 1,
      }),
      'VALIDATION_FAILED',
    )
    const first = await review.listChartReports({ state: 'open', limit: 1 })
    const cursorPayload = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const encodeCursorPayload = (payload: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(payload)).toString('base64url')
    await expectFailure(
      review.listChartReports({ state: 'closed', cursor: first.nextCursor!, limit: 1 }),
      'INVALID_CURSOR',
    )
    await expectFailure(review.listChartReports({ cursor: `${first.nextCursor}x`, limit: 1 }), 'INVALID_CURSOR')
    await expectFailure(
      review.listChartReports({
        state: 'open',
        cursor: encodeCursorPayload({ ...cursorPayload, createdAt: '2026-02-31T00:00:00.000000Z' }),
        limit: 1,
      }),
      'INVALID_CURSOR',
    )
    await expectFailure(
      review.listChartReports({
        state: 'open',
        cursor: encodeCursorPayload({ ...cursorPayload, asOf: '2026-02-31T00:00:00.000Z' }),
        limit: 1,
      }),
      'INVALID_CURSOR',
    )
    await expectFailure(
      review.listChartReports({
        state: 'open',
        cursor: encodeCursorPayload({ ...cursorPayload, asOf: '2026-08-24T12:00:00.123456Z' }),
        limit: 1,
      }),
      'INVALID_CURSOR',
    )
    await expectFailure(
      review.listChartReports({
        state: 'open',
        cursor: encodeCursorPayload({ ...cursorPayload, isOpen: false }),
        limit: 1,
      }),
      'INVALID_CURSOR',
    )
  })

  it('fails closed when any captured queue context is absent or corrupt', async () => {
    const item = queueItem()
    await expectFailure(
      service(
        store({
          listReports: vi.fn(async () => ({ items: [item], hasMore: false })),
          loadCapturedPublications: vi.fn(async () => new Map()),
        }),
      ).listChartReports({ limit: 1 }),
      'CHART_UNAVAILABLE',
    )
    await expectFailure(
      service(
        store({
          listReports: vi.fn(async () => ({ items: [item], hasMore: false })),
          loadCapturedPublications: vi.fn(
            async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot(publication(), { broken: true })]]),
          ),
        }),
      ).listChartReports({ limit: 1 }),
      'CHART_UNAVAILABLE',
    )
  })

  it('returns captured labels and a current comparison while redacting non-contract identity data', async () => {
    const captured = snapshot()
    const activeIdentity = publication('24', 'b'.repeat(64))
    const stored = detail() as StoredChartReportReviewDetail & Record<string, unknown>
    stored.email = 'secret@example.com'
    stored.provider = 'google'
    stored.sessionToken = 'session-secret'
    stored.ipAddress = '192.0.2.1'
    stored.banReason = 'private reason'
    const review = service(
      store({
        loadReportDetail: vi.fn(async () => stored),
        loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), captured]])),
        loadActivePublication: vi.fn(async () => snapshot(activeIdentity, catalog('15'))),
      }),
    )
    const output = await review.getChartReportDetail({ reportId: REPORT_ID.toUpperCase() })
    expect(AdminGetChartReportDetailOutputSchema.parse(output)).toEqual(output)
    expect(output.report.capturedContext.chart).toMatchObject({
      songLabel: 'Captured Song',
      chartLabel: 'master (dx)',
    })
    expect(output.currentContext).toMatchObject({
      availability: 'current',
      publication: activeIdentity,
      currentValue: '15',
      chart: { songLabel: 'Captured Song', chartLabel: 'master (dx)' },
    })
    expect(output.publicChartReference).toEqual({
      legacySongId: 'legacy-song-id',
      sheetType: 'dx',
      sheetDifficulty: 'master',
    })
    expect(JSON.stringify(output)).not.toMatch(/secret@example|google|session-secret|192\.0\.2\.1|private reason/)
  })

  it('reuses one parsed catalog when captured and active publication identities match', async () => {
    const rawSnapshot = snapshot()
    let catalogBodyReads = 0
    const sharedSnapshot = {
      publication: rawSnapshot.publication,
      publishedAt: rawSnapshot.publishedAt,
      get bodyText() {
        catalogBodyReads += 1
        return rawSnapshot.bodyText
      },
    }
    const output = await service(
      store({
        loadReportDetail: vi.fn(async () => detail()),
        loadCapturedPublications: vi.fn(
          async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), sharedSnapshot]]),
        ),
        loadActivePublication: vi.fn(async () => sharedSnapshot),
      }),
    ).getChartReportDetail({ reportId: REPORT_ID })

    expect(output.currentContext).toMatchObject({ availability: 'current', currentValue: '14+' })
    expect(catalogBodyReads).toBe(1)
  })

  it('maps a chart absent from a valid active publication to retired and suppresses its retained public link', async () => {
    const activeIdentity = publication('24', 'b'.repeat(64))
    const output = await service(
      store({
        loadReportDetail: vi.fn(async () => detail()),
        loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot()]])),
        loadActivePublication: vi.fn(async () => snapshot(activeIdentity, catalog('14+', false))),
      }),
    ).getChartReportDetail({ reportId: REPORT_ID })
    expect(output.currentContext).toEqual({
      availability: 'retired',
      publication: activeIdentity,
      songId: SONG_ID,
      chartId: CHART_ID,
    })
    expect(output.publicChartReference).toBeNull()
  })

  it('maps missing reports to NOT_FOUND and unavailable or corrupt publications to CHART_UNAVAILABLE', async () => {
    await expectFailure(service(store()).getChartReportDetail({ reportId: REPORT_ID }), 'NOT_FOUND')
    await expectFailure(
      service(
        store({
          loadReportDetail: vi.fn(async () => detail()),
          loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot()]])),
          loadActivePublication: vi.fn(async () => undefined),
        }),
      ).getChartReportDetail({ reportId: REPORT_ID }),
      'CHART_UNAVAILABLE',
    )
    await expectFailure(
      service(
        store({
          loadReportDetail: vi.fn(async () => detail()),
          loadCapturedPublications: vi.fn(async () => new Map([['production-v1:23:23:' + 'a'.repeat(64), snapshot()]])),
          loadActivePublication: vi.fn(async () => snapshot(publication('24', 'b'.repeat(64)), { bad: true })),
        }),
      ).getChartReportDetail({ reportId: REPORT_ID }),
      'CHART_UNAVAILABLE',
    )
  })

  it('closes through the atomic domain service, normalizes notes, preserves idempotency, and rejects competitors', async () => {
    let stored: StoredChartReport = {
      id: REPORT_ID,
      reporterUserId: 'reporter-id',
      chart: { stableSongId: SONG_ID, stableChartId: CHART_ID },
      publication: publication(),
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      currentValue: '14+',
      proposedValue: '15',
      explanation: 'Evidence',
      sourceUrls: [],
      state: 'open',
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
      closure: null,
    }
    const repository: ChartReportRepository = {
      create: vi.fn(),
      findById: vi.fn(async () => stored),
      closeOpen: vi.fn(async ({ actorUserId, internalNote }) => {
        if (stored.state === 'closed') return undefined
        stored = {
          ...stored,
          state: 'closed',
          closure: {
            actorUserId,
            closedAt: new Date('2026-08-24T13:00:00.000Z'),
            internalNote,
          },
        }
        return stored
      }),
    }
    const review = service(store(), [], createChartReportService({ repository }))
    const request = {
      reportId: REPORT_ID,
      actorUserId: 'admin-id',
      expectedState: 'open',
      internalNote: '  reviewed against source  ',
    }
    const first = await review.closeChartReport(request)
    const repeated = await review.closeChartReport(request)
    expect(first).toEqual(repeated)
    expect(first).toEqual({
      id: REPORT_ID,
      state: 'closed',
      closure: {
        actorUserId: 'admin-id',
        closedAt: '2026-08-24T13:00:00.000Z',
        internalNote: 'reviewed against source',
      },
    })
    expect(Object.keys(first)).toEqual(['id', 'state', 'closure'])
    await expectFailure(review.closeChartReport({ ...request, actorUserId: 'competing-admin' }), 'CONFLICT')
    await expectFailure(review.closeChartReport({ ...request, expectedState: 'closed' }), 'VALIDATION_FAILED')
  })
})