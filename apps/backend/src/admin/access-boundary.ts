import type { MiddlewareHandler } from 'hono'
import { createAdminStandardErrorResponse } from './handler.js'
import { recordAdminAccessDenial, sanitizeAdminCorrelationId } from './observability.js'
import { consumeAdminAccessProof, type AdminAccessDenialCategory, type AdminAccessVerifier } from './access-verifier.js'

const ADMIN_API_PREFIX = '/api/admin'

export const isAdminAccessProtectedPath = (path: string): boolean =>
  path === ADMIN_API_PREFIX || path.startsWith(`${ADMIN_API_PREFIX}/`)

type AdminAccessBoundaryOptions = {
  readonly recordDenial?: (category: AdminAccessDenialCategory) => unknown
  readonly createRequestId?: () => string
}

export const createAdminAccessBoundaryMiddleware = (
  verifier: AdminAccessVerifier,
  options: AdminAccessBoundaryOptions = {},
): MiddlewareHandler => {
  const recordDenial = options.recordDenial ?? recordAdminAccessDenial
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID())

  return async (context, next) => {
    const proof = consumeAdminAccessProof(context.req.raw.headers)
    if (!isAdminAccessProtectedPath(context.req.path) || context.req.method === 'OPTIONS') return next()

    const verification = await verifier.verify({ ...proof, requestUrl: context.req.url })
    if (verification.ok) return next()

    try {
      recordDenial(verification.category)
    } catch {
      // Telemetry must never change a fail-closed authorization response.
    }
    const requestId = sanitizeAdminCorrelationId(context.req.header('x-request-id')) ?? createRequestId()
    const response = createAdminStandardErrorResponse('FORBIDDEN', requestId)
    response.headers.set('X-DXRating-Request-ID', requestId)
    return response
  }
}