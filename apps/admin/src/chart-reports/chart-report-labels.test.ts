import { ADMIN_CHART_REPORT_CATEGORY_KEYS, ADMIN_CHART_REPORT_FIELD_KEYS } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { translate } from '../i18n'
import { chartReportCategoryLabels, chartReportFieldLabels } from './chart-report-labels'

describe('chart-report presentation labels', () => {
  it('projects every private-contract field and category through the local catalog', () => {
    const fields = chartReportFieldLabels(translate)
    const categories = chartReportCategoryLabels(translate)

    expect(Object.keys(fields)).toEqual(ADMIN_CHART_REPORT_FIELD_KEYS)
    expect(Object.keys(categories)).toEqual(ADMIN_CHART_REPORT_CATEGORY_KEYS)
    for (const field of ADMIN_CHART_REPORT_FIELD_KEYS) expect(fields[field]).not.toBe(field)
    for (const category of ADMIN_CHART_REPORT_CATEGORY_KEYS) expect(categories[category]).not.toBe(category)
  })
})