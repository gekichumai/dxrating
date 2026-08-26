import { ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ORPCError } from '@orpc/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminAuthProvider } from '../auth/admin-auth-context'
import type { AdminDataClient } from '../data/admin-client'
import { AdminDataProvider } from '../data/admin-data-context'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import { ChartReportCloseControls, type ChartReportCloseControlsLabels } from './chart-report-close-controls'

type ChartReportDetailOutput = AdminContractOutputs['getChartReportDetail']

const labels: ChartReportCloseControlsLabels = {
  cancel: 'Cancel',
  confirm: 'Close report',
  confirmDescription: 'Confirm the exact report without changing its evidence.',
  confirmTitle: 'Confirm report closure',
  description: 'Close this independently reviewed report with an optional private note.',
  errors: {
    conflict: 'Another administrator already closed this report. Detail refreshed.',
    forbidden: 'The backend rejected this closure.',
    generic: 'The report could not be closed. The note is preserved.',
  },
  noteDescription: 'Optional, private, and limited to 1,000 characters.',
  noteLabel: 'Internal closure note',
  notePlaceholder: 'Optional review context',
  noteTooLong: 'The internal note cannot exceed 1,000 characters.',
  openAction: 'Review report closure',
  refresh: 'Refresh current state',
  retry: 'Review and try again',
  success: 'Report closed and affected views are refreshing.',
  target: 'Report ID',
  title: 'Close report',
}

const detail = (reportId = '00000000-0000-4000-8000-000000000327'): ChartReportDetailOutput => ({
  reporter: {
    userId: 'reporter-user',
    displayName: 'Reporter',
    emailVerified: true,
    effectiveRole: 'user',
    accountStatus: { status: 'active' },
  },
  report: {
    id: reportId,
    state: 'open',
    closure: null,
    fieldKey: 'chart.level',
    category: 'incorrect_value',
    submittedCurrentValue: '13',
    submittedProposedValue: '13+',
    explanation: 'Evidence',
    sourceUrls: [],
    createdAt: '2026-08-24T12:00:00.000Z',
    capturedContext: {
      chart: {
        songId: 'dsng_23456789ab',
        chartId: 'dsht_23456789ab',
        songLabel: 'Song',
        chartLabel: 'DX Master',
      },
      publication: {
        channel: 'production-v1',
        catalogRunId: 'catalog-run-7',
        revision: '7',
        fingerprintSha256: 'a'.repeat(64),
      },
    },
  },
  currentContext: {
    availability: 'retired',
    songId: 'dsng_23456789ab',
    chartId: 'dsht_23456789ab',
    publication: {
      channel: 'production-v1',
      catalogRunId: 'catalog-run-8',
      revision: '8',
      fingerprintSha256: 'b'.repeat(64),
    },
  },
  publicChartReference: null,
})

const closeResult = (reportId: string) => ({
  id: reportId,
  state: 'closed' as const,
  closure: {
    actorUserId: 'admin-user',
    closedAt: '2026-08-24T13:00:00.000Z',
    internalNote: null,
  },
})

const definedError = (code: string, status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'Raw server details must not be rendered',
    status,
  })

type HarnessOptions = {
  readonly closeChartReport?: ReturnType<typeof vi.fn>
  readonly initialDetail?: ChartReportDetailOutput
  readonly reportFeatureError?: Mock<(error: unknown) => boolean>
}

const renderControls = ({
  closeChartReport = vi.fn(async (input: { readonly params: { readonly reportId: string } }) =>
    closeResult(input.params.reportId),
  ),
  initialDetail = detail(),
  reportFeatureError = vi.fn((_error: unknown) => false),
}: HarnessOptions = {}) => {
  const data = {
    client: { closeChartReport },
    orpc: {},
  } as unknown as AdminDataClient
  const queryClient = createAdminTestQueryClient()
  const tree = (currentDetail: ChartReportDetailOutput) => (
    <MantineProvider>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <AdminDataProvider value={data}>
          <AdminAuthProvider
            actions={{
              reportFeatureError,
              retry: async () => undefined,
              signOut: async () => undefined,
            }}
            value={{
              status: 'authenticated',
              principal: {
                userId: 'admin-user',
                effectiveRole: 'admin',
                capabilities: {
                  canManageAdministrators: false,
                  canModerateAdministrators: false,
                  canModerateUsers: true,
                },
              },
            }}
          >
            <ChartReportCloseControls detail={currentDetail} labels={labels} />
          </AdminAuthProvider>
        </AdminDataProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
  const view = render(tree(initialDetail))
  return {
    closeChartReport,
    queryClient,
    reportFeatureError,
    rerenderDetail: (next: ChartReportDetailOutput) => view.rerender(tree(next)),
    ...view,
  }
}

const openConfirmation = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: labels.openAction }))
  return await screen.findByRole('dialog', { name: labels.confirmTitle })
}

afterEach(() => {
  act(() => notifications.clean())
  vi.restoreAllMocks()
})

describe('chart-report close controls', () => {
  it('requires explicit confirmation and sends an exact nullable open-state request directly', async () => {
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const { closeChartReport, queryClient } = renderControls()
    const seededKeys = [
      adminQueryKeys.reports.list(),
      adminQueryKeys.reports.detail(detail().report.id),
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.charts.detail('dsht_23456789ab'),
    ]
    for (const key of seededKeys) queryClient.setQueryData(key, { cached: true })

    const dialog = await openConfirmation(user)
    expect(closeChartReport).not.toHaveBeenCalled()
    expect(within(dialog).getByText(detail().report.id)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))

    await waitFor(() => expect(closeChartReport).toHaveBeenCalledOnce())
    expect(closeChartReport.mock.calls[0]?.[0]).toEqual({
      params: { reportId: detail().report.id },
      body: { expectedState: 'open', internalNote: null },
    })
    expect(closeChartReport.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    for (const key of seededKeys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(notification).toHaveBeenCalledWith({
      color: 'green',
      message: labels.success,
    })
  })

  it('trims and bounds the optional note before it reaches the private client', async () => {
    const user = userEvent.setup()
    const { closeChartReport } = renderControls()
    const textarea = screen.getByLabelText(labels.noteLabel)
    fireEvent.change(textarea, {
      target: { value: '  reviewed\nwith source  ' },
    })
    const dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))

    await waitFor(() => expect(closeChartReport).toHaveBeenCalledOnce())
    expect(closeChartReport.mock.calls[0]?.[0].body).toEqual({
      expectedState: 'open',
      internalNote: 'reviewed\nwith source',
    })

    const second = renderControls()
    fireEvent.change(screen.getAllByLabelText(labels.noteLabel).at(-1)!, {
      target: {
        value: 'x'.repeat(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH + 1),
      },
    })
    fireEvent.click(screen.getAllByRole('button', { name: labels.openAction }).at(-1)!)
    expect(screen.getByText(labels.noteTooLong)).toBeTruthy()
    expect(second.closeChartReport).not.toHaveBeenCalled()
  })

  it('preserves the private note and requires an explicit reviewed retry after failure', async () => {
    const failure = new Error('private transport detail')
    const closeChartReport = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(closeResult(detail().report.id))
    const user = userEvent.setup()
    const { reportFeatureError } = renderControls({ closeChartReport })
    await user.type(screen.getByLabelText(labels.noteLabel), 'Preserve this note')
    let dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(labels.errors.generic)
    expect(alert.textContent).not.toContain('private transport detail')
    expect(screen.getByDisplayValue('Preserve this note')).toBeTruthy()
    expect(closeChartReport).toHaveBeenCalledOnce()
    expect(reportFeatureError).toHaveBeenCalledWith(failure)

    await user.click(within(alert).getByRole('button', { name: labels.retry }))
    dialog = await screen.findByRole('dialog', { name: labels.confirmTitle })
    expect(closeChartReport).toHaveBeenCalledOnce()
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))
    await waitFor(() => expect(closeChartReport).toHaveBeenCalledTimes(2))
  })

  it('refreshes authoritative report families on conflict without optimism and preserves the note', async () => {
    const failure = definedError('CONFLICT', 409)
    const closeChartReport = vi.fn(async () => {
      throw failure
    })
    const user = userEvent.setup()
    const { queryClient, reportFeatureError } = renderControls({
      closeChartReport,
    })
    const seededKeys = [
      adminQueryKeys.reports.list({ state: 'open' }),
      adminQueryKeys.reports.detail(detail().report.id),
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.charts.detail('dsht_23456789ab'),
    ]
    for (const key of seededKeys) queryClient.setQueryData(key, { authoritative: 'unchanged' })
    await user.type(screen.getByLabelText(labels.noteLabel), 'Concurrent review note')
    const dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))

    expect((await screen.findByRole('alert')).textContent).toContain(labels.errors.conflict)
    expect(screen.getByDisplayValue('Concurrent review note')).toBeTruthy()
    for (const key of seededKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryData(key)).toEqual({
        authoritative: 'unchanged',
      })
    }
    expect(reportFeatureError).toHaveBeenCalledWith(failure)
  })

  it('shows only local authorization copy, preserves the note, and never retries a forbidden closure', async () => {
    const failure = definedError('FORBIDDEN', 403)
    const closeChartReport = vi.fn(async () => {
      throw failure
    })
    const user = userEvent.setup()
    const { reportFeatureError } = renderControls({ closeChartReport })
    await user.type(screen.getByLabelText(labels.noteLabel), 'Preserve after authorization failure')
    const dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(labels.errors.forbidden)
    expect(alert.textContent).not.toContain('Raw server details')
    expect(screen.getByDisplayValue('Preserve after authorization failure')).toBeTruthy()
    expect(closeChartReport).toHaveBeenCalledOnce()
    expect(reportFeatureError).toHaveBeenCalledWith(failure)

    await user.click(within(alert).getByRole('button', { name: labels.retry }))
    expect(await screen.findByRole('dialog', { name: labels.confirmTitle })).toBeTruthy()
    expect(closeChartReport).toHaveBeenCalledOnce()
  })

  it('prevents duplicate submission while the direct request is pending', async () => {
    let resolveClose: ((value: unknown) => void) | undefined
    const closeChartReport = vi.fn(
      async () =>
        await new Promise((resolve) => {
          resolveClose = resolve
        }),
    )
    const user = userEvent.setup()
    renderControls({ closeChartReport })
    const dialog = await openConfirmation(user)
    const confirm = within(dialog).getByRole('button', {
      name: labels.confirm,
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(closeChartReport).toHaveBeenCalledOnce())
    resolveClose?.(closeResult(detail().report.id))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: labels.confirmTitle })).toBeNull())
  })

  it('aborts an in-flight request on unmount and when the report subject changes', async () => {
    const signals: AbortSignal[] = []
    const closeChartReport = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      if (options.signal) signals.push(options.signal)
      return await new Promise(() => undefined)
    })
    const user = userEvent.setup()
    const first = renderControls({ closeChartReport })
    let dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))
    await waitFor(() => expect(signals).toHaveLength(1))

    first.rerenderDetail(detail('00000000-0000-4000-8000-000000000328'))
    expect(signals[0]?.aborted).toBe(true)

    dialog = await openConfirmation(user)
    await user.click(within(dialog).getByRole('button', { name: labels.confirm }))
    await waitFor(() => expect(signals).toHaveLength(2))
    first.unmount()
    expect(signals[1]?.aborted).toBe(true)
  })

  it('does not offer closure controls for an already closed report', () => {
    const base = detail()
    renderControls({
      initialDetail: {
        ...base,
        report: {
          ...base.report,
          state: 'closed',
          closure: {
            actorUserId: 'other-admin',
            closedAt: '2026-08-24T13:00:00.000Z',
            internalNote: null,
          },
        },
      },
    })
    expect(screen.queryByRole('button', { name: labels.openAction })).toBeNull()
  })
})