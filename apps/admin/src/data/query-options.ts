import { hashKey, type QueryKey } from '@tanstack/react-query'
import type { AdminClient, AdminDataClient } from './admin-client'
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

export const administratorRosterQueryOptions = (data: AdminDataClient) => {
  const queryKey = data.orpc.listAdministrators.queryKey({ queryKey: adminQueryKeys.administrators.list() })
  return withAdminQueryPolicy(data.orpc.listAdministrators.queryOptions({ queryKey }), {
    queryKey: adminQueryKeys.administrators.list(),
    resource: 'administrators',
  })
}

export type AdministratorRoleHistoryQueryParameters = Parameters<
  AdminClient['listAdministratorRoleHistory']
>[0]['query']

export const administratorRoleHistoryQueryOptions = (
  data: AdminDataClient,
  userId: string,
  parameters: AdministratorRoleHistoryQueryParameters = {},
) => {
  const input = { params: { userId }, query: parameters }
  const queryKey = data.orpc.listAdministratorRoleHistory.queryKey({
    input,
    queryKey: adminQueryKeys.administrators.roleHistory(userId, parameters),
  })
  return withAdminQueryPolicy(data.orpc.listAdministratorRoleHistory.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.administrators.roleHistory(userId, parameters),
    resource: 'administrators',
  })
}