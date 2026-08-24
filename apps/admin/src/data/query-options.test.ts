import { ADMIN_CONTRACT_COMPATIBILITY_ID, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createAdminDataClient } from './admin-client'
import { ADMIN_STALE_TIME_MS } from './freshness'
import { createAdminTestQueryClient } from './query-client'
import { adminQueryKeys } from './query-keys'
import {
  adminBootstrapQueryOptions,
  administratorRoleHistoryQueryOptions,
  administratorRosterQueryOptions,
  commentModerationDetailQueryOptions,
  userBanHistoryQueryOptions,
  userModerationDetailQueryOptions,
  userSearchQueryOptions,
  withAdminQueryPolicy,
} from './query-options'

const bootstrapOutput = {
  contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
  ready: true as const,
  principal: {
    userId: 'administrator-id',
    effectiveRole: 'admin' as const,
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
}

describe('administrator typed query option policy', () => {
  it('connects the typed bootstrap procedure to the shared key and freshness window', async () => {
    const fetch = vi.fn(async () => Response.json(bootstrapOutput))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const options = adminBootstrapQueryOptions(data)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.bootstrap())
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['bootstrap'] | undefined
    >()
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.bootstrap)
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(bootstrapOutput)
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(bootstrapOutput)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('overrides generated keys and freshness through one reusable feature boundary', () => {
    const queryFn = vi.fn(async () => ({ id: 'chart-1' }))
    const queryKey = adminQueryKeys.charts.detail('chart-1')
    const options = withAdminQueryPolicy(
      { queryFn, queryKey },
      {
        queryKey,
        resource: 'charts',
      },
    )

    expect(options.queryKey).toEqual(adminQueryKeys.charts.detail('chart-1'))
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.charts)
    expect(options.queryFn).toBe(queryFn)
  })

  it('connects the administrator roster to its typed resource key', async () => {
    const roster = {
      items: [
        {
          userId: 'administrator-id',
          displayName: 'Administrator',
          email: 'admin@example.com',
          emailVerified: true,
          effectiveRole: 'admin' as const,
          roleSource: 'database' as const,
          accountStatus: { status: 'active' as const },
        },
      ],
    }
    const fetch = vi.fn(async () => Response.json(roster))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const options = administratorRosterQueryOptions(data)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.administrators.list())
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['listAdministrators'] | undefined
    >()
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.administrators)
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(roster)
  })

  it('keys user search, detail, and subject ban-history reads under the typed users resource', async () => {
    const state = {
      status: 'temporary' as const,
      stateVersion: '1',
      reason: 'Temporary restriction',
      actorUserId: 'administrator-id',
      banStartedAt: '2026-08-24T10:00:00.000Z',
      expiresAt: '2026-08-25T10:00:00.000Z',
      evaluatedAt: '2026-08-24T12:00:00.000Z',
    }
    const detail = {
      userId: 'user-1',
      displayName: 'User One',
      email: 'user-1@example.com',
      emailVerified: true,
      effectiveRole: 'user' as const,
      banState: state,
    }
    const history = {
      items: [
        {
          id: '1',
          subjectUserId: 'user-1',
          actorUserId: 'administrator-id',
          previousEventId: null,
          action: 'ban' as const,
          kind: 'temporary' as const,
          reason: 'Temporary restriction',
          banStartedAt: '2026-08-24T10:00:00.000Z',
          expiresAt: '2026-08-25T10:00:00.000Z',
          createdAt: '2026-08-24T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = (request as Request).url
      if (url.endsWith('/users/search')) return Response.json({ items: [], nextCursor: null })
      if (url.includes('/ban-history')) return Response.json(history)
      return Response.json(detail)
    })
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const queryClient = createAdminTestQueryClient()
    const searchParameters = { displayName: 'User', activeBan: true, limit: 25 }
    const search = userSearchQueryOptions(data, searchParameters)
    const userDetail = userModerationDetailQueryOptions(data, 'user-1')
    const historyParameters = { cursor: 'opaque_page', limit: 25 }
    const banHistory = userBanHistoryQueryOptions(data, 'user-1', historyParameters)

    expect(search.queryKey).toEqual(adminQueryKeys.users.list(searchParameters))
    expect(userDetail.queryKey).toEqual(adminQueryKeys.users.detail('user-1'))
    expect(banHistory.queryKey).toEqual(adminQueryKeys.users.banHistory('user-1', historyParameters))
    expect(search.staleTime).toBe(ADMIN_STALE_TIME_MS.users)
    expect(userDetail.staleTime).toBe(ADMIN_STALE_TIME_MS.users)
    expect(banHistory.staleTime).toBe(ADMIN_STALE_TIME_MS.users)
    expectTypeOf(queryClient.getQueryData(search.queryKey)).toEqualTypeOf<
      AdminContractOutputs['searchUsers'] | undefined
    >()
    expectTypeOf(queryClient.getQueryData(userDetail.queryKey)).toEqualTypeOf<
      AdminContractOutputs['getUserModerationDetail'] | undefined
    >()
    expectTypeOf(queryClient.getQueryData(banHistory.queryKey)).toEqualTypeOf<
      AdminContractOutputs['listUserBanHistory'] | undefined
    >()
    await expect(queryClient.fetchQuery(search)).resolves.toEqual({ items: [], nextCursor: null })
    await expect(queryClient.fetchQuery(userDetail)).resolves.toEqual(detail)
    await expect(queryClient.fetchQuery(banHistory)).resolves.toEqual(history)
  })

  it('keys each comment detail and comment-bound history page under its immutable comment ID', async () => {
    const detail = {
      comment: {
        id: '42',
        parentId: null,
        authorUserId: 'comment-author',
        chart: { songId: 'song-1', sheetType: 'dx', sheetDifficulty: 'master' },
        createdAt: '2026-08-24T10:00:00.000Z',
        originalBody: 'Immutable original body',
      },
      state: {
        status: 'visible' as const,
        stateVersion: null,
        actorUserId: null,
        moderatedAt: null,
        reason: null,
      },
      history: { items: [], nextCursor: null },
    }
    const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(detail))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const parameters = { cursor: 'opaque_page', limit: 25 }
    const options = commentModerationDetailQueryOptions(data, '42', parameters)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.comments.moderationDetail('42', parameters))
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['getCommentModerationDetail'] | undefined
    >()
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.comments)
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(detail)
    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('/api/admin/comments/42')
    expect((request as Request).url).toContain('cursor=opaque_page')
    expect((request as Request).url).toContain('limit=25')
  })

  it('keys every subject role-history page by immutable user ID and opaque cursor', async () => {
    const history = {
      items: [
        {
          id: '1',
          subjectUserId: 'subject-id',
          actorUserId: 'actor-id',
          previousRole: 'user' as const,
          newRole: 'admin' as const,
          reason: 'Operational coverage',
          changedAt: '2026-08-24T12:00:00.000Z',
        },
      ],
      nextCursor: 'opaque-next-page',
    }
    const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(history))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const parameters = { cursor: 'opaque-current-page', limit: 25 }
    const options = administratorRoleHistoryQueryOptions(data, 'subject-id', parameters)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.administrators.roleHistory('subject-id', parameters))
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['listAdministratorRoleHistory'] | undefined
    >()
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.administrators)
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(history)
    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('/api/admin/administrators/subject-id/role-history')
    expect((request as Request).url).toContain('cursor=opaque-current-page')
    expect((request as Request).url).toContain('limit=25')
  })
})