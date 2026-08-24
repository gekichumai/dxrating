import {
  ADMIN_CHART_REPORT_CATEGORY_KEYS,
  ADMIN_CHART_REPORT_FIELD_KEYS,
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
} from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { validateChartReportListSearch, type ChartReportListFilters } from './chart-report-route-search'
import { ChartReportSearchForm, type ChartReportSearchFormLabels } from './chart-report-search-form'

const fieldLabels = Object.fromEntries(
  ADMIN_CHART_REPORT_FIELD_KEYS.map((field) => [field, `Field: ${field}`]),
) as Record<AdminChartReportFieldKey, string>
const categoryLabels = Object.fromEntries(
  ADMIN_CHART_REPORT_CATEGORY_KEYS.map((category) => [category, `Category: ${category}`]),
) as Record<AdminChartReportCategoryKey, string>

const labels: ChartReportSearchFormLabels = {
  title: 'Filter chart reports',
  description: 'All filters are combined.',
  formLabel: 'Chart report filters',
  state: 'Review state',
  anyState: 'Any state',
  openState: 'Open',
  closedState: 'Closed',
  chartId: 'Stable chart ID',
  chartIdPlaceholder: 'dsht_…',
  fieldKey: 'Reported field',
  anyField: 'Any field',
  fieldLabels,
  category: 'Report category',
  anyCategory: 'Any category',
  categoryLabels,
  reporterUserId: 'Reporter user ID',
  reporterUserIdPlaceholder: 'Exact immutable user ID',
  submittedAtFromInclusive: 'Submitted from (inclusive)',
  submittedAtBeforeExclusive: 'Submitted before (exclusive)',
  localTimeDescription: 'Enter local time; it is stored as an exact UTC instant.',
  publicationRevision: 'Captured publication revision',
  publicationRevisionPlaceholder: 'Exact revision',
  clear: 'Clear filters',
  submit: 'Apply filters',
  validation: {
    state: 'Choose a valid review state.',
    chartId: 'Enter a stable chart ID.',
    fieldKey: 'Choose a supported chart field.',
    category: 'Choose a supported report category.',
    reporterUserId: 'Enter an exact user ID.',
    submittedAtFromInclusive: 'Enter a valid inclusive local time.',
    submittedAtBeforeExclusive: 'Enter a valid exclusive local time.',
    publicationRevision: 'Enter a valid publication revision.',
    dateOrder: 'The inclusive time must be earlier than the exclusive time.',
  },
}

const renderForm = ({
  disabled,
  onClear = vi.fn(),
  onSubmit = vi.fn(),
  search = validateChartReportListSearch({}),
}: {
  readonly disabled?: boolean
  readonly onClear?: () => void
  readonly onSubmit?: Mock<(filters: ChartReportListFilters) => void>
  readonly search?: ReturnType<typeof validateChartReportListSearch>
} = {}) => ({
  onClear,
  onSubmit,
  ...render(
    <MantineProvider>
      <ChartReportSearchForm
        disabled={disabled}
        labels={labels}
        onClear={onClear}
        onSubmit={onSubmit}
        search={search}
      />
    </MantineProvider>,
  ),
})

describe('administrator chart-report search form', () => {
  it('restores every URL filter and submits a cursor-free canonical request', async () => {
    const user = userEvent.setup()
    const from = new Date(2026, 7, 24, 9, 15).toISOString()
    const before = new Date(2026, 7, 25, 18, 45).toISOString()
    const { onSubmit } = renderForm({
      search: validateChartReportListSearch({
        state: 'open',
        chartId: 'dsht_23456789ab',
        fieldKey: 'chart.internal_level',
        category: 'incorrect_value',
        reporterUserId: 'reporter-user',
        submittedAtFromInclusive: from,
        submittedAtBeforeExclusive: before,
        publicationRevision: '81',
        cursor: 'filter_bound_page',
      }),
    })

    expect((screen.getByRole('combobox', { name: labels.state }) as HTMLInputElement).value).toBe(labels.openState)
    expect(
      (
        screen.getByRole('combobox', {
          name: labels.fieldKey,
        }) as HTMLInputElement
      ).value,
    ).toBe(fieldLabels['chart.internal_level'])
    expect(
      (
        screen.getByRole('combobox', {
          name: labels.category,
        }) as HTMLInputElement
      ).value,
    ).toBe(categoryLabels.incorrect_value)
    expect((screen.getByLabelText(labels.submittedAtFromInclusive) as HTMLInputElement).value).toBe('2026-08-24T09:15')
    expect((screen.getByLabelText(labels.submittedAtBeforeExclusive) as HTMLInputElement).value).toBe(
      '2026-08-25T18:45',
    )

    await user.click(screen.getByRole('button', { name: labels.submit }))
    expect(onSubmit).toHaveBeenCalledWith({
      state: 'open',
      chartId: 'dsht_23456789ab',
      fieldKey: 'chart.internal_level',
      category: 'incorrect_value',
      reporterUserId: 'reporter-user',
      submittedAtFromInclusive: from,
      submittedAtBeforeExclusive: before,
      publicationRevision: '81',
    })
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('cursor')
  })

  it('shows identifier, publication, and ordered-bound errors without navigating', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText(labels.chartId), 'chart-123')
    await user.type(screen.getByLabelText(labels.reporterUserId), ' invalid-user ')
    await user.type(screen.getByLabelText(labels.publicationRevision), '0')
    fireEvent.change(screen.getByLabelText(labels.submittedAtFromInclusive), {
      target: { value: '2026-08-25T09:00' },
    })
    fireEvent.change(screen.getByLabelText(labels.submittedAtBeforeExclusive), {
      target: { value: '2026-08-25T08:59' },
    })
    await user.click(screen.getByRole('button', { name: labels.submit }))

    expect(screen.getByText(labels.validation.chartId)).toBeTruthy()
    expect(screen.getByText(labels.validation.reporterUserId)).toBeTruthy()
    expect(screen.getByText(labels.validation.publicationRevision)).toBeTruthy()
    expect(screen.getByText(labels.validation.dateOrder)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears validation while editing and clears both unsaved and cursor-restored state', async () => {
    const user = userEvent.setup()
    const { onClear, onSubmit } = renderForm({
      search: validateChartReportListSearch({ cursor: 'filter_bound_page' }),
    })
    const reporter = screen.getByLabelText(labels.reporterUserId) as HTMLInputElement
    const clear = screen.getByRole('button', {
      name: labels.clear,
    }) as HTMLButtonElement

    expect(clear.disabled).toBe(false)
    await user.type(reporter, ' invalid ')
    await user.click(screen.getByRole('button', { name: labels.submit }))
    expect(screen.getByText(labels.validation.reporterUserId)).toBeTruthy()

    await user.clear(reporter)
    expect(screen.queryByText(labels.validation.reporterUserId)).toBeNull()
    await user.type(reporter, 'unsaved-user')
    await user.click(clear)
    expect(onClear).toHaveBeenCalledOnce()
    expect(reporter.value).toBe('')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('uses canonical field choices and disables every interactive control while navigation is pending', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    const field = screen.getByRole('combobox', { name: labels.fieldKey })
    await user.click(field)
    expect(await screen.findByText(fieldLabels['chart.note_counts.total'])).toBeTruthy()
    first.unmount()

    renderForm({ disabled: true })
    const form = screen.getByRole('form', { name: labels.formLabel })
    for (const control of form.querySelectorAll('input, button')) {
      expect((control as HTMLInputElement | HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.getByLabelText(labels.chartId).closest('.mantine-InputWrapper-root')?.getAttribute('data-size')).toBe(
      'md',
    )
  })
})