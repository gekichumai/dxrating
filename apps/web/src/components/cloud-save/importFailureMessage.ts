import type { TFunction } from 'i18next'
import { NET_IMPORT_ERROR_I18N, netImportErrorCodeOf } from '@/components/rating/io/import/netImportErrorFeedback'
import { IMPORT_IN_PROGRESS } from '@/models/scores/cloudImports'

/**
 * What went wrong with a cloud import, in words: the maimai NET codes have their own messages, a job the server gave
 * up on says so, anything else asks to try again. Never a bare error code.
 */
export function importFailureMessage(code: string | null | undefined, t: TFunction): string {
  const net = netImportErrorCodeOf(code)
  if (net) return t(NET_IMPORT_ERROR_I18N[net])
  if (code === 'abandoned') return t('rating-calculator:cloud-save.import.errors.abandoned')
  if (code === IMPORT_IN_PROGRESS) return t('rating-calculator:cloud-save.import.errors.already-running')
  return t('rating-calculator:cloud-save.import.errors.generic')
}
/** Short reasons for the import history: the job is in the past, so no "try again" */
const HISTORY_FAILURE_KEYS: Record<string, string> = {
  abandoned: 'rating-calculator:cloud-save.history.failure.abandoned',
  NET_MAINTENANCE: 'rating-calculator:cloud-save.history.failure.maintenance',
  INVALID_CREDENTIALS: 'rating-calculator:cloud-save.history.failure.invalid-credentials',
  AIME_CARD_UNAVAILABLE: 'rating-calculator:cloud-save.history.failure.aime-card-unavailable',
}

/** Why a past import failed, in a few words for its history row */
export function importHistoryFailure(code: string | null | undefined, t: TFunction): string {
  // A NET job's persisted code (`invalid_credentials`) reads as the stream's (`INVALID_CREDENTIALS`)
  const lookup = netImportErrorCodeOf(code) ?? code
  const key = lookup && Object.hasOwn(HISTORY_FAILURE_KEYS, lookup) ? HISTORY_FAILURE_KEYS[lookup]! : null
  return t(key ?? 'rating-calculator:cloud-save.history.failure.generic')
}