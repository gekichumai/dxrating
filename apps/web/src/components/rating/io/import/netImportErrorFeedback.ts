import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

export type NetImportErrorCode =
  | 'NET_MAINTENANCE'
  | 'INVALID_CREDENTIALS'
  | 'AIME_CARD_UNAVAILABLE'
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR'
  | 'TOKEN_ERROR'

/** The message of each maimai NET error code */
export const NET_IMPORT_ERROR_MESSAGES: Record<NetImportErrorCode, PlainMessage> = {
  NET_MAINTENANCE: m.ratingCalculator_io_import_netRecords_errors_maintenance,
  INVALID_CREDENTIALS: m.ratingCalculator_io_import_netRecords_errors_invalidCredentials,
  AIME_CARD_UNAVAILABLE: m.ratingCalculator_io_import_netRecords_errors_aimeCardUnavailable,
  UNKNOWN_ERROR: m.ratingCalculator_io_import_netRecords_errors_unknown,
  INTERNAL_ERROR: m.ratingCalculator_io_import_netRecords_errors_internal,
  TOKEN_ERROR: m.ratingCalculator_io_import_netRecords_errors_token,
}

export function isNetImportErrorCode(code: string): code is NetImportErrorCode {
  return Object.hasOwn(NET_IMPORT_ERROR_MESSAGES, code)
}

/**
 * The persisted error codes of a cloud save's NET import job (lowercase, as a replayed or polled job carries them)
 * and the stream's codes they stand for
 */
const NET_JOB_ERROR_CODES: Record<string, NetImportErrorCode> = {
  invalid_credentials: 'INVALID_CREDENTIALS',
  net_maintenance: 'NET_MAINTENANCE',
  aime_card_unavailable: 'AIME_CARD_UNAVAILABLE',
  token_error: 'TOKEN_ERROR',
}

/**
 * The NET error code of a failure, whether it came from the stream (`INVALID_CREDENTIALS`) or from the job a replay or
 * a poll returned (`invalid_credentials`); `null` for any other code
 */
export function netImportErrorCodeOf(code: string | null | undefined): NetImportErrorCode | null {
  if (!code) return null
  if (isNetImportErrorCode(code)) return code
  return Object.hasOwn(NET_JOB_ERROR_CODES, code) ? NET_JOB_ERROR_CODES[code]! : null
}

export class NetImportError extends Error {
  code: NetImportErrorCode

  constructor(code: NetImportErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export const unexpectedErrorSubtitle = (error: unknown) => {
  if (error instanceof NetImportError) {
    if (!['UNKNOWN_ERROR', 'INTERNAL_ERROR'].includes(error.code) || error.message === error.code) {
      return undefined
    }
  }

  const detail = formatErrorMessage(error).trim()
  return detail.length > 0 ? detail : undefined
}