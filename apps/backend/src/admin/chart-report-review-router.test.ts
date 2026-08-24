import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
import { ChartReportReviewServiceFailure, type ChartReportReviewService } from './chart-report-review-service.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { createAdminRouter, type AdminRequestContext } from './router.js'
import type { AdminWriteLeaseRunner } from './write-lease.js'

const REQUEST_ID = '18d7118c-ec70-4603-9176-cffea8a6cd8f'
const REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const CREATED_AT = '2026-08-24T10:00:00.000Z'
const CLOSED_AT = '2026-08-24T12:00:00.000Z'
const FINGERPRINT = 'a'.repeat(64)

const authentication = ({
  effectiveRole = 'admin',
  recentPrimaryAuthSatisfied = false,
}: {
  readonly effectiveRole?: 'user' | 'admin' | 'super_admin'
  readonly recentPrimaryAuthSatisfied?: boolean
} = {}): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser: { id: `${effectiveRole}-actor`, role: effectiveRole === 'user' ? 'user' : 'admin' },
  principal:
    effectiveRole === 'user'
      ? undefined
      : {
          userId: `${effectiveRole}-actor`,
          effectiveRole,
          capabilities: {
            canModerateUsers: true,
            canModerateAdministrators: effectiveRole === 'super_admin',
            canManageAdministrators: effectiveRole === 'super_admin',
          },
        },
  session: {
    id: `${effectiveRole}-session`,
    authorizationIssuedAt: new Date('2026-08-24T00:00:00.000Z'),
  },
  assurance: { recentPrimaryAuthSatisfied, freshLoginSatisfied: true },
})

const normalizedFilters = {
  state: null,
  chartId: null,
  fieldKey: null,
  category: null,
  reporterUserId: null,
  submittedAtFromInclusive: null,
  submittedAtBeforeExclusive: null,
  publicationRevision: null,
}

const publication = {
  channel: 'production-v1' as const,
  catalogRunId: '71',
  revision: '23',
  fingerprintSha256: FINGERPRINT,
}

const chart = {
  songId: 'dsng_23456789ab',
  chartId: 'dsht_abcdefghjk',
  songLabel: 'Test Song',
  chartLabel: 'Master (DX)',
}

const reporter = {
  userId: 'reporter-id',
  displayName: 'Reporter',
  emailVerified: false,
  effectiveRole: 'user' as const,
  accountStatus: { status: 'active' as const },
}

const queueOutput = {
  items: [
    {
      id: REPORT_ID,
      state: 'open' as const,
      chart,
      fieldKey: 'chart.internal_level' as const,
      category: 'incorrect_value' as const,
      currentValuePreview: { text: '14.5', truncated: false },
      proposedValuePreview: { text: '14.6', truncated: false },
      explanationPreview: 'The game shows a different value.',
      explanationPreviewTruncated: false,
      createdAt: CREATED_AT,
      capturedPublication: publication,
      reporter,
    },
  ],
  nextCursor: 'opaque_page',
  normalizedFilters,
}

const detailOutput = {
  reporter,
  report: {
    id: REPORT_ID,
    state: 'open' as const,
    fieldKey: 'chart.internal_level' as const,
    category: 'incorrect_value' as const,
    submittedCurrentValue: 14.5,
    submittedProposedValue: 14.6,
    explanation: 'The game shows a different value.',
    sourceUrls: ['https://example.test/evidence'],
    createdAt: CREATED_AT,
    capturedContext: { publication, chart },
    closure: null,
  },
  currentContext: {
    availability: 'current' as const,
    publication: { ...publication, catalogRunId: '72', revision: '24', fingerprintSha256: 'b'.repeat(64) },
    chart,
    currentValue: 14.6,
  },
}

const closeOutput = {
  id: REPORT_ID,
  state: 'closed' as const,
  closure: {
    actorUserId: 'admin-actor',
    closedAt: CLOSED_AT,
    internalNote: 'Corrected upstream.',
  },
}

const createReviewService = (overrides: Partial<ChartReportReviewService> = {}): ChartReportReviewService => ({
  listChartReports: vi.fn(async () => queueOutput),
  getChartReportDetail: vi.fn(async () => detailOutput),
  closeChartReport: vi.fn(async () => closeOutput),
  ...overrides,
})

const invoke = (
  chartReportReview: ChartReportReviewService,
  path: string,
  {
    method = 'GET',
    body,
    requestAuthentication = authentication(),
    runWriteLease = async (_identity, operation) => operation(),
    recordAuthorizationResult = vi.fn(),
  }: {
    readonly method?: 'GET' | 'POST'
    readonly body?: Record<string, unknown>
    readonly requestAuthentication?: AdminRequestAuthentication
    readonly runWriteLease?: AdminWriteLeaseRunner
    readonly recordAuthorizationResult?: NonNullable<AdminRequestContext['recordAuthorizationResult']>
  } = {},
) =>
  new OpenAPIHandler(createAdminRouter({ chartReportReview, runWriteLease })).handle(
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

describe('administrator chart-report review router', () => {
  it('forwards the complete normalized queue query through the private read boundary', async () => {
    const listChartReports = vi.fn(async () => ({
      ...queueOutput,
      normalizedFilters: {
        state: 'closed' as const,
        chartId: chart.chartId,
        fieldKey: 'chart.internal_level' as const,
        category: 'incorrect_value' as const,
        reporterUserId: reporter.userId,
        submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
        submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
        publicationRevision: '23',
      },
    }))
    const service = createReviewService({ listChartReports })
    const query = new URLSearchParams({
      state: 'closed',
      chartId: chart.chartId,
      fieldKey: 'chart.internal_level',
      category: 'incorrect_value',
      reporterUserId: reporter.userId,
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: '23',
      cursor: 'opaque_page',
      limit: '25',
    })

    const result = await invoke(service, `/chart-reports?${query}`)

    expect(result.response?.status).toBe(200)
    expect(listChartReports).toHaveBeenCalledWith({
      state: 'closed',
      chartId: chart.chartId,
      fieldKey: 'chart.internal_level',
      category: 'incorrect_value',
      reporterUserId: reporter.userId,
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: '23',
      cursor: 'opaque_page',
      limit: 25,
    })
  })

  it('returns immutable captured evidence separately from the active-publication comparison', async () => {
    const getChartReportDetail = vi.fn(async () => detailOutput)
    const service = createReviewService({ getChartReportDetail })

    const result = await invoke(service, `/chart-reports/${REPORT_ID}`)

    expect(result.response?.status).toBe(200)
    await expect(result.response?.json()).resolves.toEqual(detailOutput)
    expect(getChartReportDetail).toHaveBeenCalledWith({ reportId: REPORT_ID })
  })

  it.each(['admin', 'super_admin'] as const)(
    'allows a %s without recent primary auth and derives close actor plus write lease from the session',
    async (effectiveRole) => {
      const requestAuthentication = authentication({ effectiveRole, recentPrimaryAuthSatisfied: false })
      const actorUserId =
        requestAuthentication.status === 'authenticated' ? requestAuthentication.authorizationUser.id : ''
      const sessionId = requestAuthentication.status === 'authenticated' ? requestAuthentication.session.id : ''
      const closeChartReport = vi.fn(async () => ({
        ...closeOutput,
        closure: { ...closeOutput.closure, actorUserId },
      }))
      const leaseIdentities: Array<{ readonly userId: string; readonly sessionId: string }> = []
      const runWriteLease: AdminWriteLeaseRunner = async (identity, operation) => {
        leaseIdentities.push(identity)
        return operation()
      }
      const service = createReviewService({ closeChartReport })

      const result = await invoke(service, `/chart-reports/${REPORT_ID}/close`, {
        method: 'POST',
        body: { expectedState: 'open', internalNote: '  Corrected upstream.  ' },
        requestAuthentication,
        runWriteLease,
      })

      expect(result.response?.status).toBe(200)
      expect(leaseIdentities).toEqual([{ userId: actorUserId, sessionId }])
      expect(closeChartReport).toHaveBeenCalledWith({
        reportId: REPORT_ID,
        actorUserId,
        expectedState: 'open',
        internalNote: 'Corrected upstream.',
      })
    },
  )

  it.each([
    [{ status: 'unauthenticated' as const }, 401, 'UNAUTHENTICATED'],
    [authentication({ effectiveRole: 'user' }), 403, 'FORBIDDEN'],
  ])('rejects a non-administrator before any review operation', async (requestAuthentication, status, code) => {
    const service = createReviewService()

    const result = await invoke(service, '/chart-reports', { requestAuthentication })

    expect(result.response?.status).toBe(status)
    await expect(result.response?.json()).resolves.toMatchObject({ defined: true, code })
    expect(service.listChartReports).not.toHaveBeenCalled()
  })

  it.each([
    ['VALIDATION_FAILED', '/chart-reports', 'GET', undefined, 400],
    ['INVALID_CURSOR', '/chart-reports?cursor=opaque_page', 'GET', undefined, 400],
    ['NOT_FOUND', `/chart-reports/${REPORT_ID}`, 'GET', undefined, 404],
    ['CHART_UNAVAILABLE', `/chart-reports/${REPORT_ID}`, 'GET', undefined, 503],
    ['CONFLICT', `/chart-reports/${REPORT_ID}/close`, 'POST', { expectedState: 'open', internalNote: null }, 409],
  ] as const)('maps %s service failures to sanitized typed responses', async (code, path, method, body, status) => {
    const failure = vi.fn(async () => {
      throw new ChartReportReviewServiceFailure(code)
    })
    const service = createReviewService({
      ...(code === 'VALIDATION_FAILED' || code === 'INVALID_CURSOR' ? { listChartReports: failure } : {}),
      ...(code === 'NOT_FOUND' || code === 'CHART_UNAVAILABLE' ? { getChartReportDetail: failure } : {}),
      ...(code === 'CONFLICT' ? { closeChartReport: failure } : {}),
    })
    const recordAuthorizationResult = vi.fn()

    const result = await invoke(service, path, { method, body, recordAuthorizationResult })

    expect(result.response?.status).toBe(status)
    await expect(result.response?.json()).resolves.toMatchObject({
      defined: true,
      code,
      data: { requestId: REQUEST_ID },
    })
    expect(recordAuthorizationResult).toHaveBeenCalledWith(
      code === 'VALIDATION_FAILED' || code === 'INVALID_CURSOR'
        ? 'listChartReports'
        : code === 'CONFLICT'
          ? 'closeChartReport'
          : 'getChartReportDetail',
      code,
    )
  })

  it('rejects invalid filters and forbidden lifecycle fields before invoking the service', async () => {
    const service = createReviewService()
    const results = await Promise.all([
      invoke(service, '/chart-reports?limit=101'),
      invoke(
        service,
        '/chart-reports?submittedAtFromInclusive=2026-09-01T00%3A00%3A00.000Z&submittedAtBeforeExclusive=2026-08-01T00%3A00%3A00.000Z',
      ),
      invoke(service, `/chart-reports/${REPORT_ID}/close`, {
        method: 'POST',
        body: { expectedState: 'open', internalNote: null, reopen: true },
      }),
      invoke(service, `/chart-reports/${REPORT_ID}/close`, {
        method: 'POST',
        body: { expectedState: 'closed', internalNote: null },
      }),
    ])

    expect(results.map((result) => result.response?.status)).toEqual([400, 400, 400, 400])
    expect(service.listChartReports).not.toHaveBeenCalled()
    expect(service.closeChartReport).not.toHaveBeenCalled()
  })
})