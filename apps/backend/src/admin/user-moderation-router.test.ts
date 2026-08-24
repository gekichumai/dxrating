import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { createAdminRouter, type AdminRequestContext } from './router.js'
import { UserModerationServiceFailure, type UserModerationService } from './user-moderation-service.js'

const REQUEST_ID = '18d7118c-ec70-4603-9176-cffea8a6cd8f'
const EVALUATED_AT = '2026-08-24T12:00:00.000Z'

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

const identity = {
  userId: 'target-id',
  displayName: 'Target User',
  email: 'target@example.test',
  emailVerified: true,
  effectiveRole: 'user' as const,
}

const permanentState = {
  status: 'permanent' as const,
  stateVersion: '1',
  reason: 'Private moderation reason',
  actorUserId: 'admin-id',
  banStartedAt: EVALUATED_AT,
  expiresAt: null,
  evaluatedAt: EVALUATED_AT,
}

const permanentEvent = {
  id: '1',
  subjectUserId: 'target-id',
  actorUserId: 'admin-id',
  previousEventId: null,
  action: 'ban' as const,
  kind: 'permanent' as const,
  reason: 'Private moderation reason',
  banStartedAt: EVALUATED_AT,
  expiresAt: null,
  createdAt: EVALUATED_AT,
}

const unbannedState = {
  status: 'unbanned' as const,
  stateVersion: '2',
  reason: null,
  actorUserId: 'admin-id',
  banStartedAt: null,
  expiresAt: null,
  evaluatedAt: '2026-08-24T13:00:00.000Z',
}

const unbanEvent = {
  id: '2',
  subjectUserId: 'target-id',
  actorUserId: 'admin-id',
  previousEventId: '1',
  action: 'unban' as const,
  kind: null,
  reason: null,
  banStartedAt: null,
  expiresAt: null,
  createdAt: '2026-08-24T13:00:00.000Z',
}

const createModerationService = (overrides: Partial<UserModerationService> = {}): UserModerationService => ({
  searchUsers: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserModerationDetail: vi.fn(async () => ({ ...identity, banState: permanentState })),
  listBanHistory: vi.fn(async () => ({ items: [permanentEvent], nextCursor: null })),
  banUser: vi.fn(async () => ({ state: permanentState, event: permanentEvent })),
  unbanUser: vi.fn(async () => ({ state: unbannedState, event: unbanEvent })),
  ...overrides,
})

const invoke = (
  userModeration: UserModerationService,
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
  new OpenAPIHandler(createAdminRouter({ userModeration })).handle(
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

describe('user moderation router', () => {
  it('serves normalized bounded search, approved detail, and subject-scoped history', async () => {
    const searchUsers = vi.fn(async () => ({
      items: [{ ...identity, accountStatus: { status: 'permanently_banned' as const } }],
      nextCursor: 'next_page',
    }))
    const getUserModerationDetail = vi.fn(async () => ({ ...identity, banState: permanentState }))
    const listBanHistory = vi.fn(async () => ({ items: [permanentEvent], nextCursor: null }))
    const service = createModerationService({ searchUsers, getUserModerationDetail, listBanHistory })

    const search = await invoke(service, '/users/search', {
      method: 'POST',
      body: {
        email: '  TARGET@EXAMPLE.TEST  ',
        displayName: '  Target   U  ',
        effectiveRole: 'user',
        activeBan: true,
        limit: 2,
      },
    })
    expect(search.response?.status).toBe(200)
    await expect(search.response?.json()).resolves.toEqual({
      items: [{ ...identity, accountStatus: { status: 'permanently_banned' } }],
      nextCursor: 'next_page',
    })
    expect(searchUsers).toHaveBeenCalledWith({
      email: 'target@example.test',
      displayName: 'Target U',
      effectiveRole: 'user',
      activeBan: true,
      limit: 2,
    })

    const detail = await invoke(service, '/users/target-id')
    expect(detail.response?.status).toBe(200)
    await expect(detail.response?.json()).resolves.toEqual({ ...identity, banState: permanentState })

    const history = await invoke(service, '/users/target-id/ban-history?cursor=prior_page&limit=5')
    expect(history.response?.status).toBe(200)
    await expect(history.response?.json()).resolves.toEqual({ items: [permanentEvent], nextCursor: null })
    expect(getUserModerationDetail).toHaveBeenCalledWith('target-id')
    expect(listBanHistory).toHaveBeenCalledWith({ userId: 'target-id', cursor: 'prior_page', limit: 5 })
  })

  it('forwards a typed expiry, authorization context, state version, and request correlation ID', async () => {
    const expiry = '2026-08-25T12:00:00.000Z'
    const temporaryState = {
      ...permanentState,
      status: 'temporary' as const,
      expiresAt: expiry,
    }
    const temporaryEvent = {
      ...permanentEvent,
      kind: 'temporary' as const,
      expiresAt: expiry,
    }
    const banUser = vi.fn(async () => ({ state: temporaryState, event: temporaryEvent }))
    const unbanUser = vi.fn(async () => ({ state: unbannedState, event: unbanEvent }))
    const service = createModerationService({ banUser, unbanUser })
    const requestAuthentication = authentication()

    const ban = await invoke(service, '/users/target-id/ban', {
      method: 'POST',
      body: {
        expectedStateVersion: null,
        kind: 'temporary',
        expiresAt: expiry,
        reason: '  Private moderation reason  ',
      },
      requestAuthentication,
    })
    expect(ban.response?.status).toBe(200)
    await expect(ban.response?.json()).resolves.toEqual({ state: temporaryState, event: temporaryEvent })
    expect(banUser).toHaveBeenCalledWith({
      context: { authentication: requestAuthentication },
      targetUserId: 'target-id',
      expectedStateVersion: null,
      requestCorrelationId: REQUEST_ID,
      kind: 'temporary',
      expiresAt: new Date(expiry),
      reason: 'Private moderation reason',
    })

    const unban = await invoke(service, '/users/target-id/unban', {
      method: 'POST',
      body: { expectedStateVersion: '1' },
      requestAuthentication,
    })
    expect(unban.response?.status).toBe(200)
    await expect(unban.response?.json()).resolves.toEqual({ state: unbannedState, event: unbanEvent })
    expect(unbanUser).toHaveBeenCalledWith({
      context: { authentication: requestAuthentication },
      targetUserId: 'target-id',
      expectedStateVersion: '1',
      requestCorrelationId: REQUEST_ID,
    })
  })

  it('enforces recent primary authentication before invoking either mutation service', async () => {
    const banUser = vi.fn(async () => ({ state: permanentState, event: permanentEvent }))
    const unbanUser = vi.fn(async () => ({ state: unbannedState, event: unbanEvent }))
    const service = createModerationService({ banUser, unbanUser })

    const ban = await invoke(service, '/users/target-id/ban', {
      method: 'POST',
      body: { expectedStateVersion: null, kind: 'permanent', reason: 'Must not reach the service' },
      requestAuthentication: authentication(false),
    })
    expect(ban.response?.status).toBe(401)
    await expect(ban.response?.json()).resolves.toMatchObject({ defined: true, code: 'RECENT_AUTH_REQUIRED' })

    const unban = await invoke(service, '/users/target-id/unban', {
      method: 'POST',
      body: { expectedStateVersion: '1' },
      requestAuthentication: authentication(false),
    })
    expect(unban.response?.status).toBe(401)
    await expect(unban.response?.json()).resolves.toMatchObject({ defined: true, code: 'RECENT_AUTH_REQUIRED' })
    expect(banUser).not.toHaveBeenCalled()
    expect(unbanUser).not.toHaveBeenCalled()
  })

  it.each([
    [
      'permanent ban with an expiry',
      '/users/target-id/ban',
      { expectedStateVersion: null, kind: 'permanent', expiresAt: '2026-08-25T12:00:00.000Z', reason: 'Invalid' },
    ],
    [
      'temporary ban without an expiry',
      '/users/target-id/ban',
      { expectedStateVersion: null, kind: 'temporary', reason: 'Invalid' },
    ],
    ['unban with a reason', '/users/target-id/unban', { expectedStateVersion: '1', reason: 'Not supported' }],
  ])('rejects a strict invalid %s body before invoking the service', async (_label, path, body) => {
    const banUser = vi.fn(async () => ({ state: permanentState, event: permanentEvent }))
    const unbanUser = vi.fn(async () => ({ state: unbannedState, event: unbanEvent }))
    const service = createModerationService({ banUser, unbanUser })

    const result = await invoke(service, path, { method: 'POST', body })
    expect(result.response?.status).toBe(400)
    await expect(result.response?.json()).resolves.toMatchObject({ defined: true, code: 'VALIDATION_FAILED' })
    expect(banUser).not.toHaveBeenCalled()
    expect(unbanUser).not.toHaveBeenCalled()
  })

  it.each([
    ['VALIDATION_FAILED', '/users/search', 400],
    ['NOT_FOUND', '/users/missing-id', 404],
    ['CONFLICT', '/users/target-id/ban', 409],
  ] as const)('maps %s service failures to private typed errors', async (code, path, status) => {
    const failure = vi.fn(async () => {
      throw new UserModerationServiceFailure(code)
    })
    const service = createModerationService({
      ...(code === 'VALIDATION_FAILED' ? { searchUsers: failure } : {}),
      ...(code === 'NOT_FOUND' ? { getUserModerationDetail: failure } : {}),
      ...(code === 'CONFLICT' ? { banUser: failure } : {}),
    })
    const recordAuthorizationResult = vi.fn()
    const result = await invoke(service, path, {
      method: path.endsWith('/search') || path.endsWith('/ban') ? 'POST' : 'GET',
      body: path.endsWith('/search')
        ? {}
        : path.endsWith('/ban')
          ? { expectedStateVersion: null, kind: 'permanent', reason: 'Private reason' }
          : undefined,
      recordAuthorizationResult,
    })

    expect(result.response?.status).toBe(status)
    await expect(result.response?.json()).resolves.toMatchObject({
      defined: true,
      code,
      data: { requestId: REQUEST_ID },
    })
    expect(recordAuthorizationResult).toHaveBeenCalledWith(
      code === 'VALIDATION_FAILED' ? 'searchUsers' : code === 'NOT_FOUND' ? 'getUserModerationDetail' : 'banUser',
      code,
    )
  })

  it('sanitizes unexpected moderation failures and authorization telemetry', async () => {
    const privateReason = 'private reason: credential-like-value'
    const banUser = vi.fn(async () => {
      throw new Error(privateReason)
    })
    const recordAuthorizationResult = vi.fn()
    const result = await invoke(createModerationService({ banUser }), '/users/target-id/ban', {
      method: 'POST',
      body: { expectedStateVersion: null, kind: 'permanent', reason: privateReason },
      recordAuthorizationResult,
    })

    expect(result.response?.status).toBe(500)
    const responseBody = await result.response?.json()
    expect(responseBody).toMatchObject({ defined: true, code: 'INTERNAL_SERVER_ERROR' })
    expect(JSON.stringify(responseBody)).not.toContain(privateReason)
    expect(recordAuthorizationResult).toHaveBeenCalledWith('banUser', 'INTERNAL_SERVER_ERROR')
    expect(JSON.stringify(recordAuthorizationResult.mock.calls)).not.toContain(privateReason)
  })
})