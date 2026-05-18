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

  if (!error) {
    return undefined
  }

  if (error instanceof Error) {
    return error.message || error.name
  }

  if (typeof error !== 'object') {
    return undefined
  }

  const errorLike = error as { code?: unknown; message?: unknown; error?: unknown; toString?: unknown }
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