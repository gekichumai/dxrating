import { ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { validateChartReportCloseNote } from './chart-report-close-form-model'

describe('chart-report close form model', () => {
  it.each(['', ' ', '\n\t'])('normalizes an optional blank note to null', (value) => {
    expect(validateChartReportCloseNote(value)).toEqual({
      ok: true,
      internalNote: null,
    })
  })

  it('trims a bounded private note without rewriting its interior', () => {
    expect(validateChartReportCloseNote('  reviewed\nagainst source  ')).toEqual({
      ok: true,
      internalNote: 'reviewed\nagainst source',
    })
  })

  it('accepts the exact contract boundary and rejects one character beyond it', () => {
    expect(validateChartReportCloseNote('x'.repeat(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH))).toEqual({
      ok: true,
      internalNote: 'x'.repeat(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH),
    })
    expect(validateChartReportCloseNote('x'.repeat(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      issue: 'too-long',
    })
  })
})