import type { TFunction } from 'i18next'
import { NET_IMPORT_ERROR_I18N, isNetImportErrorCode } from '@/components/rating/io/import/netImportErrorFeedback'

/**
 * What went wrong with a cloud import, in words: the maimai NET codes have their own messages, a job the server gave
 * up on says so, anything else asks to try again. Never a bare error code.
 */
export function importFailureMessage(code: string | null | undefined, t: TFunction): string {
  if (code && isNetImportErrorCode(code)) return t(NET_IMPORT_ERROR_I18N[code])
  if (code === 'abandoned') return t('rating-calculator:cloud-save.import.errors.abandoned')
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
  const key = code && Object.hasOwn(HISTORY_FAILURE_KEYS, code) ? HISTORY_FAILURE_KEYS[code]! : null
  return t(key ?? 'rating-calculator:cloud-save.history.failure.generic')
}