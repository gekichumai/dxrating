import { ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH } from '@gekichumai/admin-contract'

export type ChartReportCloseNoteValidation =
  | { readonly ok: true; readonly internalNote: string | null }
  | { readonly ok: false; readonly issue: 'too-long' }

export const validateChartReportCloseNote = (value: string): ChartReportCloseNoteValidation => {
  const internalNote = value.trim()
  if (internalNote.length > ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH) {
    return { ok: false, issue: 'too-long' }
  }
  return {
    ok: true,
    internalNote: internalNote.length === 0 ? null : internalNote,
  }
}