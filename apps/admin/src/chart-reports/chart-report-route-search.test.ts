import { describe, expect, it } from 'vitest'
import {
  CHART_REPORT_QUEUE_ORDER,
  chartReportInstantToLocalDateTimeInput,
  chartReportListFilterDraftFromSearch,
  chartReportListFiltersFromSearch,
  chartReportListQueryFromSearch,
  hasChartReportListFilters,
  parseChartReportListFilterDraft,
  validateChartReportListSearch,
} from './chart-report-route-search'

describe('administrator chart-report route search', () => {
  it('normalizes every supported filter and preserves the opaque filter-bound cursor', () => {
    expect(CHART_REPORT_QUEUE_ORDER).toBe('open-first-newest')
    expect(
      validateChartReportListSearch({
        state: 'open',
        chartId: 'dsht_23456789ab',
        fieldKey: 'chart.internal_level',
        category: 'incorrect_value',
        reporterUserId: 'reporter-user',
        submittedAtFromInclusive: '2026-08-01T00:00:00Z',
        submittedAtBeforeExclusive: '2026-09-01T00:00:00Z',
        publicationRevision: 42,
        cursor: 'opaque_page_2',
        ignored: 'not-forwarded',
      }),
    ).toEqual({
      state: 'open',
      chartId: 'dsht_23456789ab',
      fieldKey: 'chart.internal_level',
      category: 'incorrect_value',
      reporterUserId: 'reporter-user',
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: '42',
      cursor: 'opaque_page_2',
    })
  })

  it('drops malformed URL fields independently', () => {
    expect(
      validateChartReportListSearch({
        state: 'assigned',
        chartId: 'chart-1',
        fieldKey: 'chart.secret',
        category: 'spam',
        reporterUserId: ' reporter-user ',
        submittedAtFromInclusive: 'not-a-date',
        submittedAtBeforeExclusive: '2026-09-01T00:00:00Z',
        publicationRevision: '0',
        cursor: 'bad.cursor',
      }),
    ).toEqual({ submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z' })
  })

  it('drops both otherwise-valid date bounds when the pair is inverted or equal', () => {
    expect(
      validateChartReportListSearch({
        state: 'closed',
        submittedAtFromInclusive: '2026-09-01T00:00:00.000Z',
        submittedAtBeforeExclusive: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ state: 'closed' })

    expect(
      validateChartReportListSearch({
        submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
        submittedAtBeforeExclusive: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({})
  })

  it('separates cursor-free filter changes from the exact list request', () => {
    const search = validateChartReportListSearch({
      state: 'closed',
      chartId: 'dsht_23456789ab',
      publicationRevision: '123',
      cursor: 'filter_bound_page',
    })

    expect(chartReportListFiltersFromSearch(search)).toEqual({
      state: 'closed',
      chartId: 'dsht_23456789ab',
      publicationRevision: '123',
    })
    expect(chartReportListQueryFromSearch(search)).toEqual(search)
    expect(hasChartReportListFilters(search)).toBe(true)
    expect(hasChartReportListFilters(validateChartReportListSearch({ cursor: 'page_2' }))).toBe(false)
  })

  it('round-trips canonical UTC instants through local filter inputs', () => {
    const from = new Date(2026, 7, 24, 9, 15).toISOString()
    const before = new Date(2026, 7, 25, 18, 45).toISOString()
    const search = validateChartReportListSearch({
      state: 'open',
      chartId: 'dsht_23456789ab',
      fieldKey: 'chart.level',
      category: 'outdated_value',
      reporterUserId: 'reporter-1',
      submittedAtFromInclusive: from,
      submittedAtBeforeExclusive: before,
      publicationRevision: '52',
    })
    const draft = chartReportListFilterDraftFromSearch(search)

    expect(draft).toEqual({
      state: 'open',
      chartId: 'dsht_23456789ab',
      fieldKey: 'chart.level',
      category: 'outdated_value',
      reporterUserId: 'reporter-1',
      submittedAtFromInclusive: '2026-08-24T09:15',
      submittedAtBeforeExclusive: '2026-08-25T18:45',
      publicationRevision: '52',
    })
    expect(chartReportInstantToLocalDateTimeInput(undefined)).toBe('')
    expect(parseChartReportListFilterDraft(draft)).toEqual({
      success: true,
      value: {
        state: 'open',
        chartId: 'dsht_23456789ab',
        fieldKey: 'chart.level',
        category: 'outdated_value',
        reporterUserId: 'reporter-1',
        submittedAtFromInclusive: from,
        submittedAtBeforeExclusive: before,
        publicationRevision: '52',
      },
    })
  })

  it('reports exact field errors without returning a partial filter update', () => {
    expect(
      parseChartReportListFilterDraft({
        state: 'open',
        chartId: 'not-a-chart',
        fieldKey: 'chart.level',
        category: 'other',
        reporterUserId: ' reporter ',
        submittedAtFromInclusive: '2026-02-30T12:00',
        submittedAtBeforeExclusive: '2026-03-01T12:00',
        publicationRevision: '0',
      }),
    ).toEqual({
      success: false,
      errors: {
        chartId: 'invalid',
        reporterUserId: 'invalid',
        publicationRevision: 'invalid',
        submittedAtFromInclusive: 'invalid',
      },
    })

    expect(
      parseChartReportListFilterDraft({
        state: '',
        chartId: '',
        fieldKey: '',
        category: '',
        reporterUserId: '',
        submittedAtFromInclusive: '2026-08-25T09:00',
        submittedAtBeforeExclusive: '2026-08-25T09:00',
        publicationRevision: '',
      }),
    ).toEqual({
      success: false,
      errors: { submittedAtBeforeExclusive: 'order' },
    })
  })
})