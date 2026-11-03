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