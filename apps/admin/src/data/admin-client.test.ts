import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createAdminDataClient, type AdminClient } from './admin-client'
import { isAdminNetworkError, shouldRetryAdminRead } from './admin-errors'
import { isAdminClientIncompatibleError } from './compatibility'

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

const jsonResponse = (body: unknown, init: ResponseInit = {}) => Response.json(body, { status: 200, ...init })

describe('private administrator data client', () => {
  it('exposes headerless procedure and query utility inputs', () => {
    type BootstrapInput = Parameters<AdminClient['bootstrap']>[0]
    type PasswordInput = Parameters<AdminClient['completePrimaryAuthPassword']>[0]
    type OauthInput = Parameters<AdminClient['initiatePrimaryAuthOauth']>[0]
    type UserSearchInput = Parameters<AdminClient['searchUsers']>[0]
    type UserDetailInput = Parameters<AdminClient['getUserModerationDetail']>[0]
    type BanHistoryInput = Parameters<AdminClient['listUserBanHistory']>[0]
    type BanUserInput = Parameters<AdminClient['banUser']>[0]
    type UnbanUserInput = Parameters<AdminClient['unbanUser']>[0]
    type RecentCommentsInput = Parameters<AdminClient['listRecentComments']>[0]
    type CommentDetailInput = Parameters<AdminClient['getCommentModerationDetail']>[0]
    type DeleteCommentInput = Parameters<AdminClient['deleteComment']>[0]
    type RestoreCommentInput = Parameters<AdminClient['restoreComment']>[0]
    type ChartReportListInput = Parameters<AdminClient['listChartReports']>[0]
    type ChartReportDetailInput = Parameters<AdminClient['getChartReportDetail']>[0]
    type CloseChartReportInput = Parameters<AdminClient['closeChartReport']>[0]
    type RosterInput = Parameters<AdminClient['listAdministrators']>[0]
    type HistoryInput = Parameters<AdminClient['listAdministratorRoleHistory']>[0]
    type GrantInput = Parameters<AdminClient['grantAdministrator']>[0]
    type RevokeInput = Parameters<AdminClient['revokeAdministrator']>[0]

    expectTypeOf<BootstrapInput>().toEqualTypeOf<undefined>()
    expectTypeOf<PasswordInput>().toEqualTypeOf<{ body: { password: string } }>()
    expectTypeOf<OauthInput>().toEqualTypeOf<{ body: { provider: 'google' } }>()
    expectTypeOf<UserSearchInput>().toMatchTypeOf<{
      body: {
        userId?: string
        email?: string
        displayName?: string
        effectiveRole?: 'user' | 'admin' | 'super_admin'
        activeBan?: boolean
        cursor?: string
        limit?: number
      }
    }>()
    expectTypeOf<UserDetailInput>().toEqualTypeOf<{ params: { userId: string } }>()
    expectTypeOf<BanHistoryInput>().toMatchTypeOf<{
      params: { userId: string }
      query: { cursor?: string; limit?: number }
    }>()
    expectTypeOf<BanUserInput>().toMatchTypeOf<{
      params: { userId: string }
      body:
        | { expectedStateVersion: string | null; kind: 'temporary'; expiresAt: string; reason: string }
        | { expectedStateVersion: string | null; kind: 'permanent'; reason: string }
    }>()
    expectTypeOf<UnbanUserInput>().toEqualTypeOf<{
      params: { userId: string }
      body: { expectedStateVersion: string | null }
    }>()
    expectTypeOf<RecentCommentsInput>().toMatchTypeOf<{
      query: {
        authorUserId?: string
        chartId?: string
        status?: 'active' | 'deleted'
        createdAtFromInclusive?: string
        createdAtBeforeExclusive?: string
        cursor?: string
        limit?: number
      }
    }>()
    expectTypeOf<CommentDetailInput>().toMatchTypeOf<{
      params: { commentId: string }
      query: {
        threadCursor?: string
        threadLimit?: number
        commentHistoryCursor?: string
        commentHistoryLimit?: number
        authorBanHistoryCursor?: string
        authorBanHistoryLimit?: number
      }
    }>()
    expectTypeOf<DeleteCommentInput>().toEqualTypeOf<{
      params: { commentId: string }
      body: { expectedStateVersion: string | null; confirmed: true; reason: string }
    }>()
    expectTypeOf<RestoreCommentInput>().toEqualTypeOf<{
      params: { commentId: string }
      body: { expectedStateVersion: string; confirmed: true }
    }>()
    expectTypeOf<ChartReportListInput>().toMatchTypeOf<{
      query: {
        state?: 'open' | 'closed'
        chartId?: string
        fieldKey?: string
        category?: string
        reporterUserId?: string
        submittedAtFromInclusive?: string
        submittedAtBeforeExclusive?: string
        publicationRevision?: string
        cursor?: string
        limit?: number
      }
    }>()
    expectTypeOf<ChartReportDetailInput>().toEqualTypeOf<{ params: { reportId: string } }>()
    expectTypeOf<CloseChartReportInput>().toMatchTypeOf<{
      params: { reportId: string }
      body: { expectedState: 'open'; internalNote?: string | null }
    }>()
    expectTypeOf<RosterInput>().toEqualTypeOf<undefined>()
    expectTypeOf<HistoryInput>().toMatchTypeOf<{
      params: { userId: string }
      query: { cursor?: string; limit?: number }
    }>()
    expectTypeOf<GrantInput>().toEqualTypeOf<{
      params: { userId: string }
      body: { reason: string }
    }>()
    expectTypeOf<RevokeInput>().toEqualTypeOf<GrantInput>()

    const fetch = vi.fn(async () => jsonResponse(bootstrapOutput))
    const { client, orpc } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    expect(Object.keys(client)).toEqual([
      'bootstrap',
      'primaryAuthStatus',
      'completePrimaryAuthPassword',
      'initiatePrimaryAuthOauth',
      'searchUsers',
      'getUserModerationDetail',
      'listUserBanHistory',
      'banUser',
      'unbanUser',
      'listRecentComments',
      'getCommentModerationDetail',
      'deleteComment',
      'restoreComment',
      'listChartReports',
      'getChartReportDetail',
      'closeChartReport',
      'listAdministrators',
      'listAdministratorRoleHistory',
      'grantAdministrator',
      'revokeAdministrator',
    ])
    expect(orpc.bootstrap.queryOptions().queryKey).toBeDefined()
    expect(orpc.searchUsers.queryOptions({ input: { body: {} } }).queryKey).toBeDefined()
    expect(orpc.banUser.mutationOptions().mutationKey).toBeDefined()
    expect(orpc.listRecentComments.queryOptions({ input: { query: {} } }).queryKey).toBeDefined()
    expect(
      orpc.getCommentModerationDetail.queryOptions({ input: { params: { commentId: '1' }, query: {} } }).queryKey,
    ).toBeDefined()
    expect(orpc.deleteComment.mutationOptions().mutationKey).toBeDefined()
    expect(orpc.listChartReports.queryOptions({ input: { query: {} } }).queryKey).toBeDefined()
    expect(
      orpc.getChartReportDetail.queryOptions({
        input: { params: { reportId: '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1' } },
      }).queryKey,
    ).toBeDefined()
    expect(orpc.closeChartReport.mutationOptions().mutationKey).toBeDefined()
    expect(orpc.listAdministrators.queryOptions().queryKey).toBeDefined()
  })

  it('serializes roster, subject-scoped history, and role changes only under the private admin prefix', async () => {
    const requests: Request[] = []
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)

      if (captured.url.endsWith('/administrators')) return jsonResponse({ items: [] })
      if (captured.url.includes('/role-history')) return jsonResponse({ items: [], nextCursor: null })
      const revoking = captured.url.endsWith('/revoke')
      return jsonResponse({
        change: {
          id: revoking ? '2' : '1',
          subjectUserId: 'target-id',
          actorUserId: 'actor-id',
          previousRole: revoking ? 'admin' : 'user',
          newRole: revoking ? 'user' : 'admin',
          reason: 'Operational coverage',
          changedAt: '2026-08-24T12:00:00.000Z',
        },
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.listAdministrators()
    await client.listAdministratorRoleHistory({
      params: { userId: 'target-id' },
      query: { cursor: 'opaque-page', limit: 25 },
    })
    await client.grantAdministrator({
      params: { userId: 'target-id' },
      body: { reason: 'Operational coverage' },
    })
    await client.revokeAdministrator({
      params: { userId: 'target-id' },
      body: { reason: 'Operational coverage' },
    })

    expect(requests).toHaveLength(4)
    expect(requests[0]).toMatchObject({ method: 'GET' })
    expect(requests[0]?.url).toBe('https://api.dxrating.net/api/admin/administrators')
    expect(requests[1]).toMatchObject({ method: 'GET' })
    expect(requests[1]?.url).toContain('https://api.dxrating.net/api/admin/administrators/target-id/role-history')
    expect(requests[1]?.url).toContain('cursor=opaque-page')
    expect(requests[1]?.url).toContain('limit=25')
    expect(requests[2]).toMatchObject({ method: 'POST' })
    expect(requests[2]?.url).toBe('https://api.dxrating.net/api/admin/administrators/target-id/grant')
    await expect(requests[2]?.clone().json()).resolves.toEqual({ reason: 'Operational coverage' })
    expect(requests[3]).toMatchObject({ method: 'POST' })
    expect(requests[3]?.url).toBe('https://api.dxrating.net/api/admin/administrators/target-id/revoke')
    await expect(requests[3]?.clone().json()).resolves.toEqual({ reason: 'Operational coverage' })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('serializes user search, detail, history, ban, and unban only under the private admin prefix', async () => {
    const requests: Request[] = []
    const activeState = {
      status: 'permanent' as const,
      stateVersion: '1',
      reason: 'Private moderation reason',
      actorUserId: 'administrator-id',
      banStartedAt: '2026-08-24T12:00:00.000Z',
      expiresAt: null,
      evaluatedAt: '2026-08-24T12:00:00.000Z',
    }
    const banEvent = {
      id: '1',
      subjectUserId: 'target-id',
      actorUserId: 'administrator-id',
      previousEventId: null,
      action: 'ban' as const,
      kind: 'permanent' as const,
      reason: 'Private moderation reason',
      banStartedAt: '2026-08-24T12:00:00.000Z',
      expiresAt: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)
      if (captured.url.endsWith('/users/search')) return jsonResponse({ items: [], nextCursor: null })
      if (captured.url.endsWith('/ban-history')) return jsonResponse({ items: [banEvent], nextCursor: null })
      if (captured.url.endsWith('/ban')) return jsonResponse({ state: activeState, event: banEvent })
      if (captured.url.endsWith('/unban')) {
        return jsonResponse({
          state: {
            status: 'unbanned',
            stateVersion: '2',
            reason: null,
            actorUserId: 'administrator-id',
            banStartedAt: null,
            expiresAt: null,
            evaluatedAt: '2026-08-24T13:00:00.000Z',
          },
          event: {
            id: '2',
            subjectUserId: 'target-id',
            actorUserId: 'administrator-id',
            previousEventId: '1',
            action: 'unban',
            kind: null,
            reason: null,
            banStartedAt: null,
            expiresAt: null,
            createdAt: '2026-08-24T13:00:00.000Z',
          },
        })
      }
      return jsonResponse({
        userId: 'target-id',
        displayName: 'Target User',
        email: 'target@example.com',
        emailVerified: false,
        effectiveRole: 'user',
        banState: activeState,
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.searchUsers({ body: { displayName: 'Target', activeBan: true, limit: 25 } })
    await client.getUserModerationDetail({ params: { userId: 'target-id' } })
    await client.listUserBanHistory({
      params: { userId: 'target-id' },
      query: { cursor: 'opaque_page', limit: 25 },
    })
    await client.banUser({
      params: { userId: 'target-id' },
      body: { expectedStateVersion: null, kind: 'permanent', reason: 'Private moderation reason' },
    })
    await client.unbanUser({
      params: { userId: 'target-id' },
      body: { expectedStateVersion: '1' },
    })

    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
      ['POST', '/api/admin/users/search'],
      ['GET', '/api/admin/users/target-id'],
      ['GET', '/api/admin/users/target-id/ban-history'],
      ['POST', '/api/admin/users/target-id/ban'],
      ['POST', '/api/admin/users/target-id/unban'],
    ])
    expect(requests[2]?.url).toContain('cursor=opaque_page')
    expect(requests[2]?.url).toContain('limit=25')
    await expect(requests[0]?.clone().json()).resolves.toEqual({
      displayName: 'Target',
      activeBan: true,
      limit: 25,
    })
    await expect(requests[3]?.clone().json()).resolves.toEqual({
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Private moderation reason',
    })
    await expect(requests[4]?.clone().json()).resolves.toEqual({ expectedStateVersion: '1' })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('serializes the recent feed, expanded detail, deletion, and restoration under the private prefix', async () => {
    const requests: Request[] = []
    const chart = {
      availability: 'current' as const,
      legacyReference: { legacySongId: 'legacy-song-1', sheetType: 'dx', sheetDifficulty: 'master' },
      songLabel: 'Song One',
      chartLabel: 'Master (DX)',
      songId: 'dsng_23456789ab',
      chartId: 'dsht_23456789ab',
    }
    const comment = {
      id: '42',
      parentId: null,
      rootId: '42',
      authorUserId: 'comment-author',
      chart,
      createdAt: '2026-08-24T10:00:00.000Z',
      originalBody: 'Immutable original body',
    }
    const deleteEvent = {
      id: '7',
      commentId: '42',
      actorUserId: 'administrator-id',
      previousEventId: null,
      action: 'delete' as const,
      reason: 'Repeated harassment',
      createdAt: '2026-08-24T12:00:00.000Z',
    }
    const deletedState = {
      status: 'deleted' as const,
      stateVersion: '7',
      actorUserId: 'administrator-id',
      moderatedAt: '2026-08-24T12:00:00.000Z',
      reason: 'Repeated harassment',
    }
    const restoreEvent = {
      id: '8',
      commentId: '42',
      actorUserId: 'administrator-id',
      previousEventId: '7',
      action: 'restore' as const,
      reason: null,
      createdAt: '2026-08-24T13:00:00.000Z',
    }
    const restoredState = {
      status: 'visible' as const,
      stateVersion: '8',
      actorUserId: 'administrator-id',
      moderatedAt: '2026-08-24T13:00:00.000Z',
      reason: null,
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)
      if (captured.url.endsWith('/delete')) return jsonResponse({ state: deletedState, event: deleteEvent })
      if (captured.url.endsWith('/restore')) return jsonResponse({ state: restoredState, event: restoreEvent })
      if (new URL(captured.url).pathname === '/api/admin/comments') {
        return jsonResponse({
          items: [
            {
              id: '42',
              parentId: null,
              rootId: '42',
              createdAt: comment.createdAt,
              status: 'active',
              bodyPreview: comment.originalBody,
              bodyPreviewTruncated: false,
              author: {
                userId: 'comment-author',
                displayName: 'Comment Author',
                effectiveRole: 'user',
                isBanned: false,
              },
              chart,
            },
          ],
          nextCursor: null,
          normalizedFilters: {
            authorUserId: 'comment-author',
            chartId: chart.chartId,
            status: 'active',
            createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
            createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
          },
          activePublication: { channel: 'production-v1', catalogRunId: '4', revision: '7' },
        })
      }
      return jsonResponse({
        activePublication: { channel: 'production-v1', catalogRunId: '4', revision: '7' },
        comment,
        state: deletedState,
        author: {
          userId: 'comment-author',
          displayName: 'Comment Author',
          email: 'comment-author@example.com',
          emailVerified: true,
          effectiveRole: 'user',
          banState: {
            status: 'unbanned',
            stateVersion: null,
            reason: null,
            actorUserId: null,
            banStartedAt: null,
            expiresAt: null,
            evaluatedAt: '2026-08-24T12:00:00.000Z',
          },
        },
        thread: {
          items: [
            {
              id: '42',
              parentId: null,
              rootId: '42',
              depth: 0,
              createdAt: comment.createdAt,
              originalBody: comment.originalBody,
              state: deletedState,
              author: {
                userId: 'comment-author',
                displayName: 'Comment Author',
                effectiveRole: 'user',
                isBanned: false,
              },
            },
          ],
          completeness: 'complete',
          nextCursor: null,
        },
        commentHistory: { items: [deleteEvent], nextCursor: 'next_page' },
        authorBanHistory: { items: [], nextCursor: null },
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.listRecentComments({
      query: {
        authorUserId: 'comment-author',
        chartId: chart.chartId,
        status: 'active',
        createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
        createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
        cursor: 'feed_page',
        limit: 50,
      },
    })
    await client.getCommentModerationDetail({
      params: { commentId: '42' },
      query: {
        threadCursor: 'thread_page',
        threadLimit: 100,
        commentHistoryCursor: 'comment_history_page',
        commentHistoryLimit: 25,
        authorBanHistoryCursor: 'ban_history_page',
        authorBanHistoryLimit: 25,
      },
    })
    await client.deleteComment({
      params: { commentId: '42' },
      body: { expectedStateVersion: null, confirmed: true, reason: 'Repeated harassment' },
    })
    await client.restoreComment({
      params: { commentId: '42' },
      body: { expectedStateVersion: '7', confirmed: true },
    })

    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
      ['GET', '/api/admin/comments'],
      ['GET', '/api/admin/comments/42'],
      ['POST', '/api/admin/comments/42/delete'],
      ['POST', '/api/admin/comments/42/restore'],
    ])
    expect(requests[0]?.url).toContain('authorUserId=comment-author')
    expect(requests[0]?.url).toContain(`chartId=${chart.chartId}`)
    expect(requests[0]?.url).toContain('status=active')
    expect(requests[0]?.url).toContain('createdAtFromInclusive=2026-08-01T00%3A00%3A00.000Z')
    expect(requests[0]?.url).toContain('createdAtBeforeExclusive=2026-09-01T00%3A00%3A00.000Z')
    expect(requests[0]?.url).toContain('cursor=feed_page')
    expect(requests[0]?.url).toContain('limit=50')
    expect(requests[1]?.url).toContain('threadCursor=thread_page')
    expect(requests[1]?.url).toContain('threadLimit=100')
    expect(requests[1]?.url).toContain('commentHistoryCursor=comment_history_page')
    expect(requests[1]?.url).toContain('commentHistoryLimit=25')
    expect(requests[1]?.url).toContain('authorBanHistoryCursor=ban_history_page')
    expect(requests[1]?.url).toContain('authorBanHistoryLimit=25')
    await expect(requests[2]?.clone().json()).resolves.toEqual({
      expectedStateVersion: null,
      confirmed: true,
      reason: 'Repeated harassment',
    })
    await expect(requests[3]?.clone().json()).resolves.toEqual({
      expectedStateVersion: '7',
      confirmed: true,
    })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('serializes chart-report queue, detail, and closure only under the private prefix', async () => {
    const requests: Request[] = []
    const reportId = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
    const chart = {
      songId: 'dsng_23456789ab',
      chartId: 'dsht_23456789ab',
      songLabel: 'Song One',
      chartLabel: 'Master (DX)',
    }
    const publication = {
      channel: 'production-v1' as const,
      catalogRunId: '4',
      revision: '7',
      fingerprintSha256: 'a'.repeat(64),
    }
    const reporter = {
      userId: 'reporter-id',
      displayName: 'Report Author',
      emailVerified: false,
      effectiveRole: 'user' as const,
      accountStatus: { status: 'active' as const },
    }
    const closure = {
      actorUserId: 'administrator-id',
      closedAt: '2026-08-24T13:00:00.000Z',
      internalNote: 'Corrected in the active catalog',
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)
      if (captured.method === 'POST') return jsonResponse({ id: reportId, state: 'closed', closure })
      if (new URL(captured.url).pathname === '/api/admin/chart-reports') {
        return jsonResponse({
          items: [],
          nextCursor: null,
          normalizedFilters: {
            state: 'open',
            chartId: chart.chartId,
            fieldKey: 'chart.level',
            category: 'incorrect_value',
            reporterUserId: reporter.userId,
            submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
            submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
            publicationRevision: publication.revision,
          },
        })
      }
      return jsonResponse({
        reporter,
        report: {
          id: reportId,
          state: 'open',
          fieldKey: 'chart.level',
          category: 'incorrect_value',
          submittedCurrentValue: '14+',
          submittedProposedValue: '15',
          explanation: 'The current game release displays level 15.',
          sourceUrls: ['https://example.com/evidence'],
          createdAt: '2026-08-24T12:00:00.000Z',
          capturedContext: { publication, chart },
          closure: null,
        },
        currentContext: { availability: 'current', publication, chart, currentValue: '14+' },
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.listChartReports({
      query: {
        state: 'open',
        chartId: chart.chartId,
        fieldKey: 'chart.level',
        category: 'incorrect_value',
        reporterUserId: reporter.userId,
        submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
        submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
        publicationRevision: publication.revision,
        cursor: 'report_page',
        limit: 25,
      },
    })
    await client.getChartReportDetail({ params: { reportId } })
    await client.closeChartReport({
      params: { reportId },
      body: { expectedState: 'open', internalNote: closure.internalNote },
    })

    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
      ['GET', '/api/admin/chart-reports'],
      ['GET', `/api/admin/chart-reports/${reportId}`],
      ['POST', `/api/admin/chart-reports/${reportId}/close`],
    ])
    for (const fragment of [
      'state=open',
      `chartId=${chart.chartId}`,
      'fieldKey=chart.level',
      'category=incorrect_value',
      `reporterUserId=${reporter.userId}`,
      'submittedAtFromInclusive=2026-08-01T00%3A00%3A00.000Z',
      'submittedAtBeforeExclusive=2026-09-01T00%3A00%3A00.000Z',
      `publicationRevision=${publication.revision}`,
      'cursor=report_page',
      'limit=25',
    ]) {
      expect(requests[0]?.url).toContain(fragment)
    }
    await expect(requests[2]?.clone().json()).resolves.toEqual({
      expectedState: 'open',
      internalNote: closure.internalNote,
    })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('uses the private prefix, global compatibility header, and included cookie credentials', async () => {
    let capturedRequest: Request | undefined
    let capturedInit: RequestInit | undefined
    const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = request as Request
      capturedInit = init
      return jsonResponse(bootstrapOutput)
    })
    const onClientCompatible = vi.fn()
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net/',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
      onClientCompatible,
    })

    await expect(client.bootstrap()).resolves.toEqual(bootstrapOutput)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.url).toBe('https://api.dxrating.net/api/admin/bootstrap')
    expect(capturedRequest?.method).toBe('GET')
    expect(capturedRequest?.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    expect(capturedInit?.credentials).toBe('include')
    expect(onClientCompatible).toHaveBeenCalledOnce()
  })

  it('does not allow runtime input to replace the transport compatibility header', async () => {
    let capturedRequest: Request | undefined
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      capturedRequest = request as Request
      return jsonResponse({ completed: true, expiresAt: '2026-08-24T12:10:00.000Z' })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await (client.completePrimaryAuthPassword as (input: unknown) => Promise<unknown>)({
      body: { password: 'correct horse battery staple' },
      headers: { [ADMIN_CONTRACT_HEADER]: `sha256:${'0'.repeat(64)}` },
    })

    expect(capturedRequest?.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })

  it('propagates request cancellation to the injected fetch implementation', async () => {
    let capturedSignal: AbortSignal | undefined
    const fetch = vi.fn((request: RequestInfo | URL) => {
      capturedSignal = (request as Request).signal
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true })
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const controller = new AbortController()

    const request = client.bootstrap(undefined, { signal: controller.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('preserves a custom abort reason without branding or retrying it as a network failure', async () => {
    let capturedSignal: AbortSignal | undefined
    const fetch = vi.fn((request: RequestInfo | URL) => {
      capturedSignal = (request as Request).signal
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true })
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const controller = new AbortController()
    const reason = new Error('route changed')

    const request = client.bootstrap(undefined, { signal: controller.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
    expect(isAdminNetworkError(reason)).toBe(false)
    expect(shouldRetryAdminRead(0, reason)).toBe(false)
  })

  it('rejects a raw typed mismatch before decoding a feature DTO', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          defined: true,
          code: 'ADMIN_CLIENT_INCOMPATIBLE',
          status: 409,
          message: 'The administrator client and backend contracts do not match',
          data: {
            requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
            expected: `sha256:${'f'.repeat(64)}`,
            received: ADMIN_CONTRACT_COMPATIBILITY_ID,
          },
        },
        { status: 409 },
      ),
    )
    const onClientCompatible = vi.fn()
    const onClientIncompatible = vi.fn()
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
      onClientCompatible,
      onClientIncompatible,
    })

    await expect(client.primaryAuthStatus()).rejects.toSatisfy(isAdminClientIncompatibleError)
    expect(onClientIncompatible).toHaveBeenCalledOnce()
    expect(onClientCompatible).not.toHaveBeenCalled()
  })

  it('brands failures raised at the fetch boundary without hiding cancellation', async () => {
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: vi.fn(async () => {
        throw new TypeError('browser fetch detail')
      }) as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await expect(client.bootstrap()).rejects.toSatisfy(isAdminNetworkError)
  })

  it('validates explicitly injected origins with the selected build mode', () => {
    expect(() =>
      createAdminDataClient({
        backendOrigin: 'http://localhost:3000',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'production',
      }),
    ).toThrow('VITE_BACKEND_URL must use HTTPS outside development and test')
    expect(() =>
      createAdminDataClient({
        backendOrigin: 'https://api.dxrating.net/admin',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'test',
      }),
    ).toThrow('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
    expect(() =>
      createAdminDataClient({
        backendOrigin: ' ',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'test',
      }),
    ).toThrow('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
  })
})