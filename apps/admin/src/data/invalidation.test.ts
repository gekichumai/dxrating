import type { QueryKey } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { createAdminTestQueryClient } from './query-client'
import { adminQueryKeys } from './query-keys'
import {
  invalidateAfterAdministratorMutation,
  invalidateAfterChartMutation,
  invalidateAfterCommentMutation,
  invalidateAfterReportMutation,
  invalidateAfterUserModeration,
} from './invalidation'

const seed = (queryClient: ReturnType<typeof createAdminTestQueryClient>, queryKeys: readonly QueryKey[]) => {
  for (const queryKey of queryKeys) queryClient.setQueryData(queryKey, { queryKey })
}

const expectInvalidated = (
  queryClient: ReturnType<typeof createAdminTestQueryClient>,
  queryKey: QueryKey,
  expected: boolean,
) => expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(expected)

describe('administrator mutation invalidation recipes', () => {
  it('invalidates only the changed chart, its revision history, lists, and dashboard', async () => {
    const queryClient = createAdminTestQueryClient()
    const dashboard = adminQueryKeys.dashboard.overview()
    const chartList = adminQueryKeys.charts.list({ page: 1 })
    const changedChart = adminQueryKeys.charts.detail('chart-1')
    const changedProvenance = adminQueryKeys.charts.provenance('chart-1')
    const otherChart = adminQueryKeys.charts.detail('chart-2')
    const changedHistory = adminQueryKeys.revisions.byChart('chart-1')
    const otherHistory = adminQueryKeys.revisions.byChart('chart-2')
    const comments = adminQueryKeys.comments.list()
    seed(queryClient, [
      dashboard,
      chartList,
      changedChart,
      changedProvenance,
      otherChart,
      changedHistory,
      otherHistory,
      comments,
    ])

    await invalidateAfterChartMutation(queryClient, 'chart-1')

    for (const key of [dashboard, chartList, changedChart, changedProvenance, changedHistory]) {
      expectInvalidated(queryClient, key, true)
    }
    for (const key of [otherChart, otherHistory, comments]) expectInvalidated(queryClient, key, false)
  })

  it('invalidates the changed comment without touching other comment details or user data', async () => {
    const queryClient = createAdminTestQueryClient()
    const dashboard = adminQueryKeys.dashboard.overview()
    const commentList = adminQueryKeys.comments.list({ status: 'recent' })
    const changedComment = adminQueryKeys.comments.detail('comment-1')
    const changedCommentHistoryPage = adminQueryKeys.comments.moderationDetail('comment-1', { cursor: 'page-2' })
    const otherComment = adminQueryKeys.comments.detail('comment-2')
    const otherCommentHistoryPage = adminQueryKeys.comments.moderationDetail('comment-2', { cursor: 'page-2' })
    const user = adminQueryKeys.users.detail('user-1')
    seed(queryClient, [
      dashboard,
      commentList,
      changedComment,
      changedCommentHistoryPage,
      otherComment,
      otherCommentHistoryPage,
      user,
    ])

    await invalidateAfterCommentMutation(queryClient, 'comment-1')

    for (const key of [dashboard, commentList, changedComment, changedCommentHistoryPage]) {
      expectInvalidated(queryClient, key, true)
    }
    for (const key of [otherComment, otherCommentHistoryPage, user]) expectInvalidated(queryClient, key, false)
  })

  it('invalidates user and administrator presentation in lists and comment queues after moderation', async () => {
    const queryClient = createAdminTestQueryClient()
    const dashboard = adminQueryKeys.dashboard.overview()
    const userList = adminQueryKeys.users.list()
    const changedUser = adminQueryKeys.users.detail('user-1')
    const changedUserBanHistory = adminQueryKeys.users.banHistory('user-1', { cursor: 'page-1' })
    const changedActivity = adminQueryKeys.users.activity('user-1')
    const otherUser = adminQueryKeys.users.detail('user-2')
    const otherUserBanHistory = adminQueryKeys.users.banHistory('user-2')
    const administratorList = adminQueryKeys.administrators.list()
    const changedAdministrator = adminQueryKeys.administrators.detail('user-1')
    const changedAdministratorHistory = adminQueryKeys.administrators.roleHistory('user-1', { cursor: 'page-1' })
    const otherAdministrator = adminQueryKeys.administrators.detail('user-2')
    const otherAdministratorHistory = adminQueryKeys.administrators.roleHistory('user-2')
    const commentList = adminQueryKeys.comments.list()
    const commentDetail = adminQueryKeys.comments.detail('comment-1')
    seed(queryClient, [
      dashboard,
      userList,
      changedUser,
      changedUserBanHistory,
      changedActivity,
      otherUser,
      otherUserBanHistory,
      administratorList,
      changedAdministrator,
      changedAdministratorHistory,
      otherAdministrator,
      otherAdministratorHistory,
      commentList,
      commentDetail,
    ])

    await invalidateAfterUserModeration(queryClient, 'user-1')

    for (const key of [
      dashboard,
      userList,
      changedUser,
      changedUserBanHistory,
      changedActivity,
      administratorList,
      changedAdministrator,
      changedAdministratorHistory,
      commentList,
    ]) {
      expectInvalidated(queryClient, key, true)
    }
    for (const key of [otherUser, otherUserBanHistory, otherAdministrator, otherAdministratorHistory, commentDetail]) {
      expectInvalidated(queryClient, key, false)
    }
  })

  it('updates administrator and user representations without invalidating moderation queues', async () => {
    const queryClient = createAdminTestQueryClient()
    const dashboard = adminQueryKeys.dashboard.overview()
    const administratorList = adminQueryKeys.administrators.list()
    const changedAdministrator = adminQueryKeys.administrators.detail('user-1')
    const changedAdministratorHistory = adminQueryKeys.administrators.roleHistory('user-1', { cursor: 'page-1' })
    const otherAdministrator = adminQueryKeys.administrators.detail('user-2')
    const otherAdministratorHistory = adminQueryKeys.administrators.roleHistory('user-2')
    const userList = adminQueryKeys.users.list()
    const changedUser = adminQueryKeys.users.detail('user-1')
    const comments = adminQueryKeys.comments.list()
    seed(queryClient, [
      dashboard,
      administratorList,
      changedAdministrator,
      changedAdministratorHistory,
      otherAdministrator,
      otherAdministratorHistory,
      userList,
      changedUser,
      comments,
    ])

    await invalidateAfterAdministratorMutation(queryClient, 'user-1')

    for (const key of [
      dashboard,
      administratorList,
      changedAdministrator,
      changedAdministratorHistory,
      userList,
      changedUser,
    ]) {
      expectInvalidated(queryClient, key, true)
    }
    for (const key of [otherAdministrator, otherAdministratorHistory, comments]) {
      expectInvalidated(queryClient, key, false)
    }
  })

  it('invalidates a report and its chart summary without touching unrelated reports or histories', async () => {
    const queryClient = createAdminTestQueryClient()
    const dashboard = adminQueryKeys.dashboard.overview()
    const reportList = adminQueryKeys.reports.list()
    const changedReport = adminQueryKeys.reports.detail('report-1')
    const otherReport = adminQueryKeys.reports.detail('report-2')
    const changedChart = adminQueryKeys.charts.detail('chart-1')
    const otherChart = adminQueryKeys.charts.detail('chart-2')
    const revisionHistory = adminQueryKeys.revisions.byChart('chart-1')
    seed(queryClient, [dashboard, reportList, changedReport, otherReport, changedChart, otherChart, revisionHistory])

    await invalidateAfterReportMutation(queryClient, { reportId: 'report-1', chartId: 'chart-1' })

    for (const key of [dashboard, reportList, changedReport, changedChart]) expectInvalidated(queryClient, key, true)
    for (const key of [otherReport, otherChart, revisionHistory]) expectInvalidated(queryClient, key, false)
  })
})