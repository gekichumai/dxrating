import { netErrorTags, Sentry, shouldCaptureSentryError } from './lib/functions/sentry'
import { isExpectedRequestEnd } from './request-runner'

/**
 * The procedure failed only because the client went away. When the Node adapter sees the connection close it aborts
 * the request signal with the socket's error as a string ("Error: aborted"), and oRPC's Effect integration rethrows
 * that reason as the procedure's failure. Navigation and closed tabs do this all the time; it is not a server fault.
 *
 * Only an aborted signal counts, and then only its own reason, an `AbortError` it caused, or our runner's
 * client-closed error. Any other failure of an aborted request is still reported.
 */
export const isClientAbort = (error: unknown, signal: AbortSignal | undefined): boolean => {
  if (!signal?.aborted) return false
  if (error === signal.reason) return true
  return (error instanceof Error && error.name === 'AbortError') || isExpectedRequestEnd(error)
}

/** Reports a failed oRPC procedure to Sentry, unless the client left or the failure is expected. */
export const reportProcedureError = (
  error: unknown,
  { path, signal }: { readonly path: readonly string[]; readonly signal?: AbortSignal | undefined },
) => {
  const procedureName = path.join('.')
  if (isClientAbort(error, signal)) {
    Sentry.addBreadcrumb({ category: 'orpc', level: 'info', message: `${procedureName} aborted by the client` })
    return
  }
  if (!shouldCaptureSentryError(error)) return

  console.error(`[oRPC] ${procedureName} failed:`, error)
  Sentry.captureException(error, {
    tags: { 'orpc.procedure': procedureName, ...netErrorTags(error) },
  })
}