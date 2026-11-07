import type { PlainMessage } from '@/i18n/message'
import { NET_IMPORT_ERROR_MESSAGES, netImportErrorCodeOf } from '@/components/rating/io/import/netImportErrorFeedback'
import { IMPORT_IN_PROGRESS } from '@/models/scores/cloudImports'
import { m } from '@/paraglide/messages'
import type { Locale } from '@/paraglide/runtime'

/**
 * What went wrong with a cloud import, in words: the maimai NET codes have their own messages, a job the server gave
 * up on says so, anything else asks to try again. Never a bare error code.
 */
export function importFailureMessage(code: string | null | undefined, locale: Locale): string {
  const net = netImportErrorCodeOf(code)
  if (net) return NET_IMPORT_ERROR_MESSAGES[net]({}, { locale })
  if (code === 'abandoned') return m.ratingCalculator_cloudSave_import_errors_abandoned({}, { locale })
  if (code === IMPORT_IN_PROGRESS) return m.ratingCalculator_cloudSave_import_errors_alreadyRunning({}, { locale })
  return m.ratingCalculator_cloudSave_import_errors_generic({}, { locale })
}
/** Short reasons for the import history: the job is in the past, so no "try again" */
const HISTORY_FAILURES: Record<string, PlainMessage> = {
  abandoned: m.ratingCalculator_cloudSave_history_failure_abandoned,
  NET_MAINTENANCE: m.ratingCalculator_cloudSave_history_failure_maintenance,
  INVALID_CREDENTIALS: m.ratingCalculator_cloudSave_history_failure_invalidCredentials,
  AIME_CARD_UNAVAILABLE: m.ratingCalculator_cloudSave_history_failure_aimeCardUnavailable,
}

/** Why a past import failed, in a few words for its history row */
export function importHistoryFailure(code: string | null | undefined, locale: Locale): string {
  // A NET job's persisted code (`invalid_credentials`) reads as the stream's (`INVALID_CREDENTIALS`)
  const lookup = netImportErrorCodeOf(code) ?? code
  const message = lookup && Object.hasOwn(HISTORY_FAILURES, lookup) ? HISTORY_FAILURES[lookup]! : null
  return (message ?? m.ratingCalculator_cloudSave_history_failure_generic)({}, { locale })
}