import {
  ADMIN_CHART_REPORT_CATEGORY_KEYS,
  ADMIN_CHART_REPORT_FIELD_KEYS,
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChartReportQueueTable, type ChartReportQueueTableLabels } from './chart-report-queue-table'

const fieldLabels = Object.fromEntries(
  ADMIN_CHART_REPORT_FIELD_KEYS.map((field) => [field, `Field: ${field}`]),
) as Record<AdminChartReportFieldKey, string>
const categoryLabels = Object.fromEntries(
  ADMIN_CHART_REPORT_CATEGORY_KEYS.map((category) => [category, `Category: ${category}`]),
) as Record<AdminChartReportCategoryKey, string>

const labels: ChartReportQueueTableLabels = {
  caption: 'Chart issue reports',
  tableRegion: 'Scrollable chart issue report results',
  loading: 'Loading chart issue reports',
  emptyTitle: 'No reports found',
  emptyDescription: 'Change the filters and try again.',
  fixedOrder: 'Fixed order: open reports first, then newest within each state.',
  columns: {
    report: 'Report',
    chart: 'Captured chart',
    proposedChange: 'Reported change',
    reporter: 'Reporter',
    publication: 'Captured publication',
    submittedAt: 'Submitted',
    state: 'State',
    action: 'Action',
  },
  openState: 'Open',
  closedState: 'Closed',
  reportId: 'Report ID',
  songId: 'Song ID',
  chartId: 'Chart ID',
  currentValue: 'Submitted current value',
  proposedValue: 'Proposed value',
  previewTruncated: 'Value preview truncated',
  explanationTruncated: 'Explanation preview truncated',
  publicationRevision: 'Revision',
  catalogRunId: 'Catalog run ID',
  reporterUserId: 'User ID',
  verifiedEmail: 'Email verified',
  unverifiedEmail: 'Email not verified',
  accountActive: 'Active account',
  accountTemporarilyBanned: 'Temporarily banned',
  accountPermanentlyBanned: 'Permanently banned',
  fieldLabels,
  categoryLabels,
  openReporter: 'Open reporter moderation',
  openReport: 'Review report',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const publication = {
  channel: 'production-v1' as const,
  catalogRunId: '81',
  revision: '144',
  fingerprintSha256: 'a'.repeat(64),
}

const row = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  state: 'open' as const,
  chart: {
    songId: 'dsng_23456789ab',
    chartId: 'dsht_23456789ab',
    songLabel: 'World’s End Loneliness',
    chartLabel: 'DX · MASTER',
  },
  fieldKey: 'chart.internal_level' as const,
  category: 'incorrect_value' as const,
  currentValuePreview: { text: '14.7', truncated: false },
  proposedValuePreview: { text: '14.8', truncated: true },
  explanationPreview: 'The value differs from the cited official listing.',
  explanationPreviewTruncated: true,
  createdAt: '2026-08-24T10:00:00.000Z',
  capturedPublication: publication,
  reporter: {
    userId: 'reporter-user',
    displayName: 'Chart Reporter',
    emailVerified: false,
    effectiveRole: 'user' as const,
    accountStatus: { status: 'active' as const },
  },
}

const rows = [
  row,
  {
    ...row,
    id: '223e4567-e89b-42d3-a456-426614174000',
    reporter: {
      ...row.reporter,
      emailVerified: true,
      accountStatus: {
        status: 'temporarily_banned' as const,
        expiresAt: '2026-09-01T00:00:00.000Z',
      },
    },
  },
  {
    ...row,
    id: '323e4567-e89b-42d3-a456-426614174000',
    state: 'closed' as const,
    explanationPreview: 'A distinct closed report.',
    explanationPreviewTruncated: false,
    reporter: {
      ...row.reporter,
      accountStatus: { status: 'permanently_banned' as const },
    },
  },
] satisfies AdminContractOutputs['listChartReports']['items']

const renderTable = ({
  loading = false,
  tableRows = rows,
}: {
  readonly loading?: boolean
  readonly tableRows?: AdminContractOutputs['listChartReports']['items']
} = {}) => ({
  ...render(
    <MantineProvider>
      <ChartReportQueueTable labels={labels} loading={loading} locale="en-US" rows={tableRows} />
    </MantineProvider>,
  ),
})

describe('administrator chart-report queue table', () => {
  it('preserves server order and independent identical reports without client grouping or deduplication', () => {
    renderTable()

    expect(screen.getByText(labels.fixedOrder)).toBeTruthy()
    const table = screen.getByRole('table', { name: labels.caption })
    const renderedRows = within(table).getAllByRole('row').slice(1)
    expect(renderedRows).toHaveLength(3)
    expect(renderedRows.map((renderedRow) => within(renderedRow).getByText(/^[123]23e4567-/).textContent)).toEqual(
      rows.map(({ id }) => id),
    )
    expect(screen.getAllByText(row.explanationPreview)).toHaveLength(2)
    expect(screen.getAllByText(labels.openState)).toHaveLength(2)
    expect(screen.getByText(labels.closedState)).toBeTruthy()
    expect(within(table).queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /bulk|merge|duplicate/i })).toBeNull()
  })

  it('renders bounded previews, stable context, reporter status, publication, and timestamps', () => {
    renderTable()

    expect(screen.getAllByText(fieldLabels['chart.internal_level'])).toHaveLength(3)
    expect(screen.getAllByText(categoryLabels.incorrect_value)).toHaveLength(3)
    expect(screen.getAllByText('14.7')).toHaveLength(3)
    expect(screen.getAllByText('14.8')).toHaveLength(3)
    expect(screen.getAllByText(labels.previewTruncated)).toHaveLength(3)
    expect(screen.getAllByText(labels.explanationTruncated)).toHaveLength(2)
    expect(screen.getAllByText(labels.accountActive)).toHaveLength(1)
    expect(screen.getByText(labels.accountTemporarilyBanned)).toBeTruthy()
    expect(screen.getByText(labels.accountPermanentlyBanned)).toBeTruthy()
    expect(screen.getAllByText(publication.revision)).toHaveLength(3)
    expect(screen.getAllByText(publication.catalogRunId)).toHaveLength(3)
    expect(document.querySelectorAll('time')).toHaveLength(6)
  })

  it('uses encoded stable internal links and a durable detail URL for the row action', () => {
    const encodedRows: AdminContractOutputs['listChartReports']['items'] = [
      {
        ...row,
        reporter: { ...row.reporter, userId: 'reporter/encoded id' },
      },
    ]
    renderTable({ tableRows: encodedRows })

    expect(screen.getByRole('link', { name: `${labels.openReporter}: Chart Reporter` }).getAttribute('href')).toBe(
      '/users/reporter%2Fencoded%20id',
    )
    expect(screen.queryByRole('link', { name: /World’s End Loneliness/ })).toBeNull()

    expect(screen.queryByRole('button', { name: labels.openReport })).toBeNull()
    expect(screen.getByRole('link', { name: labels.openReport }).getAttribute('href')).toBe(`/chart-reports/${row.id}`)
  })

  it('provides explicit loading and empty states without fabricated rows or actions', () => {
    const loading = renderTable({ loading: true, tableRows: [] })
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    loading.unmount()

    renderTable({ tableRows: [] })
    expect(screen.getByText(labels.emptyTitle)).toBeTruthy()
    expect(screen.getByText(labels.emptyDescription)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps native table semantics inside a named, keyboard-focusable horizontal region', () => {
    renderTable()

    const region = screen.getByRole('region', { name: labels.tableRegion })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(within(region).getByRole('table', { name: labels.caption })).toBeTruthy()
    expect(
      within(region)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      labels.columns.report,
      labels.columns.chart,
      labels.columns.proposedChange,
      labels.columns.reporter,
      labels.columns.publication,
      labels.columns.submittedAt,
      labels.columns.state,
      labels.columns.action,
    ])
  })
})