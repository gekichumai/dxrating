import { type AdminContractOutputs } from '@gekichumai/admin-contract'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createAdminDataClient } from '../data/admin-client'
import { ADMIN_STALE_TIME_MS } from '../data/freshness'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import { chartReportDetailQueryOptions, chartReportsQueryOptions } from '../data/query-options'

const reportId = '123e4567-e89b-42d3-a456-426614174000'
const publication = {
  channel: 'production-v1' as const,
  catalogRunId: '81',
  revision: '144',
  fingerprintSha256: 'a'.repeat(64),
}
const chart = {
  songId: 'dsng_23456789ab',
  chartId: 'dsht_23456789ab',
  songLabel: 'World’s End Loneliness',
  chartLabel: 'DX · MASTER',
}
const reporter = {
  userId: 'reporter-user',
  displayName: 'Chart Reporter',
  emailVerified: false,
  effectiveRole: 'user' as const,
  accountStatus: { status: 'active' as const },
}

describe('administrator chart-report query options', () => {
  it('keys every queue filter and opaque cursor under the 15-second reports policy', async () => {
    const output = {
      items: [],
      nextCursor: 'next_filter_bound_page',
      normalizedFilters: {
        state: 'open' as const,
        chartId: chart.chartId,
        fieldKey: 'chart.internal_level' as const,
        category: 'incorrect_value' as const,
        reporterUserId: reporter.userId,
        submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
        submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
        publicationRevision: publication.revision,
      },
    }
    const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(output))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const parameters = {
      state: 'open' as const,
      chartId: chart.chartId,
      fieldKey: 'chart.internal_level' as const,
      category: 'incorrect_value' as const,
      reporterUserId: reporter.userId,
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: publication.revision,
      cursor: 'filter_bound_page',
    }
    const options = chartReportsQueryOptions(data, parameters)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.reports.list(parameters))
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.reports)
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['listChartReports'] | undefined
    >()
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(output)

    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    const url = new URL((request as Request).url)
    expect(url.pathname).toBe('/api/admin/chart-reports')
    expect(Object.fromEntries(url.searchParams)).toMatchObject(parameters)
  })

  it('keys durable detail reads by immutable report ID under the same reports policy', async () => {
    const output = {
      reporter,
      report: {
        id: reportId,
        state: 'open' as const,
        fieldKey: 'chart.internal_level' as const,
        category: 'incorrect_value' as const,
        submittedCurrentValue: 14.7,
        submittedProposedValue: 14.8,
        explanation: 'The value differs from the cited official listing.',
        sourceUrls: ['https://example.com/evidence?revision=144'],
        createdAt: '2026-08-24T10:00:00.000Z',
        capturedContext: { publication, chart },
        closure: null,
      },
      currentContext: {
        availability: 'current' as const,
        publication,
        chart,
        currentValue: 14.7,
      },
      publicChartReference: {
        legacySongId: 'legacy-song-id',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      },
    }
    const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(output))
    const data = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const options = chartReportDetailQueryOptions(data, reportId)
    const queryClient = createAdminTestQueryClient()

    expect(options.queryKey).toEqual(adminQueryKeys.reports.detail(reportId))
    expect(options.staleTime).toBe(ADMIN_STALE_TIME_MS.reports)
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      AdminContractOutputs['getChartReportDetail'] | undefined
    >()
    await expect(queryClient.fetchQuery(options)).resolves.toEqual(output)

    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    expect(new URL((request as Request).url).pathname).toBe(`/api/admin/chart-reports/${reportId}`)
  })
})