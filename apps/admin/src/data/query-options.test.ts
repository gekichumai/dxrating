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