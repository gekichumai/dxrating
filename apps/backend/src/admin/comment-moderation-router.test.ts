import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
import { CommentContextServiceFailure, type CommentContextService } from './comment-context-service.js'
import { CommentModerationServiceFailure, type CommentModerationService } from './comment-moderation-service.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { createAdminRouter, type AdminRequestContext } from './router.js'

const REQUEST_ID = '18d7118c-ec70-4603-9176-cffea8a6cd8f'
const CREATED_AT = '2026-08-24T10:00:00.000Z'
const DELETED_AT = '2026-08-24T12:00:00.000Z'
const RESTORED_AT = '2026-08-24T13:00:00.000Z'

const authentication = (recentPrimaryAuthSatisfied = true): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser: { id: 'admin-id', role: 'admin' },
  principal: {
    userId: 'admin-id',
    effectiveRole: 'admin',
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
  session: {
    id: 'admin-session-id',
    authorizationIssuedAt: new Date('2026-08-24T00:00:00.000Z'),
  },
  assurance: { recentPrimaryAuthSatisfied, freshLoginSatisfied: true },
})

const comment = {
  id: '42',
  parentId: null,
  authorUserId: 'target-id',
  chart: {
    songId: 'song-id',
    sheetType: 'dx',
    sheetDifficulty: 'master',
  },
  createdAt: CREATED_AT,
  originalBody: 'Immutable original comment body',
}

const initialState = {
  status: 'visible' as const,
  stateVersion: null,
  actorUserId: null,
  moderatedAt: null,
  reason: null,
}

const deleteEvent = {
  id: '7',
  commentId: comment.id,
  actorUserId: 'admin-id',
  previousEventId: null,
  action: 'delete' as const,
  reason: 'Repeated harassment',
  createdAt: DELETED_AT,
}

const deletedState = {
  status: 'deleted' as const,
  stateVersion: deleteEvent.id,
  actorUserId: deleteEvent.actorUserId,
  moderatedAt: deleteEvent.createdAt,
  reason: deleteEvent.reason,
}

const restoreEvent = {
  id: '8',
  commentId: comment.id,
  actorUserId: 'admin-id',
  previousEventId: deleteEvent.id,
  action: 'restore' as const,
  reason: null,
  createdAt: RESTORED_AT,
}

const restoredState = {
  status: 'visible' as const,
  stateVersion: restoreEvent.id,
  actorUserId: restoreEvent.actorUserId,
  moderatedAt: restoreEvent.createdAt,
  reason: null,
}

const createCommentModerationService = (
  overrides: Partial<CommentModerationService> = {},
): CommentModerationService => ({
  getCommentModerationDetail: vi.fn(async () => ({
    comment,
    state: initialState,
    commentHistory: { items: [], nextCursor: null },
  })),
  deleteComment: vi.fn(async () => ({ state: deletedState, event: deleteEvent })),
  restoreComment: vi.fn(async () => ({ state: restoredState, event: restoreEvent })),
  ...overrides,
})

const unresolvedChart = {
  availability: 'unresolved' as const,
  legacyReference: {
    legacySongId: comment.chart.songId,
    sheetType: comment.chart.sheetType,
    sheetDifficulty: comment.chart.sheetDifficulty,
  },
  songLabel: comment.chart.songId,
  chartLabel: 'master (dx)',
  songId: null,
  chartId: null,
}

const author = {
  userId: comment.authorUserId,
  displayName: 'Target User',
  email: 'target@example.com',
  emailVerified: true,
  effectiveRole: 'user' as const,
  banState: {
    status: 'unbanned' as const,
    stateVersion: null,
    reason: null,
    actorUserId: null,
    banStartedAt: null,
    expiresAt: null,
    evaluatedAt: DELETED_AT,
  },
}

const expandedDetail = {
  activePublication: null,
  comment: { ...comment, rootId: comment.id, chart: unresolvedChart },
  state: initialState,
  author,
  thread: {
    items: [
      {
        id: comment.id,
        parentId: null,
        rootId: comment.id,
        depth: 0,
        createdAt: comment.createdAt,
        originalBody: comment.originalBody,
        state: initialState,
        author: {
          userId: author.userId,
          displayName: author.displayName,
          effectiveRole: author.effectiveRole,
          isBanned: false,
        },
      },
    ],
    completeness: 'complete' as const,
    nextCursor: null,
  },
  commentHistory: { items: [], nextCursor: null },
  authorBanHistory: { items: [], nextCursor: null },
}

const createCommentContextService = (overrides: Partial<CommentContextService> = {}): CommentContextService => ({
  listRecentComments: vi.fn(async () => ({
    items: [],
    nextCursor: null,
    normalizedFilters: {
      authorUserId: null,
      chartId: null,
      status: null,
      createdAtFromInclusive: null,
      createdAtBeforeExclusive: null,
    },
    activePublication: null,
  })),
  getCommentModerationDetail: vi.fn(async () => expandedDetail),
  ...overrides,
})

const invoke = (
  commentModeration: CommentModerationService,
  path: string,
  {
    method = 'GET',
    body,
    requestAuthentication = authentication(),
    recordAuthorizationResult = vi.fn(),
  }: {
    readonly method?: 'GET' | 'POST'
    readonly body?: Record<string, unknown>
    readonly requestAuthentication?: AdminRequestAuthentication
    readonly recordAuthorizationResult?: NonNullable<AdminRequestContext['recordAuthorizationResult']>
  } = {},
  commentContext: CommentContextService = createCommentContextService(),
) =>
  new OpenAPIHandler(createAdminRouter({ commentModeration, commentContext })).handle(
    new Request(`http://localhost${path}`, {
      method,
      ...(body
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    }),
    {
      context: {
        authentication: requestAuthentication,
        requestId: REQUEST_ID,
        recordAuthorizationResult,
      },
    },
  )

describe('comment moderation router', () => {
  it('forwards the combined recent-comment filters through the private read boundary', async () => {
    const listRecentComments = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      normalizedFilters: {
        authorUserId: 'target-id',
        chartId: 'dsht_23456789ab',
        status: 'deleted' as const,
        createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
        createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      },
      activePublication: null,
    }))
    const context = createCommentContextService({ listRecentComments })
    const service = createCommentModerationService()
    const result = await invoke(
      service,
      '/comments?authorUserId=target-id&chartId=dsht_23456789ab&status=deleted&createdAtFromInclusive=2026-08-01T00%3A00%3A00.000Z&createdAtBeforeExclusive=2026-09-01T00%3A00%3A00.000Z&cursor=feed_page&limit=5',
      {},
      context,
    )

    expect(result.response?.status).toBe(200)
    expect(listRecentComments).toHaveBeenCalledWith({
      authorUserId: 'target-id',
      chartId: 'dsht_23456789ab',
      status: 'deleted',
      createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
      createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      cursor: 'feed_page',
      limit: 5,
    })
  })

  it('returns expanded comment, thread, author, chart, and bounded history context', async () => {
    const detail = {
      ...expandedDetail,
      state: deletedState,
      commentHistory: { items: [deleteEvent], nextCursor: 'next_page' },
    }
    const getCommentModerationDetail = vi.fn(async () => detail)
    const context = createCommentContextService({ getCommentModerationDetail })
    const service = createCommentModerationService()

    const result = await invoke(
      service,
      '/comments/42?threadCursor=thread_page&threadLimit=4&commentHistoryCursor=comment_page&commentHistoryLimit=5&authorBanHistoryCursor=ban_page&authorBanHistoryLimit=6',
      {},
      context,
    )

    expect(result.response?.status).toBe(200)
    await expect(result.response?.json()).resolves.toEqual(detail)
    expect(getCommentModerationDetail).toHaveBeenCalledWith({
      commentId: '42',
      threadCursor: 'thread_page',
      threadLimit: 4,
      commentHistoryCursor: 'comment_page',
      commentHistoryLimit: 5,
      authorBanHistoryCursor: 'ban_page',
      authorBanHistoryLimit: 6,
    })
  })

  it('forwards authorization, CAS, reason, and correlation data but not confirmation flags', async () => {
    const deleteComment = vi.fn(async () => ({ state: deletedState, event: deleteEvent }))
    const restoreComment = vi.fn(async () => ({ state: restoredState, event: restoreEvent }))
    const service = createCommentModerationService({ deleteComment, restoreComment })
    const requestAuthentication = authentication()

    const deletion = await invoke(service, '/comments/42/delete', {
      method: 'POST',
      body: {
        expectedStateVersion: null,
        confirmed: true,
        reason: '  Repeated harassment  ',
      },
      requestAuthentication,
    })
    expect(deletion.response?.status).toBe(200)
    await expect(deletion.response?.json()).resolves.toEqual({ state: deletedState, event: deleteEvent })
    expect(deleteComment).toHaveBeenCalledWith({
      context: { authentication: requestAuthentication },
      commentId: '42',
      expectedStateVersion: null,
      requestCorrelationId: REQUEST_ID,
      reason: 'Repeated harassment',
    })

    const restoreAuthentication = authentication(false)
    const restoration = await invoke(service, '/comments/42/restore', {
      method: 'POST',
      body: { expectedStateVersion: deleteEvent.id, confirmed: true },
      requestAuthentication: restoreAuthentication,
    })
    expect(restoration.response?.status).toBe(200)
    await expect(restoration.response?.json()).resolves.toEqual({ state: restoredState, event: restoreEvent })
    expect(restoreComment).toHaveBeenCalledWith({
      context: { authentication: restoreAuthentication },
      commentId: '42',
      expectedStateVersion: deleteEvent.id,
      requestCorrelationId: REQUEST_ID,
    })
  })

  it('requires recent primary authentication for deletion before invoking the service', async () => {
    const deleteComment = vi.fn(async () => ({ state: deletedState, event: deleteEvent }))
    const service = createCommentModerationService({ deleteComment })

    const result = await invoke(service, '/comments/42/delete', {
      method: 'POST',
      body: { expectedStateVersion: null, confirmed: true, reason: 'Must not reach the service' },
      requestAuthentication: authentication(false),
    })

    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'RECENT_AUTH_REQUIRED',
      status: 401,
    })
    expect(deleteComment).not.toHaveBeenCalled()
  })

  it.each([
    ['VALIDATION_FAILED', '/comments/42/delete', 400],
    ['CONFLICT', '/comments/42/restore', 409],
  ] as const)('maps the mutation %s service failure to a typed response', async (code, path, status) => {
    const failure = async () => {
      throw new CommentModerationServiceFailure(code)
    }
    const service = createCommentModerationService({
      getCommentModerationDetail: failure,
      deleteComment: failure,
      restoreComment: failure,
    })
    const method = 'POST'
    const body = path.endsWith('/delete')
      ? { expectedStateVersion: null, confirmed: true, reason: 'Valid reason' }
      : path.endsWith('/restore')
        ? { expectedStateVersion: '7', confirmed: true }
        : undefined

    const result = await invoke(service, path, { method, body })

    expect(result.response?.status).toBe(status)
    await expect(result.response?.json()).resolves.toMatchObject({ defined: true, code, status })
  })

  it.each([
    ['INVALID_CURSOR', '/comments/42', 400],
    ['NOT_FOUND', '/comments/42', 404],
    ['CHART_UNAVAILABLE', '/comments?chartId=dsht_23456789ab', 503],
  ] as const)('maps the context %s service failure to a typed response', async (code, path, status) => {
    const failure = async () => {
      throw new CommentContextServiceFailure(code)
    }
    const context = createCommentContextService({
      listRecentComments: failure,
      getCommentModerationDetail: failure,
    })
    const result = await invoke(createCommentModerationService(), path, {}, context)

    expect(result.response?.status).toBe(status)
    await expect(result.response?.json()).resolves.toMatchObject({ defined: true, code, status })
  })

  it('rejects missing confirmation, restore reasons, replacement content, and invalid identifiers before the service', async () => {
    const deleteComment = vi.fn(async () => ({ state: deletedState, event: deleteEvent }))
    const restoreComment = vi.fn(async () => ({ state: restoredState, event: restoreEvent }))
    const service = createCommentModerationService({ deleteComment, restoreComment })

    const invalidRequests = [
      invoke(service, '/comments/42/delete', {
        method: 'POST',
        body: { expectedStateVersion: null, reason: 'Missing confirmation' },
      }),
      invoke(service, '/comments/42/delete', {
        method: 'POST',
        body: { expectedStateVersion: null, confirmed: true, reason: 'Valid', replacementBody: 'Forbidden' },
      }),
      invoke(service, '/comments/42/restore', {
        method: 'POST',
        body: { expectedStateVersion: '7', confirmed: true, reason: 'Forbidden restore reason' },
      }),
      invoke(service, '/comments/0'),
    ]

    const results = await Promise.all(invalidRequests)
    expect(results.map((result) => result.response?.status)).toEqual([400, 400, 400, 400])
    expect(deleteComment).not.toHaveBeenCalled()
    expect(restoreComment).not.toHaveBeenCalled()
  })
})