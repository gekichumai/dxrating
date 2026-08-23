import { Sentry } from '../lib/functions/sentry.js'

const ADMIN_ERROR_MESSAGE = 'Administrator request failed'
const SAFE_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const createSafeAdminTelemetryError = () => new Error(ADMIN_ERROR_MESSAGE)

export type AdminTelemetrySink = {
  capture: (error: Error, context: { tags: Record<string, string> }) => unknown
}

export const reportAdminExceptionTo = (
  procedureName: string,
  requestId: string | undefined,
  sink: AdminTelemetrySink,
) => {
  // Never forward the original exception: its message, stack, cause, or custom
  // properties may contain moderation reasons, credentials, request input, or
  // raw source contents. This local error preserves a useful capture point and
  // the procedure tag without retaining privileged values.
  const safeRequestId = requestId && SAFE_CORRELATION_ID.test(requestId) ? requestId : undefined
  sink.capture(createSafeAdminTelemetryError(), {
    tags: {
      'orpc.procedure': procedureName,
      'orpc.surface': 'admin',
      ...(safeRequestId ? { requestId: safeRequestId } : {}),
    },
  })
}

export const reportAdminException = (procedureName: string, requestId?: string) =>
  reportAdminExceptionTo(procedureName, requestId, {
    capture: (error, context) => Sentry.captureException(error, context),
  })