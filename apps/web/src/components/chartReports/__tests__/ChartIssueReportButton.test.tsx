import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import type { FlattenedSheet } from '@/songs'
import {
  type ChartIssueReportDependencies,
  ChartIssueReportButton,
  ChartIssueReportForm,
  type ChartReportChallengeHandle,
  type ChartReportChallengeProps,
  type ResolvedChartReportContext,
} from '../ChartIssueReportButton'

const authState = vi.hoisted(() => ({
  session: null as object | null,
  user: null as { emailVerified?: boolean } | null,
  openLoginDialog: vi.fn(),
}))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: authState.session,
    user: authState.user,
    isAuthenticated: !!authState.session,
    ensureAuthenticated: vi.fn(async () => !!authState.session),
    openLoginDialog: authState.openLoginDialog,
    closeLoginDialog: vi.fn(),
    LoginDialog: () => null,
  }),
}))

const challengeReset = vi.fn()

const TestChallenge = forwardRef<ChartReportChallengeHandle, ChartReportChallengeProps>((props, ref) => {
  useImperativeHandle(ref, () => ({ reset: challengeReset }))

  return (
    <div data-testid="chart-report-challenge" data-action={props.action}>
      <button type="button" onClick={props.onReady}>
        challenge ready
      </button>
      <button type="button" onClick={() => props.onSuccess('fresh-turnstile-token')}>
        challenge success
      </button>
      <button type="button" onClick={props.onExpire}>
        challenge expire
      </button>
      <button type="button" onClick={props.onError}>
        challenge error
      </button>
    </div>
  )
})
TestChallenge.displayName = 'TestChallenge'

const sheet: FlattenedSheet = {
  id: 'legacy-song:dx:master',
  songId: 'legacy-song',
  identity: {
    songId: 'legacy-song',
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
  },
  title: 'Example Song',
  artist: 'Example Artist',
  category: CategoryEnum.Maimai,
  bpm: 180,
  imageName: 'example-song',
  isNew: false,
  isLocked: false,
  sheets: [],
  searchAcronyms: [],
  type: TypeEnum.DX,
  difficulty: DifficultyEnum.Master,
  level: '13+',
  internalLevelValue: 13.8,
  noteDesigner: 'Designer',
  noteCounts: {
    tap: 400,
    hold: 50,
    slide: 100,
    touch: 25,
    break: 10,
    total: 585,
  },
  regions: { jp: true, intl: true, cn: false },
  version: VersionEnum.CiRCLEPLUS,
  isSpecial: false,
  isTypeUtage: false,
  isRatingEligible: true,
  releaseDateTimestamp: 1,
  tags: [],
}

const resolvedContext = (overrides: Partial<ResolvedChartReportContext> = {}): ResolvedChartReportContext => ({
  songId: 'dsng_23456789ab',
  chartId: 'dsht_23456789ab',
  fieldKey: 'chart.level',
  publicationRevision: '12',
  currentValue: '13+',
  valueKind: 'string',
  ...overrides,
})

const createdReport = {
  id: '11111111-2222-4333-8444-555555555555',
  state: 'open' as const,
  createdAt: '2026-08-24T12:00:00.000Z',
}

const createDependencies = (overrides: Partial<ChartIssueReportDependencies> = {}) => {
  const resolveContext = vi.fn(async () => resolvedContext())
  const createReport = vi.fn(async () => createdReport)
  return {
    resolveContext,
    createReport,
    ChallengeComponent: TestChallenge,
    turnstileSiteKey: 'test-site-key',
    ...overrides,
  } satisfies ChartIssueReportDependencies
}

const renderForm = (dependencies = createDependencies()) => {
  const onClose = vi.fn()
  render(<ChartIssueReportForm sheet={sheet} onClose={onClose} dependencies={dependencies} />)
  return { dependencies, onClose }
}

const waitForResolvedContext = async () => {
  await screen.findByText('dsht_23456789ab')
  expect(screen.getByText('dsng_23456789ab')).toBeTruthy()
  expect(screen.getByText('12')).toBeTruthy()
  expect(screen.getByText('13+')).toBeTruthy()
}

const completeValidForm = async () => {
  await waitForResolvedContext()
  fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: '14' } })
  fireEvent.change(screen.getByLabelText('Explanation'), {
    target: { value: 'The current displayed level is out of date.' },
  })
  fireEvent.change(screen.getByLabelText('Source URL 1'), {
    target: { value: 'https://example.com/chart-source' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'challenge success' }))
}

describe('ChartIssueReportButton', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    authState.session = null
    authState.user = null
    authState.openLoginDialog.mockReset()
    challengeReset.mockReset()
  })

  it('opens authentication instead of the report form for a signed-out user', () => {
    render(<ChartIssueReportButton sheet={sheet} dependencies={createDependencies()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Report chart issue' }))

    expect(authState.openLoginDialog).toHaveBeenCalledOnce()
    expect(screen.queryByText('Report a chart data issue')).toBeNull()
  })

  it('allows an authenticated account without checking email verification', async () => {
    authState.session = { id: 'session-1' }
    authState.user = { emailVerified: false }
    const dependencies = createDependencies()
    render(<ChartIssueReportButton sheet={sheet} dependencies={dependencies} />)

    fireEvent.click(screen.getByRole('button', { name: 'Report chart issue' }))

    expect(await screen.findByText('Report a chart data issue')).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    const titleId = dialog.getAttribute('aria-labelledby')
    expect(titleId).toBeTruthy()
    expect(document.getElementById(titleId!)?.textContent).toBe('Report a chart data issue')
    await waitFor(() => expect(dependencies.resolveContext).toHaveBeenCalledOnce())
    expect(authState.openLoginDialog).not.toHaveBeenCalled()
  })
})

describe('ChartIssueReportForm', () => {
  beforeEach(() => {
    challengeReset.mockReset()
  })

  it('binds the legacy chart view to server context and submits through the typed dependencies', async () => {
    const { dependencies } = renderForm()

    await completeValidForm()

    expect(dependencies.resolveContext).toHaveBeenCalledWith({
      songId: 'legacy-song',
      chartType: 'dx',
      chartDifficulty: 'master',
      fieldKey: 'chart.level',
    })
    expect(screen.getByTestId('chart-report-challenge').getAttribute('data-action')).toBe('chart-report')
    expect(screen.getByRole('group', { name: 'Security verification' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(dependencies.createReport).toHaveBeenCalledOnce())
    expect(dependencies.createReport).toHaveBeenCalledWith({
      songId: 'dsng_23456789ab',
      chartId: 'dsht_23456789ab',
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      publicationRevision: '12',
      currentValue: '13+',
      proposedValue: '14',
      explanation: 'The current displayed level is out of date.',
      sourceUrls: ['https://example.com/chart-source'],
      turnstileToken: 'fresh-turnstile-token',
    })
    expect(await screen.findByText('Report submitted')).toBeTruthy()
    expect(screen.getByText(`Report ID: ${createdReport.id}`)).toBeTruthy()
    expect(screen.getByText(/Reports are reviewed independently/)).toBeTruthy()
    expect(challengeReset).toHaveBeenCalledOnce()
  })

  it('shows field-level errors for malformed values, URLs, and a whitespace-only explanation', async () => {
    const { dependencies } = renderForm()
    await waitForResolvedContext()
    fireEvent.change(screen.getByLabelText('Explanation'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('Source URL 1'), { target: { value: 'ftp://example.com/source' } })
    fireEvent.click(screen.getByRole('button', { name: 'challenge success' }))

    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Enter a proposed value.')).toBeTruthy()
    expect(screen.getByText('Explain why this value should be changed.')).toBeTruthy()
    expect(screen.getByText('Enter a complete public HTTP or HTTPS URL.')).toBeTruthy()
    expect(screen.getByText('Review the highlighted fields and try again.')).toBeTruthy()
    expect(dependencies.createReport).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Explanation') as HTMLInputElement).value).toBe('   ')
  })

  it('clears expired and failed Turnstile tokens and exposes an accessible retry', async () => {
    renderForm()
    await waitForResolvedContext()
    const submit = screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText('Loading security verification...')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'challenge ready' }))
    fireEvent.click(screen.getByRole('button', { name: 'challenge success' }))
    expect(submit.disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'challenge expire' }))
    expect(screen.getByText(/Security verification expired/)).toBeTruthy()
    expect(submit.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry security verification' }))
    expect(challengeReset).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'challenge error' }))
    expect(screen.getByText('Security verification could not be completed.')).toBeTruthy()
    expect(submit.disabled).toBe(true)
  })

  it('hides mismatched context while changing fields and accepts null for a nullable number', async () => {
    let finishBpmResolution: ((context: ResolvedChartReportContext) => void) | undefined
    const bpmResolution = new Promise<ResolvedChartReportContext>((resolve) => {
      finishBpmResolution = resolve
    })
    const resolveContext = vi.fn(async (input: { fieldKey: string }) => {
      if (input.fieldKey === 'song.bpm') return bpmResolution
      return resolvedContext()
    })
    const createReport = vi.fn(async () => createdReport)
    renderForm(createDependencies({ resolveContext, createReport }))
    await waitForResolvedContext()

    fireEvent.change(screen.getByLabelText('Affected field'), {
      target: { value: 'song.bpm' },
    })

    expect(screen.queryByText('13+')).toBeNull()
    expect(screen.getByText('Loading the current published chart data...')).toBeTruthy()
    expect((screen.getByLabelText('Proposed value') as HTMLInputElement).disabled).toBe(true)

    await act(async () => {
      finishBpmResolution?.(
        resolvedContext({
          fieldKey: 'song.bpm',
          currentValue: 180,
          valueKind: 'nullable_number',
        }),
      )
      await bpmResolution
    })

    expect(await screen.findByText('180')).toBeTruthy()
    const proposedValue = screen.getByLabelText('Proposed value') as HTMLInputElement
    expect(proposedValue.disabled).toBe(false)
    expect(proposedValue.getAttribute('type')).toBe('text')
    fireEvent.change(proposedValue, { target: { value: 'null' } })
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'The published BPM should be removed.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'challenge success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(createReport).toHaveBeenCalledOnce())
    expect(createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldKey: 'song.bpm',
        currentValue: 180,
        proposedValue: null,
      }),
    )
  })

  it('keeps form content and resets Turnstile after a rate limit', async () => {
    const createReport = vi.fn(async () => {
      throw {
        code: 'CHART_REPORT_RATE_LIMITED',
        status: 429,
        data: { retryAfterSeconds: 73 },
      }
    })
    const { dependencies } = renderForm(createDependencies({ createReport }))
    await completeValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Too many reports were submitted recently. Try again in 73 seconds.')).toBeTruthy()
    expect((screen.getByLabelText('Proposed value') as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText('Explanation') as HTMLInputElement).value).toContain('out of date')
    expect((screen.getByLabelText('Source URL 1') as HTMLInputElement).value).toBe('https://example.com/chart-source')
    expect(challengeReset).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement).disabled).toBe(true)
    expect(dependencies.createReport).toHaveBeenCalledOnce()
  })

  it.each([
    {
      name: 'network',
      failure: new TypeError('offline'),
      message: 'The report could not be sent. Check your connection and try again.',
    },
    {
      name: 'server',
      failure: { code: 'INTERNAL_SERVER_ERROR', status: 500 },
      message: 'The server could not submit the report. Your entries have been kept; try again later.',
    },
  ])('keeps form content after a $name failure', async ({ failure, message }) => {
    const createReport = vi.fn(async () => {
      throw failure
    })
    renderForm(createDependencies({ createReport }))
    await completeValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText(message)).toBeTruthy()
    expect((screen.getByLabelText('Proposed value') as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText('Explanation') as HTMLInputElement).value).toContain('out of date')
    expect(challengeReset).toHaveBeenCalledOnce()
  })

  it('refreshes stale server context, preserves the proposal, and requires an explicit verified resubmission', async () => {
    const resolveContext = vi
      .fn()
      .mockResolvedValueOnce(resolvedContext())
      .mockResolvedValueOnce(
        resolvedContext({
          publicationRevision: '13',
          currentValue: '14',
        }),
      )
    const createReport = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'CHART_REPORT_STALE_PUBLICATION',
        status: 409,
        data: {
          songId: 'dsng_23456789ab',
          chartId: 'dsht_23456789ab',
          activePublicationRevision: '13',
        },
      })
      .mockResolvedValueOnce(createdReport)
    renderForm(createDependencies({ resolveContext, createReport }))
    await completeValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Published chart data changed')).toBeTruthy()
    expect(screen.getByText(/dataset revision 13/)).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
    expect((screen.getByLabelText('Proposed value') as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText('Explanation') as HTMLInputElement).value).toContain('out of date')
    expect((screen.getByLabelText('Source URL 1') as HTMLInputElement).value).toBe('https://example.com/chart-source')
    expect(resolveContext).toHaveBeenCalledTimes(2)
    expect(createReport).toHaveBeenCalledOnce()
    const resubmit = screen.getByRole('button', { name: 'Submit reviewed report' }) as HTMLButtonElement
    expect(resubmit.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'challenge success' }))
    fireEvent.click(resubmit)

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(2))
    expect(createReport.mock.calls[1]?.[0]).toMatchObject({
      publicationRevision: '13',
      currentValue: '14',
      proposedValue: '14',
      turnstileToken: 'fresh-turnstile-token',
    })
    expect(await screen.findByText('Report submitted')).toBeTruthy()
  })

  it('fails closed when the Turnstile site key is unavailable', async () => {
    renderForm(createDependencies({ turnstileSiteKey: null }))
    await waitForResolvedContext()

    expect(screen.getByText('Security verification is temporarily unavailable. Try again later.')).toBeTruthy()
    expect(screen.queryByTestId('chart-report-challenge')).toBeNull()
    expect((screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement).disabled).toBe(true)
  })
})