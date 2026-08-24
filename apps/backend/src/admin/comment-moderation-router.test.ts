import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
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
  parentId: '41',
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
    history: { items: [], nextCursor: null },
  })),
  deleteComment: vi.fn(async () => ({ state: deletedState, event: deleteEvent })),
  restoreComment: vi.fn(async () => ({ state: restoredState, event: restoreEvent })),
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
) =>
  new OpenAPIHandler(createAdminRouter({ commentModeration })).handle(
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
  it('returns privileged immutable evidence, current state, and a bounded history page', async () => {
    const getCommentModerationDetail = vi.fn(async () => ({
      comment,
      state: deletedState,
      history: { items: [deleteEvent], nextCursor: 'next_page' },
    }))
    const service = createCommentModerationService({ getCommentModerationDetail })

    const result = await invoke(service, '/comments/42?cursor=prior_page&limit=5')

    expect(result.response?.status).toBe(200)
    await expect(result.response?.json()).resolves.toEqual({
      comment,
      state: deletedState,
      history: { items: [deleteEvent], nextCursor: 'next_page' },
    })
    expect(getCommentModerationDetail).toHaveBeenCalledWith({
      commentId: '42',
      cursor: 'prior_page',
      limit: 5,
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
    ['NOT_FOUND', '/comments/42', 404],
    ['CONFLICT', '/comments/42/restore', 409],
  ] as const)('maps the %s service failure to a typed response', async (code, path, status) => {
    const failure = async () => {
      throw new CommentModerationServiceFailure(code)
    }
    const service = createCommentModerationService({
      getCommentModerationDetail: failure,
      deleteComment: failure,
      restoreComment: failure,
    })
    const method = path === '/comments/42' ? 'GET' : 'POST'
    const body = path.endsWith('/delete')
      ? { expectedStateVersion: null, confirmed: true, reason: 'Valid reason' }
      : path.endsWith('/restore')
        ? { expectedStateVersion: '7', confirmed: true }
        : undefined

    const result = await invoke(service, path, { method, body })

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