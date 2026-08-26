import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildPublicChartUrl, ChartReportDetail, type ChartReportDetailLabels } from './chart-report-detail'

type ChartReportDetailOutput = AdminContractOutputs['getChartReportDetail']

const labels: ChartReportDetailLabels = {
  accountStatus: 'Account status',
  actions: {
    openPublicChart: 'Open public chart',
    openReporter: 'Review reporter account',
  },
  capturedChart: 'Captured chart',
  capturedContext: 'Captured submission context',
  capturedContextDescription: 'Immutable chart identity and publication at submission.',
  capturedPublication: 'Captured publication',
  catalogRunId: 'Catalog run ID',
  category: 'Issue category',
  categoryLabel: (category) => `Category: ${category}`,
  chartId: 'Stable chart ID',
  chartLabel: 'Chart',
  channel: 'Publication channel',
  closedAt: 'Closed at',
  closedBy: 'Closed by administrator',
  closedState: 'Closed',
  closureEvent: 'Report closed',
  closureNote: 'Internal closure note',
  currentContext: 'Current chart context',
  currentContextDescription: 'Compared with the active publication.',
  currentPublication: 'Current publication',
  currentValue: 'Active current value',
  dateTime: { local: 'Local', utc: 'UTC' },
  displayName: 'Display name',
  emailVerification: 'Email verification',
  emailNotVerified: 'Email not verified',
  emailVerified: 'Email verified',
  evidence: {
    cancel: 'Stay in admin',
    copied: 'Evidence URL copied.',
    copy: 'Copy URL',
    copyUnavailable: 'Clipboard unavailable.',
    description: 'Reporter links are untrusted.',
    domain: 'Canonical domain',
    invalid: 'Unsupported evidence URL',
    leave: 'Open isolated external page',
    none: 'No source URLs were submitted.',
    open: 'Review before opening',
    url: 'Exact submitted URL',
    warningDescription: 'Review before leaving admin.',
    warningTitle: 'Leave admin to inspect evidence?',
  },
  explanation: 'Reporter explanation',
  field: 'Affected field',
  fieldLabel: (field) => `Field: ${field}`,
  fingerprint: 'Publication fingerprint',
  history: 'Report history',
  immutableNotice: 'Submitted evidence is immutable.',
  internalNoteAbsent: 'No internal closure note was recorded.',
  openState: 'Open',
  publicChartUnavailable: 'No current public route mapping.',
  reportId: 'Report ID',
  reporter: 'Reporting account',
  reporterRole: 'Effective role',
  reporterRoles: {
    admin: 'Administrator',
    superAdmin: 'Super administrator',
    user: 'User',
  },
  reporterStatuses: {
    active: 'Active',
    banExpires: 'Ban expires',
    permanentlyBanned: 'Permanently banned',
    temporarilyBanned: 'Temporarily banned',
  },
  retiredContext: 'Retired from the current publication',
  retiredContextDescription: 'The stable chart is absent from the active publication.',
  revision: 'Dataset revision',
  songId: 'Stable song ID',
  songLabel: 'Song',
  sourceUrls: 'Submitted source URLs',
  submission: 'Immutable submission',
  submissionEvent: 'Report submitted',
  submittedAt: 'Submitted at',
  submittedCurrentValue: 'Submitted current value',
  submittedProposedValue: 'Submitted proposed value',
  timelineDescription: 'Submission appears first, followed by closure.',
  title: 'Report review detail',
  userId: 'Stable user ID',
  values: {
    absent: 'Unavailable in this context',
    emptyString: 'Empty string',
    falseValue: 'False',
    nullValue: 'Null',
    trueValue: 'True',
  },
}

const publication = (revision: string) => ({
  channel: 'production-v1' as const,
  catalogRunId: `catalog-run-${revision}`,
  revision,
  fingerprintSha256: revision.padStart(64, 'a'),
})

const chart = {
  songId: 'dsng_23456789ab',
  chartId: 'dsht_23456789ab',
  songLabel: 'Captured song label',
  chartLabel: 'DX Master',
}

const openDetail = (overrides: Partial<ChartReportDetailOutput> = {}): ChartReportDetailOutput => ({
  reporter: {
    userId: 'reporter-user',
    displayName: 'Concerned Player',
    emailVerified: false,
    effectiveRole: 'user',
    accountStatus: { status: 'active' },
  },
  report: {
    id: '00000000-0000-4000-8000-000000000327',
    state: 'open',
    closure: null,
    fieldKey: 'chart.level',
    category: 'incorrect_value',
    submittedCurrentValue: false,
    submittedProposedValue: 0,
    explanation: 'The displayed level should be checked against the linked source.',
    sourceUrls: ['https://source.example/evidence'],
    createdAt: '2026-08-24T12:00:00.000Z',
    capturedContext: { chart, publication: publication('7') },
  },
  currentContext: {
    availability: 'current',
    chart: { ...chart, songLabel: 'Current song label' },
    currentValue: '',
    publication: publication('8'),
  },
  publicChartReference: {
    legacySongId: 'legacy/song',
    sheetType: 'dx',
    sheetDifficulty: 'master remix',
  },
  ...overrides,
})

const renderDetail = (detail: ChartReportDetailOutput) =>
  render(
    <MantineProvider>
      <ChartReportDetail detail={detail} labels={labels} locale="en" />
    </MantineProvider>,
  )

describe('chart-report review detail', () => {
  it('renders immutable submission, reporter, captured context, and independent current context without value collapse', () => {
    const { container } = renderDetail(openDetail())

    expect(screen.getByText(labels.immutableNotice)).toBeTruthy()
    expect(screen.getByText('Field: chart.level')).toBeTruthy()
    expect(screen.getByText('Category: incorrect_value')).toBeTruthy()
    expect(screen.getByText('chart.level')).toBeTruthy()
    expect(screen.getByText('incorrect_value')).toBeTruthy()
    expect(screen.getByText('Concerned Player')).toBeTruthy()
    expect(screen.getByText('Captured song label')).toBeTruthy()
    expect(screen.getByText('Current song label')).toBeTruthy()
    expect(container.querySelector('[data-value-kind="boolean"]')?.textContent).toContain('false')
    expect(container.querySelector('[data-value-kind="number"]')?.textContent).toContain('0')
    expect(container.querySelector('[data-value-kind="string"]')?.textContent).toContain(labels.values.emptyString)
    expect(screen.getByText('source.example')).toBeTruthy()
    expect(screen.getByRole('link', { name: labels.actions.openReporter }).getAttribute('href')).toBe(
      '/users/reporter-user',
    )
  })

  it('builds the trusted public chart link only from the typed legacy route tuple', () => {
    renderDetail(openDetail())

    const link = screen.getByRole('link', {
      name: labels.actions.openPublicChart,
    })
    expect(link.getAttribute('href')).toBe('https://dxrating.net/songs/legacy%2Fsong/dx/master%20remix')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(
      buildPublicChartUrl(
        { legacySongId: '歌 1', sheetType: 'utage', sheetDifficulty: '【協】' },
        'https://preview.example',
      ),
    ).toBe('https://preview.example/songs/%E6%AD%8C%201/utage/%E3%80%90%E5%8D%94%E3%80%91')
  })

  it('treats a retired chart and missing route mapping as valid explicit states', () => {
    renderDetail(
      openDetail({
        currentContext: {
          availability: 'retired',
          songId: chart.songId,
          chartId: chart.chartId,
          publication: publication('9'),
        },
        publicChartReference: null,
      }),
    )

    expect(screen.getByText(labels.retiredContext)).toBeTruthy()
    expect(screen.getByText(labels.values.absent)).toBeTruthy()
    expect(screen.getByText(labels.publicChartUnavailable)).toBeTruthy()
    expect(screen.queryByRole('link', { name: labels.actions.openPublicChart })).toBeNull()
  })

  it('renders the immutable closure event and distinguishes a null internal note', () => {
    const base = openDetail()
    renderDetail({
      ...base,
      report: {
        ...base.report,
        state: 'closed',
        closure: {
          actorUserId: 'closing-admin',
          closedAt: '2026-08-24T13:00:00.000Z',
          internalNote: null,
        },
      },
    })

    expect(screen.getByText(labels.closedState)).toBeTruthy()
    expect(screen.getByText(labels.closureEvent)).toBeTruthy()
    expect(screen.getByText('closing-admin')).toBeTruthy()
    expect(screen.getByText(labels.internalNoteAbsent)).toBeTruthy()
  })
})