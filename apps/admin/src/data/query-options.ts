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

export type UserSearchQueryParameters = Parameters<AdminClient['searchUsers']>[0]['body']

export const userSearchQueryOptions = (data: AdminDataClient, parameters: UserSearchQueryParameters = {}) => {
  const input = { body: parameters }
  const queryKey = data.orpc.searchUsers.queryKey({
    input,
    queryKey: adminQueryKeys.users.list(parameters),
  })
  return withAdminQueryPolicy(data.orpc.searchUsers.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.users.list(parameters),
    resource: 'users',
  })
}

export const userModerationDetailQueryOptions = (data: AdminDataClient, userId: string) => {
  const input = { params: { userId } }
  const queryKey = data.orpc.getUserModerationDetail.queryKey({
    input,
    queryKey: adminQueryKeys.users.detail(userId),
  })
  return withAdminQueryPolicy(data.orpc.getUserModerationDetail.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.users.detail(userId),
    resource: 'users',
  })
}

export type RecentCommentsQueryParameters = Parameters<AdminClient['listRecentComments']>[0]['query']

export const recentCommentsQueryOptions = (data: AdminDataClient, parameters: RecentCommentsQueryParameters = {}) => {
  const input = { query: parameters }
  const queryKey = data.orpc.listRecentComments.queryKey({
    input,
    queryKey: adminQueryKeys.comments.list(parameters),
  })
  return withAdminQueryPolicy(data.orpc.listRecentComments.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.comments.list(parameters),
    resource: 'comments',
  })
}

export type CommentModerationDetailQueryParameters = Parameters<AdminClient['getCommentModerationDetail']>[0]['query']

export const commentModerationDetailQueryOptions = (
  data: AdminDataClient,
  commentId: string,
  parameters: CommentModerationDetailQueryParameters = {},
) => {
  const input = { params: { commentId }, query: parameters }
  const queryKey = data.orpc.getCommentModerationDetail.queryKey({
    input,
    queryKey: adminQueryKeys.comments.moderationDetail(commentId, parameters),
  })
  return withAdminQueryPolicy(data.orpc.getCommentModerationDetail.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.comments.moderationDetail(commentId, parameters),
    resource: 'comments',
  })
}

export type ChartReportsQueryParameters = Parameters<AdminClient['listChartReports']>[0]['query']

export const chartReportsQueryOptions = (data: AdminDataClient, parameters: ChartReportsQueryParameters = {}) => {
  const input = { query: parameters }
  const queryKey = data.orpc.listChartReports.queryKey({
    input,
    queryKey: adminQueryKeys.reports.list(parameters),
  })
  return withAdminQueryPolicy(data.orpc.listChartReports.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.reports.list(parameters),
    resource: 'reports',
  })
}

export const chartReportDetailQueryOptions = (data: AdminDataClient, reportId: string) => {
  const input = { params: { reportId } }
  const queryKey = data.orpc.getChartReportDetail.queryKey({
    input,
    queryKey: adminQueryKeys.reports.detail(reportId),
  })
  return withAdminQueryPolicy(data.orpc.getChartReportDetail.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.reports.detail(reportId),
    resource: 'reports',
  })
}

export type UserBanHistoryQueryParameters = Parameters<AdminClient['listUserBanHistory']>[0]['query']

export const userBanHistoryQueryOptions = (
  data: AdminDataClient,
  userId: string,
  parameters: UserBanHistoryQueryParameters = {},
) => {
  const input = { params: { userId }, query: parameters }
  const queryKey = data.orpc.listUserBanHistory.queryKey({
    input,
    queryKey: adminQueryKeys.users.banHistory(userId, parameters),
  })
  return withAdminQueryPolicy(data.orpc.listUserBanHistory.queryOptions({ input, queryKey }), {
    queryKey: adminQueryKeys.users.banHistory(userId, parameters),
    resource: 'users',
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