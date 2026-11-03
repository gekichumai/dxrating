import { formatErrorMessage } from '../../../../utils/formatErrorMessage'

export type NetImportErrorCode =
  | 'NET_MAINTENANCE'
  | 'INVALID_CREDENTIALS'
  | 'AIME_CARD_UNAVAILABLE'
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR'
  | 'TOKEN_ERROR'

/** The message of each maimai NET error code */
export const NET_IMPORT_ERROR_I18N: Record<NetImportErrorCode, string> = {
  NET_MAINTENANCE: 'rating-calculator:io.import.net-records.errors.maintenance',
  INVALID_CREDENTIALS: 'rating-calculator:io.import.net-records.errors.invalid-credentials',
  AIME_CARD_UNAVAILABLE: 'rating-calculator:io.import.net-records.errors.aime-card-unavailable',
  UNKNOWN_ERROR: 'rating-calculator:io.import.net-records.errors.unknown',
  INTERNAL_ERROR: 'rating-calculator:io.import.net-records.errors.internal',
  TOKEN_ERROR: 'rating-calculator:io.import.net-records.errors.token',
}

export function isNetImportErrorCode(code: string): code is NetImportErrorCode {
  return Object.hasOwn(NET_IMPORT_ERROR_I18N, code)
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