import {
  ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT,
  ADMIN_COMMENT_HISTORY_MAX_LIMIT,
  ADMIN_COMMENT_THREAD_DEFAULT_LIMIT,
  ADMIN_COMMENT_THREAD_MAX_LIMIT,
  ADMIN_DELETED_COMMENT_PREVIEW,
  ADMIN_RECENT_COMMENT_DEFAULT_LIMIT,
  ADMIN_RECENT_COMMENT_MAX_LIMIT,
  ADMIN_USER_HISTORY_DEFAULT_LIMIT,
  ADMIN_USER_HISTORY_MAX_LIMIT,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import { describe, expect, it, vi } from 'vitest'
import {
  CommentContextServiceFailure,
  createCommentContextService,
  type CommentContextService,
} from './comment-context-service.js'
import {
  CommentContextStoreFailure,
  type ActiveCatalogPublication,
  type CommentContextStore,
  type StoredChartContext,
  type StoredChartTuple,
  type StoredCommentThreadItem,
  type StoredCommentThreadSegment,
  type StoredRecentComment,
} from './comment-context-store.js'
import {
  CommentModerationServiceFailure,
  type CommentModerationEvidenceDetail,
  type CommentModerationService,
} from './comment-moderation-service.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { UserModerationServiceFailure, type UserModerationService } from './user-moderation-service.js'

const ALLOWLIST_EFFECTIVE_AT = '2000-01-01T00:00:00.000Z'
const EXACT_CREATED_AT = '2026-08-24T12:34:56.123456Z'
const ISO_CREATED_AT = '2026-08-24T12:34:56.123Z'
const ISO_MODERATED_AT = '2026-08-24T13:00:00.000Z'
const ISO_EVALUATED_AT = '2026-08-24T14:00:00.000Z'
const STABLE_SONG_ID = 'dsng_23456789ab'
const STABLE_CHART_ID = 'dsht_bcdefghjkm'
const OTHER_STABLE_SONG_ID = 'dsng_cdefghjkmn'
const OTHER_STABLE_CHART_ID = 'dsht_defghjkmnp'

const ACTIVE_PUBLICATION: ActiveCatalogPublication = {
  channel: 'production-v1',
  catalogRunId: '17',
  revision: '23',
  publishedAt: '2026-08-24T10:00:00.000Z',
}

const storedChart = (overrides: Partial<StoredChartContext> = {}): StoredChartContext => ({
  songId: 'legacy-song-id',
  sheetType: 'dx',
  sheetDifficulty: 'master',
  availability: 'current',
  stableSongId: STABLE_SONG_ID,
  stableChartId: STABLE_CHART_ID,
  songTitle: 'Chart Song',
  songArtist: 'Chart Artist',
  songRetiredAt: null,
  chartRetiredAt: null,
  ...overrides,
})

const storedAuthor = (overrides: Partial<StoredRecentComment['author']> = {}): StoredRecentComment['author'] => ({
  userId: 'comment-author',
  displayName: 'Comment Author',
  persistedRole: 'user',
  currentlyBanned: false,
  ...overrides,
})

const recentComment = (overrides: Partial<StoredRecentComment> = {}): StoredRecentComment => ({
  id: '42',
  parentId: null,
  rootId: '42',
  threadIntegrity: 'ok',
  createdAt: EXACT_CREATED_AT,
  status: 'active',
  preview: 'A useful chart comment',
  previewTruncated: false,
  author: storedAuthor(),
  chart: storedChart(),
  ...overrides,
})

const threadItem = (overrides: Partial<StoredCommentThreadItem> = {}): StoredCommentThreadItem => ({
  id: '42',
  parentId: null,
  rootId: '42',
  depth: 0,
  createdAt: EXACT_CREATED_AT,
  originalBody: 'Immutable root body',
  author: storedAuthor(),
  chart: {
    songId: 'legacy-song-id',
    sheetType: 'dx',
    sheetDifficulty: 'master',
  },
  state: {
    status: 'active',
    stateVersion: null,
    actorUserId: null,
    moderatedAt: null,
    reason: null,
  },
  ...overrides,
})

const moderationEvidence = (
  overrides: Partial<CommentModerationEvidenceDetail> = {},
): CommentModerationEvidenceDetail => ({
  comment: {
    id: '42',
    parentId: null,
    authorUserId: 'comment-author',
    chart: {
      songId: 'legacy-song-id',
      sheetType: 'dx',
      sheetDifficulty: 'master',
    },
    createdAt: ISO_CREATED_AT,
    originalBody: 'Privileged immutable body',
  },
  state: {
    status: 'visible',
    stateVersion: null,
    actorUserId: null,
    moderatedAt: null,
    reason: null,
  },
  commentHistory: { items: [], nextCursor: null },
  ...overrides,
})

const authorDetail = (
  overrides: Partial<AdminContractOutputs['getUserModerationDetail']> = {},
): AdminContractOutputs['getUserModerationDetail'] => ({
  userId: 'comment-author',
  displayName: 'Comment Author',
  email: 'comment-author@example.test',
  emailVerified: true,
  effectiveRole: 'user',
  banState: {
    status: 'unbanned',
    stateVersion: null,
    reason: null,
    actorUserId: null,
    banStartedAt: null,
    expiresAt: null,
    evaluatedAt: ISO_EVALUATED_AT,
  },
  ...overrides,
})

const chartKey = ({ songId, sheetType, sheetDifficulty }: StoredChartTuple): string =>
  JSON.stringify([songId, sheetType, sheetDifficulty])

const createStore = (overrides: Partial<CommentContextStore> = {}): CommentContextStore => ({
  loadExistingUsersById: vi.fn<CommentContextStore['loadExistingUsersById']>(async (userIds) =>
    userIds.map((id) => ({ id })),
  ),
  resolveStableChartFilter: vi.fn<CommentContextStore['resolveStableChartFilter']>(async () => undefined),
  listRecentComments: vi.fn<CommentContextStore['listRecentComments']>(async () => ({
    items: [],
    hasMore: false,
    activePublication: null,
  })),
  resolveStoredChartContexts: vi.fn<CommentContextStore['resolveStoredChartContexts']>(async (charts) => ({
    contexts: new Map(charts.map((chart) => [chartKey(chart), storedChart(chart)])),
    activePublication: ACTIVE_PUBLICATION,
  })),
  loadCommentThreadSegment: vi.fn<CommentContextStore['loadCommentThreadSegment']>(async ({ commentId }) => ({
    rootId: commentId,
    highWaterId: commentId,
    items: [threadItem({ id: commentId, rootId: commentId })],
    hasMore: false,
  })),
  ...overrides,
})

const createCommentModeration = (overrides: Partial<CommentModerationService> = {}): CommentModerationService => ({
  getCommentModerationDetail: vi.fn(async () => moderationEvidence()),
  deleteComment: vi.fn<CommentModerationService['deleteComment']>(),
  restoreComment: vi.fn<CommentModerationService['restoreComment']>(),
  ...overrides,
})

const createUserModeration = (overrides: Partial<UserModerationService> = {}): UserModerationService => ({
  searchUsers: vi.fn<UserModerationService['searchUsers']>(),
  getUserModerationDetail: vi.fn(async (userId) => authorDetail({ userId })),
  listBanHistory: vi.fn(async () => ({ items: [], nextCursor: null })),
  banUser: vi.fn<UserModerationService['banUser']>(),
  unbanUser: vi.fn<UserModerationService['unbanUser']>(),
  ...overrides,
})

const createService = ({
  store = createStore(),
  commentModeration = createCommentModeration(),
  userModeration = createUserModeration(),
  allowlistedUserIds = ['super-author'],
}: {
  readonly store?: CommentContextStore
  readonly commentModeration?: CommentModerationService
  readonly userModeration?: UserModerationService
  readonly allowlistedUserIds?: readonly string[]
} = {}): CommentContextService =>
  createCommentContextService({
    store,
    commentModeration,
    userModeration,
    superAdministrators: parseSuperAdministratorAllowlist(JSON.stringify(allowlistedUserIds), ALLOWLIST_EFFECTIVE_AT),
  })

const decodeOpaqueCursor = (cursor: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>

const encodeOpaqueCursor = (payload: unknown): string => Buffer.from(JSON.stringify(payload)).toString('base64url')

describe('comment context service', () => {
  it('uses pagination defaults, accepts every upper bound, and rejects out-of-range limits before reading', async () => {
    const listRecentComments = vi.fn<CommentContextStore['listRecentComments']>(async () => ({
      items: [],
      hasMore: false,
      activePublication: null,
    }))
    const loadCommentThreadSegment = vi.fn<CommentContextStore['loadCommentThreadSegment']>(async ({ commentId }) => ({
      rootId: commentId,
      highWaterId: commentId,
      items: [threadItem({ id: commentId, rootId: commentId })],
      hasMore: false,
    }))
    const getCommentModerationDetail = vi.fn<CommentModerationService['getCommentModerationDetail']>(async () =>
      moderationEvidence(),
    )
    const listBanHistory = vi.fn<UserModerationService['listBanHistory']>(async () => ({
      items: [],
      nextCursor: null,
    }))
    const service = createService({
      store: createStore({ listRecentComments, loadCommentThreadSegment }),
      commentModeration: createCommentModeration({
        getCommentModerationDetail,
      }),
      userModeration: createUserModeration({ listBanHistory }),
    })

    await service.listRecentComments({})
    await service.listRecentComments({ limit: ADMIN_RECENT_COMMENT_MAX_LIMIT })
    expect(listRecentComments).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: ADMIN_RECENT_COMMENT_DEFAULT_LIMIT }),
    )
    expect(listRecentComments).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: ADMIN_RECENT_COMMENT_MAX_LIMIT }),
    )

    await service.getCommentModerationDetail({ commentId: '42' })
    expect(loadCommentThreadSegment).toHaveBeenNthCalledWith(1, {
      commentId: '42',
      cursor: undefined,
      limit: ADMIN_COMMENT_THREAD_DEFAULT_LIMIT,
    })
    expect(getCommentModerationDetail).toHaveBeenNthCalledWith(1, {
      commentId: '42',
      cursor: undefined,
      limit: ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT,
    })
    expect(listBanHistory).toHaveBeenNthCalledWith(1, {
      userId: 'comment-author',
      cursor: undefined,
      limit: ADMIN_USER_HISTORY_DEFAULT_LIMIT,
    })

    await service.getCommentModerationDetail({
      commentId: '42',
      threadLimit: ADMIN_COMMENT_THREAD_MAX_LIMIT,
      commentHistoryLimit: ADMIN_COMMENT_HISTORY_MAX_LIMIT,
      authorBanHistoryLimit: ADMIN_USER_HISTORY_MAX_LIMIT,
    })
    expect(loadCommentThreadSegment).toHaveBeenNthCalledWith(2, {
      commentId: '42',
      cursor: undefined,
      limit: ADMIN_COMMENT_THREAD_MAX_LIMIT,
    })
    expect(getCommentModerationDetail).toHaveBeenNthCalledWith(2, {
      commentId: '42',
      cursor: undefined,
      limit: ADMIN_COMMENT_HISTORY_MAX_LIMIT,
    })
    expect(listBanHistory).toHaveBeenNthCalledWith(2, {
      userId: 'comment-author',
      cursor: undefined,
      limit: ADMIN_USER_HISTORY_MAX_LIMIT,
    })

    for (const limit of [0, ADMIN_RECENT_COMMENT_MAX_LIMIT + 1, 1.5]) {
      await expect(service.listRecentComments({ limit })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    for (const query of [
      { threadLimit: ADMIN_COMMENT_THREAD_MAX_LIMIT + 1 },
      { commentHistoryLimit: ADMIN_COMMENT_HISTORY_MAX_LIMIT + 1 },
      { authorBanHistoryLimit: ADMIN_USER_HISTORY_MAX_LIMIT + 1 },
    ]) {
      await expect(service.getCommentModerationDetail({ commentId: '42', ...query })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      })
    }
    expect(listRecentComments).toHaveBeenCalledTimes(2)
    expect(getCommentModerationDetail).toHaveBeenCalledTimes(2)
  })

  it('normalizes and combines every feed filter before constructing the bounded store query', async () => {
    const resolveStableChartFilter = vi.fn<CommentContextStore['resolveStableChartFilter']>(async () => ({
      stableSongId: STABLE_SONG_ID,
      stableChartId: STABLE_CHART_ID,
      storedSongIds: ['legacy-a', 'legacy-b'],
      sheetType: 'dx',
      sheetDifficulty: 'master',
    }))
    const listRecentComments = vi.fn<CommentContextStore['listRecentComments']>(async () => ({
      items: [],
      hasMore: false,
      activePublication: null,
    }))
    const service = createService({
      store: createStore({ resolveStableChartFilter, listRecentComments }),
    })

    const output = await service.listRecentComments({
      authorUserId: 'comment-author',
      chartId: STABLE_CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-24T13:00:00.123+01:00',
      createdAtBeforeExclusive: '2026-08-25T01:00:00.987+01:00',
      limit: 7,
    })

    expect(resolveStableChartFilter).toHaveBeenCalledWith(STABLE_CHART_ID)
    expect(listRecentComments).toHaveBeenCalledWith({
      filters: {
        authorUserId: 'comment-author',
        chart: {
          storedSongIds: ['legacy-a', 'legacy-b'],
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        status: 'deleted',
        createdAtFrom: '2026-08-24T12:00:00.123Z',
        createdAtBefore: '2026-08-25T00:00:00.987Z',
      },
      cursor: undefined,
      limit: 7,
    })
    expect(output.normalizedFilters).toEqual({
      authorUserId: 'comment-author',
      chartId: STABLE_CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-24T12:00:00.123Z',
      createdAtBeforeExclusive: '2026-08-25T00:00:00.987Z',
    })
  })

  it('preserves exact microseconds in an opaque keyset and resumes equal-timestamp rows without duplicates', async () => {
    const firstItem = recentComment({ id: '42', createdAt: EXACT_CREATED_AT })
    const secondItem = recentComment({ id: '41', createdAt: EXACT_CREATED_AT })
    const listRecentComments = vi
      .fn<CommentContextStore['listRecentComments']>()
      .mockResolvedValueOnce({
        items: [firstItem],
        hasMore: true,
        activePublication: ACTIVE_PUBLICATION,
      })
      .mockResolvedValueOnce({
        items: [secondItem],
        hasMore: false,
        activePublication: ACTIVE_PUBLICATION,
      })
    const service = createService({
      store: createStore({ listRecentComments }),
    })
    const filters = {
      authorUserId: 'comment-author',
      status: 'active' as const,
      limit: 1,
    }

    const first = await service.listRecentComments(filters)
    expect(first.nextCursor).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]+$/))
    expect(decodeOpaqueCursor(first.nextCursor!)).toEqual({
      version: 1,
      filterDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      lastCreatedAt: EXACT_CREATED_AT,
      lastCommentId: '42',
    })
    expect(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')).not.toContain('comment-author')

    const second = await service.listRecentComments({
      ...filters,
      cursor: first.nextCursor!,
    })
    expect(listRecentComments).toHaveBeenNthCalledWith(2, {
      filters: { authorUserId: 'comment-author', status: 'active' },
      cursor: { createdAt: EXACT_CREATED_AT, id: '42' },
      limit: 1,
    })
    expect([...first.items, ...second.items].map(({ id }) => id)).toEqual(['42', '41'])
    expect(new Set([...first.items, ...second.items].map(({ id }) => id))).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
  })

  it('sanitizes active previews and redacts deleted rows while projecting effective roles', async () => {
    const originalBody = 'DO NOT LEAK: immutable original comment'
    const deletionReason = 'DO NOT LEAK: private deletion rationale'
    const listRecentComments = vi.fn<CommentContextStore['listRecentComments']>(async () => ({
      items: [
        recentComment({
          id: '43',
          preview: '  Useful\u0001\tcomment\npreview  ',
        }),
        recentComment({
          status: 'deleted',
          preview: `${originalBody}\n${deletionReason}`,
          previewTruncated: true,
          author: storedAuthor({
            userId: 'super-author',
            displayName: 'Super Author',
            persistedRole: 'user',
            currentlyBanned: true,
          }),
        }),
      ],
      hasMore: false,
      activePublication: ACTIVE_PUBLICATION,
    }))

    const output = await createService({
      store: createStore({ listRecentComments }),
    }).listRecentComments({})

    expect(output.items[0]).toMatchObject({
      id: '43',
      status: 'active',
      bodyPreview: 'Useful comment preview',
      bodyPreviewTruncated: false,
    })
    expect(output.items[1]).toMatchObject({
      status: 'deleted',
      bodyPreview: ADMIN_DELETED_COMMENT_PREVIEW,
      bodyPreviewTruncated: false,
      author: {
        userId: 'super-author',
        effectiveRole: 'super_admin',
        isBanned: true,
      },
    })
    expect(JSON.stringify(output)).not.toContain(originalBody)
    expect(JSON.stringify(output)).not.toContain(deletionReason)
  })

  it('projects current, historical, unresolved, and catalog-unavailable chart rows without losing legacy identity', async () => {
    const current = storedChart()
    const historical = storedChart({
      songId: 'retired-legacy-id',
      availability: 'historical',
      stableSongId: OTHER_STABLE_SONG_ID,
      stableChartId: OTHER_STABLE_CHART_ID,
      songTitle: 'Retired Song',
      songRetiredAt: '2026-01-01T00:00:00.000Z',
      chartRetiredAt: '2026-01-01T00:00:00.000Z',
    })
    const unresolved = storedChart({
      songId: 'unmapped-legacy-id',
      availability: 'unresolved',
      stableSongId: null,
      stableChartId: null,
      songTitle: null,
    })
    const catalogUnavailable = storedChart({
      songId: 'catalog-offline-legacy-id',
      availability: 'catalog_unavailable',
      stableSongId: null,
      stableChartId: null,
      songTitle: null,
    })
    const listRecentComments = vi.fn<CommentContextStore['listRecentComments']>(async () => ({
      items: [current, historical, unresolved, catalogUnavailable].map((chart, index) =>
        recentComment({ id: String(50 - index), chart }),
      ),
      hasMore: false,
      activePublication: ACTIVE_PUBLICATION,
    }))

    const output = await createService({
      store: createStore({ listRecentComments }),
    }).listRecentComments({})

    expect(output.activePublication).toEqual({
      channel: 'production-v1',
      catalogRunId: '17',
      revision: '23',
    })
    expect(output.items.map(({ chart }) => chart)).toEqual([
      {
        availability: 'current',
        legacyReference: {
          legacySongId: 'legacy-song-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        songLabel: 'Chart Song',
        chartLabel: 'master (dx)',
        songId: STABLE_SONG_ID,
        chartId: STABLE_CHART_ID,
      },
      {
        availability: 'historical',
        legacyReference: {
          legacySongId: 'retired-legacy-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        songLabel: 'Retired Song',
        chartLabel: 'master (dx)',
        songId: OTHER_STABLE_SONG_ID,
        chartId: OTHER_STABLE_CHART_ID,
      },
      {
        availability: 'unresolved',
        legacyReference: {
          legacySongId: 'unmapped-legacy-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        songLabel: 'unmapped-legacy-id',
        chartLabel: 'master (dx)',
        songId: null,
        chartId: null,
      },
      {
        availability: 'unresolved',
        legacyReference: {
          legacySongId: 'catalog-offline-legacy-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        songLabel: 'catalog-offline-legacy-id',
        chartLabel: 'master (dx)',
        songId: null,
        chartId: null,
      },
    ])
  })

  it('returns CHART_UNAVAILABLE when a stable chart filter is missing or its catalog cannot be read', async () => {
    const missingList = vi.fn<CommentContextStore['listRecentComments']>()
    const missingService = createService({
      store: createStore({
        resolveStableChartFilter: vi.fn(async () => undefined),
        listRecentComments: missingList,
      }),
    })
    await expect(missingService.listRecentComments({ chartId: STABLE_CHART_ID })).rejects.toMatchObject({
      code: 'CHART_UNAVAILABLE',
    })
    expect(missingList).not.toHaveBeenCalled()

    const unavailableList = vi.fn<CommentContextStore['listRecentComments']>()
    const unavailableService = createService({
      store: createStore({
        resolveStableChartFilter: vi.fn(async () => {
          throw new CommentContextStoreFailure('CATALOG_UNAVAILABLE')
        }),
        listRecentComments: unavailableList,
      }),
    })
    await expect(unavailableService.listRecentComments({ chartId: STABLE_CHART_ID })).rejects.toMatchObject({
      code: 'CHART_UNAVAILABLE',
    })
    expect(unavailableList).not.toHaveBeenCalled()
  })

  it('rejects malformed and cross-filter feed cursors without issuing a resumed query', async () => {
    const listRecentComments = vi.fn<CommentContextStore['listRecentComments']>().mockResolvedValue({
      items: [recentComment()],
      hasMore: true,
      activePublication: ACTIVE_PUBLICATION,
    })
    const service = createService({
      store: createStore({ listRecentComments }),
    })

    await expect(service.listRecentComments({ cursor: 'not-json' })).rejects.toBeInstanceOf(
      CommentContextServiceFailure,
    )
    const first = await service.listRecentComments({
      authorUserId: 'comment-author',
      limit: 1,
    })
    await expect(
      service.listRecentComments({
        authorUserId: 'different-author',
        limit: 1,
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })

    const payload = decodeOpaqueCursor(first.nextCursor!)
    const roundedMicroseconds = encodeOpaqueCursor({
      ...payload,
      lastCreatedAt: ISO_CREATED_AT,
    })
    await expect(
      service.listRecentComments({
        authorUserId: 'comment-author',
        limit: 1,
        cursor: roundedMicroseconds,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    expect(listRecentComments).toHaveBeenCalledTimes(1)
  })

  it('composes expanded detail, deterministic thread metadata, both histories, author state, and publication identity', async () => {
    const commentHistory = {
      items: [
        {
          id: '7',
          commentId: '42',
          actorUserId: 'admin-actor',
          previousEventId: null,
          action: 'delete' as const,
          reason: 'Harassment',
          createdAt: ISO_MODERATED_AT,
        },
      ],
      nextCursor: 'comment-history-cursor',
    }
    const evidence = moderationEvidence({
      comment: {
        id: '42',
        parentId: '10',
        authorUserId: 'super-author',
        chart: {
          songId: 'legacy-song-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        createdAt: ISO_CREATED_AT,
        originalBody: 'Selected immutable body',
      },
      state: {
        status: 'deleted',
        stateVersion: '7',
        actorUserId: 'admin-actor',
        moderatedAt: ISO_MODERATED_AT,
        reason: 'Harassment',
      },
      commentHistory,
    })
    const root = threadItem({
      id: '10',
      rootId: '10',
      createdAt: '2026-08-24T12:00:00.000001Z',
    })
    const selected = threadItem({
      id: '42',
      parentId: '10',
      rootId: '10',
      depth: 1,
      originalBody: 'Selected immutable body',
      author: storedAuthor({
        userId: 'super-author',
        displayName: 'Super Author',
        persistedRole: 'user',
      }),
      state: {
        status: 'deleted',
        stateVersion: '7',
        actorUserId: 'admin-actor',
        moderatedAt: ISO_MODERATED_AT,
        reason: 'Harassment',
      },
    })
    const descendant = threadItem({
      id: '43',
      parentId: '42',
      rootId: '10',
      depth: 2,
      createdAt: '2026-08-24T12:35:00.000001Z',
      originalBody: 'Nested response',
      state: {
        status: 'active',
        stateVersion: '8',
        actorUserId: 'admin-actor',
        moderatedAt: '2026-08-24T13:05:00.000Z',
        reason: null,
      },
    })
    const loadCommentThreadSegment = vi.fn<CommentContextStore['loadCommentThreadSegment']>(async () => ({
      rootId: '10',
      highWaterId: '43',
      items: [root, selected, descendant],
      hasMore: false,
    }))
    const resolveStoredChartContexts = vi.fn<CommentContextStore['resolveStoredChartContexts']>(async (charts) => ({
      contexts: new Map([[chartKey(charts[0]!), storedChart()]]),
      activePublication: ACTIVE_PUBLICATION,
    }))
    const getCommentModerationDetail = vi.fn(async () => evidence)
    const getUserModerationDetail = vi.fn(async () =>
      authorDetail({
        userId: 'super-author',
        displayName: 'Super Author',
        effectiveRole: 'super_admin',
        banState: {
          status: 'permanent',
          stateVersion: '19',
          reason: 'Repeated abuse',
          actorUserId: 'admin-actor',
          banStartedAt: ISO_MODERATED_AT,
          expiresAt: null,
          evaluatedAt: ISO_EVALUATED_AT,
        },
      }),
    )
    const authorBanHistory: AdminContractOutputs['listUserBanHistory'] = {
      items: [
        {
          id: '19',
          subjectUserId: 'super-author',
          actorUserId: 'admin-actor',
          previousEventId: null,
          action: 'ban',
          kind: 'permanent',
          reason: 'Repeated abuse',
          banStartedAt: ISO_MODERATED_AT,
          expiresAt: null,
          createdAt: ISO_MODERATED_AT,
        },
      ],
      nextCursor: 'ban-history-cursor',
    }
    const listBanHistory = vi.fn(async () => authorBanHistory)
    const service = createService({
      store: createStore({
        loadCommentThreadSegment,
        resolveStoredChartContexts,
      }),
      commentModeration: createCommentModeration({
        getCommentModerationDetail,
      }),
      userModeration: createUserModeration({
        getUserModerationDetail,
        listBanHistory,
      }),
    })

    const output = await service.getCommentModerationDetail({
      commentId: '42',
    })

    expect(output.activePublication).toEqual({
      channel: 'production-v1',
      catalogRunId: '17',
      revision: '23',
    })
    expect(output.comment).toEqual({
      ...evidence.comment,
      rootId: '10',
      chart: {
        availability: 'current',
        legacyReference: {
          legacySongId: 'legacy-song-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        songLabel: 'Chart Song',
        chartLabel: 'master (dx)',
        songId: STABLE_SONG_ID,
        chartId: STABLE_CHART_ID,
      },
    })
    expect(output.state).toEqual(evidence.state)
    expect(output.author).toEqual(await getUserModerationDetail.mock.results[0]!.value)
    expect(output.commentHistory).toEqual(commentHistory)
    expect(output.authorBanHistory).toEqual(authorBanHistory)
    expect(output.thread).toEqual({
      items: [
        {
          id: '10',
          parentId: null,
          rootId: '10',
          depth: 0,
          createdAt: root.createdAt,
          originalBody: root.originalBody,
          state: {
            status: 'visible',
            stateVersion: null,
            actorUserId: null,
            moderatedAt: null,
            reason: null,
          },
          author: {
            userId: 'comment-author',
            displayName: 'Comment Author',
            effectiveRole: 'user',
            isBanned: false,
          },
        },
        {
          id: '42',
          parentId: '10',
          rootId: '10',
          depth: 1,
          createdAt: selected.createdAt,
          originalBody: 'Selected immutable body',
          state: {
            status: 'deleted',
            stateVersion: '7',
            actorUserId: 'admin-actor',
            moderatedAt: ISO_MODERATED_AT,
            reason: 'Harassment',
          },
          author: {
            userId: 'super-author',
            displayName: 'Super Author',
            effectiveRole: 'super_admin',
            isBanned: false,
          },
        },
        {
          id: '43',
          parentId: '42',
          rootId: '10',
          depth: 2,
          createdAt: descendant.createdAt,
          originalBody: 'Nested response',
          state: {
            status: 'visible',
            stateVersion: '8',
            actorUserId: 'admin-actor',
            moderatedAt: '2026-08-24T13:05:00.000Z',
            reason: null,
          },
          author: {
            userId: 'comment-author',
            displayName: 'Comment Author',
            effectiveRole: 'user',
            isBanned: false,
          },
        },
      ],
      completeness: 'complete',
      nextCursor: null,
    })
    expect(resolveStoredChartContexts).toHaveBeenCalledWith([evidence.comment.chart])
  })

  it('binds partial thread cursors to the selected comment, root, high-water mark, and last item', async () => {
    const firstSegment: StoredCommentThreadSegment = {
      rootId: '10',
      highWaterId: '99',
      items: [threadItem({ id: '10', rootId: '10' })],
      hasMore: true,
    }
    const secondSegment: StoredCommentThreadSegment = {
      rootId: '10',
      highWaterId: '99',
      items: [threadItem({ id: '42', parentId: '10', rootId: '10', depth: 1 })],
      hasMore: false,
    }
    const loadCommentThreadSegment = vi
      .fn<CommentContextStore['loadCommentThreadSegment']>()
      .mockResolvedValueOnce(firstSegment)
      .mockResolvedValueOnce(secondSegment)
    const service = createService({
      store: createStore({ loadCommentThreadSegment }),
      commentModeration: createCommentModeration({
        getCommentModerationDetail: vi.fn(async () =>
          moderationEvidence({
            comment: {
              ...moderationEvidence().comment,
              id: '42',
              parentId: '10',
            },
          }),
        ),
      }),
    })

    const first = await service.getCommentModerationDetail({
      commentId: '42',
      threadLimit: 1,
    })
    expect(first.thread.completeness).toBe('partial')
    expect(decodeOpaqueCursor(first.thread.nextCursor!)).toEqual({
      version: 1,
      selectedCommentId: '42',
      rootId: '10',
      highWaterId: '99',
      lastCommentId: '10',
    })

    const second = await service.getCommentModerationDetail({
      commentId: '42',
      threadLimit: 1,
      threadCursor: first.thread.nextCursor!,
    })
    expect(loadCommentThreadSegment).toHaveBeenNthCalledWith(2, {
      commentId: '42',
      cursor: { rootId: '10', highWaterId: '99', lastCommentId: '10' },
      limit: 1,
    })
    expect(second.thread).toMatchObject({
      completeness: 'complete',
      nextCursor: null,
    })
    expect(second.thread.items.map(({ id }) => id)).toEqual(['42'])
  })

  it('maps malformed, cross-comment, and store-stale thread cursors to INVALID_CURSOR', async () => {
    const loadCommentThreadSegment = vi
      .fn<CommentContextStore['loadCommentThreadSegment']>()
      .mockResolvedValueOnce({
        rootId: '42',
        highWaterId: '50',
        items: [threadItem()],
        hasMore: true,
      })
      .mockRejectedValueOnce(new CommentContextStoreFailure('INVALID_THREAD_CURSOR'))
    const getCommentModerationDetail = vi.fn(async () => moderationEvidence())
    const service = createService({
      store: createStore({ loadCommentThreadSegment }),
      commentModeration: createCommentModeration({
        getCommentModerationDetail,
      }),
    })

    await expect(
      service.getCommentModerationDetail({
        commentId: '42',
        threadCursor: 'not-json',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    const first = await service.getCommentModerationDetail({
      commentId: '42',
      threadLimit: 1,
    })
    await expect(
      service.getCommentModerationDetail({
        commentId: '43',
        threadCursor: first.thread.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    await expect(
      service.getCommentModerationDetail({
        commentId: '42',
        threadCursor: first.thread.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    expect(getCommentModerationDetail).toHaveBeenCalledTimes(2)
    expect(loadCommentThreadSegment).toHaveBeenCalledTimes(2)
  })

  it('preserves typed NOT_FOUND failures for a missing selected comment or missing thread', async () => {
    const missingCommentStore = createStore({
      loadCommentThreadSegment: vi.fn<CommentContextStore['loadCommentThreadSegment']>(),
    })
    const missingCommentService = createService({
      store: missingCommentStore,
      commentModeration: createCommentModeration({
        getCommentModerationDetail: vi.fn(async () => {
          throw new CommentModerationServiceFailure('NOT_FOUND')
        }),
      }),
    })
    await expect(missingCommentService.getCommentModerationDetail({ commentId: '42' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(missingCommentStore.loadCommentThreadSegment).not.toHaveBeenCalled()

    const missingThreadService = createService({
      store: createStore({
        loadCommentThreadSegment: vi.fn(async () => undefined),
      }),
    })
    await expect(missingThreadService.getCommentModerationDetail({ commentId: '42' })).rejects.toEqual(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
  })

  it('maps a malformed author-ban history cursor from the user service to INVALID_CURSOR', async () => {
    const listBanHistory = vi.fn<UserModerationService['listBanHistory']>(async () => {
      throw new UserModerationServiceFailure('VALIDATION_FAILED')
    })
    const service = createService({
      userModeration: createUserModeration({ listBanHistory }),
    })

    await expect(
      service.getCommentModerationDetail({
        commentId: '42',
        authorBanHistoryCursor: 'malformed-but-opaque',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    expect(listBanHistory).toHaveBeenCalledWith({
      userId: 'comment-author',
      cursor: 'malformed-but-opaque',
      limit: ADMIN_USER_HISTORY_DEFAULT_LIMIT,
    })
  })
})