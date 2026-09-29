export function formatErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  return extractErrorMessage(error) ?? fallback
}

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error)
  }

  if (error === null || error === undefined) {
    return undefined
  }

  if (error instanceof Error) {
    return error.message !== '' ? error.message : error.name
  }

  if (typeof error !== 'object') {
    return undefined
  }

  const errorLike = {
    message: 'message' in error ? error.message : undefined,
    error: 'error' in error ? error.error : undefined,
    code: 'code' in error ? error.code : undefined,
    toString: typeof error.toString === 'function' ? error.toString.bind(error) : undefined,
  }
  return (
    extractErrorMessage(errorLike.message) ??
    extractErrorMessage(errorLike.error) ??
    extractErrorMessage(errorLike.code) ??
    stringifyErrorLike(errorLike)
  )
}

function stringifyErrorLike(error: { toString?: unknown }) {
  if (typeof error.toString !== 'function' || error.toString === Object.prototype.toString) {
    return undefined
  }

  const message = error.toString()
  return typeof message === 'string' && message !== '[object Object]' ? message : undefined
}