import { Sentry } from '../lib/functions/sentry.js'
import { ADMIN_ACCESS_DENIAL_CATEGORIES, type AdminAccessDenialCategory } from './access-verifier.js'

const ADMIN_ERROR_MESSAGE = 'Administrator request failed'
const SAFE_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ADMIN_TELEMETRY_PROCEDURES = [
  'bootstrap',
  'primaryAuthStatus',
  'completePrimaryAuthPassword',
  'initiatePrimaryAuthOauth',
  'listAdministrators',
  'listAdministratorRoleHistory',
  'grantAdministrator',
  'revokeAdministrator',
  'searchUsers',
  'getUserModerationDetail',
  'listUserBanHistory',
  'banUser',
  'unbanUser',
  'getCommentModerationDetail',
  'deleteComment',
  'restoreComment',
  'handler',
] as const
const ADMIN_AUTHORIZATION_RESULTS = [
  'SUCCESS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RECENT_AUTH_REQUIRED',
  'FRESH_LOGIN_REQUIRED',
  'STEP_UP_FAILED',
  'STEP_UP_RATE_LIMITED',
  'ADMIN_CLIENT_INCOMPATIBLE',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_SERVER_ERROR',
  'UNKNOWN',
] as const

export type AdminTelemetryProcedure = (typeof ADMIN_TELEMETRY_PROCEDURES)[number] | 'unknown'
export type AdminAuthorizationResult = (typeof ADMIN_AUTHORIZATION_RESULTS)[number]

const adminTelemetryProcedures = new Set<string>(ADMIN_TELEMETRY_PROCEDURES)
const adminAuthorizationResults = new Set<string>(ADMIN_AUTHORIZATION_RESULTS)
const adminAccessDenialCategories = new Set<string>(ADMIN_ACCESS_DENIAL_CATEGORIES)

export const sanitizeAdminCorrelationId = (requestId: string | null | undefined) =>
  requestId && SAFE_CORRELATION_ID.test(requestId) ? requestId : undefined

export const sanitizeAdminTelemetryProcedure = (procedureName: string): AdminTelemetryProcedure =>
  adminTelemetryProcedures.has(procedureName) ? (procedureName as AdminTelemetryProcedure) : 'unknown'

export const sanitizeAdminAuthorizationResult = (result: string): AdminAuthorizationResult =>
  adminAuthorizationResults.has(result) ? (result as AdminAuthorizationResult) : 'UNKNOWN'

export const sanitizeAdminAccessDenialCategory = (category: string): AdminAccessDenialCategory | 'UNKNOWN' =>
  adminAccessDenialCategories.has(category) ? (category as AdminAccessDenialCategory) : 'UNKNOWN'

export const createSafeAdminTelemetryError = () => new Error(ADMIN_ERROR_MESSAGE)

export type AdminTelemetrySink = {
  capture: (error: Error, context: { tags: Record<string, string> }) => unknown
}

export type AdminAuthorizationTelemetrySink = {
  increment: (labels: { procedure: AdminTelemetryProcedure; result: AdminAuthorizationResult }) => unknown
}

export type AdminAccessDenialTelemetrySink = {
  increment: (category: AdminAccessDenialCategory | 'UNKNOWN') => unknown
}

export const recordAdminAccessDenialTo = (category: string, sink: AdminAccessDenialTelemetrySink) =>
  sink.increment(sanitizeAdminAccessDenialCategory(category))

export const recordAdminAccessDenial = (category: string) =>
  recordAdminAccessDenialTo(category, {
    increment: (safeCategory) =>
      Sentry.metrics.count('admin.access.denied', 1, {
        attributes: { category: safeCategory },
      }),
  })

export const recordAdminAuthorizationResultTo = (
  procedureName: string,
  result: string,
  sink: AdminAuthorizationTelemetrySink,
) =>
  sink.increment({
    procedure: sanitizeAdminTelemetryProcedure(procedureName),
    result: sanitizeAdminAuthorizationResult(result),
  })

export const recordAdminAuthorizationResult = (procedureName: string, result: string) =>
  recordAdminAuthorizationResultTo(procedureName, result, {
    increment: (labels) =>
      Sentry.metrics.count('admin.authorization.result', 1, {
        attributes: labels,
      }),
  })

export const reportAdminExceptionTo = (
  procedureName: string,
  requestId: string | undefined,
  sink: AdminTelemetrySink,
) => {
  // Never forward the original exception: its message, stack, cause, or custom
  // properties may contain moderation reasons, credentials, request input, or
  // raw source contents. This local error preserves a useful capture point and
  // the procedure tag without retaining privileged values.
  const safeRequestId = sanitizeAdminCorrelationId(requestId)
  sink.capture(createSafeAdminTelemetryError(), {
    tags: {
      'orpc.procedure': sanitizeAdminTelemetryProcedure(procedureName),
      'orpc.surface': 'admin',
      ...(safeRequestId ? { requestId: safeRequestId } : {}),
    },
  })
}

export const reportAdminException = (procedureName: string, requestId?: string) =>
  reportAdminExceptionTo(procedureName, requestId, {
    capture: (error, context) => Sentry.captureException(error, context),
  })