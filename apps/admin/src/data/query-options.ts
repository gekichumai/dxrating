import { hashKey, type QueryKey } from '@tanstack/react-query'
import type { AdminDataClient } from './admin-client'
import { getAdminStaleTime, type AdminFreshnessResource } from './freshness'
import { adminQueryKeys } from './query-keys'

type AdminQueryPolicy<TKey extends QueryKey> = {
  readonly queryKey: TKey
  readonly resource: AdminFreshnessResource
}

export const withAdminQueryPolicy = <TOptions extends { readonly queryKey: QueryKey }, const TKey extends QueryKey>(
  options: TOptions,
  { queryKey, resource }: AdminQueryPolicy<TKey>,
): TOptions & { readonly staleTime: number } => {
  if (hashKey(options.queryKey) !== hashKey(queryKey)) {
    throw new Error('The oRPC operation context and administrator query key must match')
  }

  return {
    ...options,
    staleTime: getAdminStaleTime(resource),
  }
}

export const adminBootstrapQueryOptions = (data: AdminDataClient) => {
  const queryKey = data.orpc.bootstrap.queryKey({ queryKey: adminQueryKeys.bootstrap() })
  return withAdminQueryPolicy(data.orpc.bootstrap.queryOptions({ queryKey }), {
    queryKey: adminQueryKeys.bootstrap(),
    resource: 'bootstrap',
  })
}

export const adminPrimaryAuthStatusQueryOptions = (data: AdminDataClient) => {
  const queryKey = data.orpc.primaryAuthStatus.queryKey({ queryKey: adminQueryKeys.primaryAuth.status() })
  return withAdminQueryPolicy(data.orpc.primaryAuthStatus.queryOptions({ queryKey }), {
    queryKey: adminQueryKeys.primaryAuth.status(),
    resource: 'primaryAuth',
  })
}