import { HTTPException } from 'hono/http-exception'
import type { ErrorHandler } from 'hono'
import { z } from 'zod'
import { isAdminAccessProtectedPath } from './admin/access-boundary.js'
import { createAdminStandardErrorResponse } from './admin/handler.js'
import { sanitizeAdminCorrelationId } from './admin/observability.js'
import { shouldCaptureSentryError } from './lib/functions/sentry.js'
import type { AppEnvironment } from './request-context.js'

type RequestErrorHandlerDependencies = {
  readonly captureException: (error: unknown, requestId: string | undefined) => unknown
  readonly reportAdminException: (procedureName: string, requestId: string | undefined) => unknown
}

const getRequestId = (context: Parameters<ErrorHandler<AppEnvironment>>[1]): string | undefined => {
  const carriedRequestId = context.get('requestId')
  if (typeof carriedRequestId === 'string') return carriedRequestId

  const logContext = context.get('log')?.getContext()
  if (logContext === null || typeof logContext !== 'object') return undefined

  const requestId = Reflect.get(logContext, 'requestId')
  return typeof requestId === 'string' ? requestId : undefined
}

const createPrivateAdminFailureResponse = (requestId: string | undefined): Response => {
  const response = createAdminStandardErrorResponse('INTERNAL_SERVER_ERROR', requestId)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('CDN-Cache-Control', 'no-store')
  response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  if (requestId) response.headers.set('X-DXRating-Request-ID', requestId)
  return response
}

export const createRequestErrorHandler =
  ({ captureException, reportAdminException }: RequestErrorHandlerDependencies): ErrorHandler<AppEnvironment> =>
  (error, context) => {
    const log = context.get('log')
    const requestId = getRequestId(context)

    if (isAdminAccessProtectedPath(context.req.path)) {
      const safeRequestId = sanitizeAdminCorrelationId(requestId)
      try {
        // Never pass the original administrator error to telemetry. Its
        // message, stack, or cause can contain target IDs, moderation reasons,
        // credentials, or deleted content.
        reportAdminException('handler', safeRequestId)
      } catch {
        // Telemetry must not change the private fail-closed response.
      }
      return createPrivateAdminFailureResponse(safeRequestId)
    }

    if (error instanceof z.ZodError) {
      return context.json({ error: 'Validation error', details: error.issues, requestId }, 400)
    }

    if (shouldCaptureSentryError(error)) {
      log?.error(error)
      captureException(error, requestId)
    }

    if (error instanceof HTTPException) {
      return error.getResponse()
    }

    return context.json({ error: 'Internal server error', requestId }, 500)
  }