import { formatErrorMessage } from '../../../../utils/formatErrorMessage'

export type NetImportErrorCode =
  | 'NET_MAINTENANCE'
  | 'INVALID_CREDENTIALS'
  | 'AIME_CARD_UNAVAILABLE'
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR'
  | 'TOKEN_ERROR'

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