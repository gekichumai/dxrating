import { screen, waitFor, within } from '@testing-library/react'
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
const chart = {
  songId: 'dsng_23456789ab',
  chartId: 'dsht_23456789ab',
  songLabel: 'Detail Song',
  chartLabel: 'DX · MASTER',
}

const openDetail = {
  reporter: {
    userId: 'reporter-user',
    displayName: 'Detail Reporter',
    emailVerified: true,
    effectiveRole: 'user' as const,
    accountStatus: { status: 'active' as const },
  },
  report: {
    id: reportId,
    state: 'open' as const,
    closure: null,
    fieldKey: 'chart.level' as const,
    category: 'incorrect_value' as const,
    submittedCurrentValue: '14+',
    submittedProposedValue: '15',
    explanation: 'The current game release displays level 15.',
    sourceUrls: ['https://evidence.example/chart-level'],
    createdAt: '2026-08-24T12:00:00.000Z',
    capturedContext: { chart, publication },
  },
  currentContext: {
    availability: 'current' as const,
    chart,
    currentValue: '14+',
    publication,
  },
  publicChartReference: {
    legacySongId: 'legacy/song',
    sheetType: 'dx',
    sheetDifficulty: 'master',
  },
}

describe('chart-report detail route', () => {
  it('deep-links to immutable review context and refreshes closure history after an explicit close', async () => {
    let closed = false
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      if (captured.method === 'POST') {
        closed = true
        return Response.json({
          id: reportId,
          state: 'closed',
          closure: {
            actorUserId: 'test-administrator',
            closedAt: '2026-08-24T13:00:00.000Z',
            internalNote: 'Reviewed against evidence',
          },
        })
      }
      return Response.json(
        closed
          ? {
              ...openDetail,
              report: {
                ...openDetail.report,
                state: 'closed',
                closure: {
                  actorUserId: 'test-administrator',
                  closedAt: '2026-08-24T13:00:00.000Z',
                  internalNote: 'Reviewed against evidence',
                },
              },
            }
          : openDetail,
      )
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    await renderAdminApp(`/chart-reports/${reportId}`, { runtime })

    expect(await screen.findByRole('heading', { level: 2, name: translate('chartReports.detail.title') })).toBeTruthy()
    expect(screen.getByText(openDetail.report.explanation)).toBeTruthy()
    expect(screen.getByText('evidence.example')).toBeTruthy()
    const publicChart = screen.getByRole('link', { name: translate('chartReports.actions.openPublicChart') })
    expect(publicChart.getAttribute('href')).toBe('https://dxrating.net/songs/legacy%2Fsong/dx/master')
    expect(publicChart.getAttribute('referrerpolicy')).toBe('no-referrer')

    await user.type(screen.getByLabelText(translate('chartReports.close.noteLabel')), '  Reviewed against evidence  ')
    await user.click(screen.getByRole('button', { name: translate('chartReports.close.openAction') }))
    const confirmation = await screen.findByRole('dialog', { name: translate('chartReports.close.confirmTitle') })
    await user.click(within(confirmation).getByRole('button', { name: translate('chartReports.close.confirm') }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    const post = fetch.mock.calls.map(([request]) => request as Request).find(({ method }) => method === 'POST')
    expect(post).toBeTruthy()
    expect(await post!.clone().json()).toEqual({
      expectedState: 'open',
      internalNote: 'Reviewed against evidence',
    })
    expect(await screen.findByText('test-administrator', { selector: 'code' })).toBeTruthy()
    expect(screen.getByText('Reviewed against evidence')).toBeTruthy()
    expect(screen.queryByRole('button', { name: translate('chartReports.close.openAction') })).toBeNull()
  })
})