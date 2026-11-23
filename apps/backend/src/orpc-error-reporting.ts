import { reportFailure } from './lib/functions/sentry'

/** Reports a failed oRPC procedure to Sentry, unless the client left or the failure is expected. */
export const reportProcedureError = (
  error: unknown,
  { path, signal }: { readonly path: readonly string[]; readonly signal?: AbortSignal | undefined },
) => {
  const procedureName = path.join('.')
  if (reportFailure(error, { signal, tags: { 'orpc.procedure': procedureName } })) {
    console.error(`[oRPC] ${procedureName} failed:`, error)
  }
}