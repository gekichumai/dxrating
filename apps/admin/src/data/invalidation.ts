import type { QueryClient } from '@tanstack/react-query'
import { adminQueryKeys } from './query-keys'

const invalidateDashboard = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboard.all() })

export const invalidateAfterChartMutation = async (queryClient: QueryClient, chartId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.charts.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.charts.detail(chartId) }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.revisions.byChart(chartId) }),
    invalidateDashboard(queryClient),
  ])
}

export const invalidateAfterCommentMutation = async (queryClient: QueryClient, commentId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.comments.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.comments.detail(commentId) }),
    invalidateDashboard(queryClient),
  ])
}

export const invalidateAfterUserModeration = async (queryClient: QueryClient, userId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.users.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.users.detail(userId) }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.administrators.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.administrators.detail(userId) }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.comments.lists() }),
    invalidateDashboard(queryClient),
  ])
}

export const invalidateAfterAdministratorMutation = async (queryClient: QueryClient, userId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.administrators.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.administrators.detail(userId) }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.users.lists() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.users.detail(userId) }),
    invalidateDashboard(queryClient),
  ])
}

export const invalidateAfterReportMutation = async (
  queryClient: QueryClient,
  { reportId, chartId }: { readonly reportId: string; readonly chartId?: string },
): Promise<void> => {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.reports.lists() }),
    queryClient.invalidateQueries({ exact: true, queryKey: adminQueryKeys.reports.detail(reportId) }),
    invalidateDashboard(queryClient),
  ]

  if (chartId) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: adminQueryKeys.charts.detail(chartId) }))
  }

  await Promise.all(invalidations)
}