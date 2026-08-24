import { ADMIN_CONTRACT_COMPATIBILITY_ID, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createAdminDataClient } from './admin-client'
import { ADMIN_STALE_TIME_MS } from './freshness'
import { createAdminTestQueryClient } from './query-client'
import { adminQueryKeys } from './query-keys'
import { adminBootstrapQueryOptions, withAdminQueryPolicy } from './query-options'

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
})