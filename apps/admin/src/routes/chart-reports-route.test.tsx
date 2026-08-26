import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const reportId = '00000000-0000-4000-8000-000000000327'

const publication = {
  channel: 'production-v1' as const,
  catalogRunId: '7',
  revision: '81',
  fingerprintSha256: 'a'.repeat(64),
}

const row = {
  id: reportId,
  state: 'open' as const,
  chart: {
    songId: 'dsng_23456789ab',
    chartId: 'dsht_23456789ab',
    songLabel: 'Queue Song',
    chartLabel: 'DX · MASTER',
  },
  fieldKey: 'chart.level' as const,
  category: 'incorrect_value' as const,
  currentValuePreview: { text: '"14+"', truncated: false },
  proposedValuePreview: { text: '"15"', truncated: false },
  explanationPreview: 'The published level differs from the evidence.',
  explanationPreviewTruncated: false,
  createdAt: '2026-08-24T12:00:00.000Z',
  capturedPublication: publication,
  reporter: {
    userId: 'reporter-user',
    displayName: 'Queue Reporter',
    emailVerified: false,
    effectiveRole: 'user' as const,
    accountStatus: { status: 'active' as const },
  },
}

describe('chart-report queue route', () => {
  it('restores every URL filter, forwards it to the typed list read, and paginates with the server cursor', async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL((request as Request).url)
      const cursor = url.searchParams.get('cursor')
      return Response.json({
        items: [row],
        nextCursor: cursor ? null : 'opaque_page_2',
        normalizedFilters: {
          state: 'open',
          chartId: row.chart.chartId,
          fieldKey: row.fieldKey,
          category: row.category,
          reporterUserId: row.reporter.userId,
          submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
          submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
          publicationRevision: publication.revision,
        },
      })
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const parameters = new URLSearchParams({
      state: 'open',
      chartId: row.chart.chartId,
      fieldKey: row.fieldKey,
      category: row.category,
      reporterUserId: row.reporter.userId,
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: publication.revision,
    })
    const user = userEvent.setup()
    const rendered = await renderAdminApp(`/chart-reports?${parameters}`, { runtime })

    expect(await screen.findByText(row.explanationPreview)).toBeTruthy()
    expect(screen.getByRole('link', { name: translate('chartReports.list.openDetail') }).getAttribute('href')).toBe(
      `/chart-reports/${reportId}`,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const firstUrl = new URL((fetch.mock.calls[0]![0] as Request).url)
    for (const [name, value] of parameters) expect(firstUrl.searchParams.get(name)).toBe(value)
    expect(firstUrl.searchParams.get('cursor')).toBeNull()

    await user.click(screen.getByRole('button', { name: translate('chartReports.list.next') }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const nextUrl = new URL((fetch.mock.calls[1]![0] as Request).url)
    expect(nextUrl.searchParams.get('cursor')).toBe('opaque_page_2')
    for (const [name, value] of parameters) expect(nextUrl.searchParams.get(name)).toBe(value)
    expect(rendered.router.state.location.search).toMatchObject({ cursor: 'opaque_page_2' })
  })

  it('drops malformed independent URL fields before the list request', async () => {
    const fetch = vi.fn(async (_request: RequestInfo | URL) =>
      Response.json({
        items: [],
        nextCursor: null,
        normalizedFilters: {
          state: null,
          chartId: null,
          fieldKey: null,
          category: null,
          reporterUserId: null,
          submittedAtFromInclusive: null,
          submittedAtBeforeExclusive: null,
          publicationRevision: null,
        },
      }),
    )
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    await renderAdminApp('/chart-reports?state=assigned&chartId=bad&cursor=bad.cursor', { runtime })

    expect(await screen.findByText(translate('chartReports.list.emptyTitle'))).toBeTruthy()
    const requested = new URL((fetch.mock.calls[0]![0] as Request).url)
    expect([...requested.searchParams]).toEqual([])
  })
})