import { AdminCorrelationIdSchema, adminErrors } from '@gekichumai/admin-contract'
import { ORPCError } from '@orpc/client'
import { isCancelledError } from '@tanstack/react-query'

export type AdminErrorKind =
  | 'client-incompatible'
  | 'unauthenticated'
  | 'forbidden'
  | 'recent-auth-required'
  | 'fresh-login-required'
  | 'step-up-failed'
  | 'step-up-rate-limited'
  | 'validation'
  | 'invalid-cursor'
  | 'chart-unavailable'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'server'
  | 'network'
  | 'cancelled'
  | 'unexpected'

export type AdminPresentationError = {
  readonly kind: AdminErrorKind
  readonly requestId: string | null
}

export class AdminNetworkError extends Error {
  override readonly name = 'AdminNetworkError'

  constructor() {
    super('The administrator backend could not be reached')
  }
}

type AdminErrorCode = keyof typeof adminErrors

const ADMIN_ERROR_KIND_BY_CODE = {
  ADMIN_CLIENT_INCOMPATIBLE: 'client-incompatible',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  RECENT_AUTH_REQUIRED: 'recent-auth-required',
  FRESH_LOGIN_REQUIRED: 'fresh-login-required',
  STEP_UP_FAILED: 'step-up-failed',
  STEP_UP_RATE_LIMITED: 'step-up-rate-limited',
  VALIDATION_FAILED: 'validation',
  INVALID_CURSOR: 'invalid-cursor',
  CHART_UNAVAILABLE: 'chart-unavailable',
  NOT_FOUND: 'not-found',
  CONFLICT: 'conflict',
  INTERNAL_SERVER_ERROR: 'server',
} as const satisfies Readonly<Record<AdminErrorCode, AdminErrorKind>>

const isAdminErrorCode = (code: string): code is AdminErrorCode =>
  Object.prototype.hasOwnProperty.call(ADMIN_ERROR_KIND_BY_CODE, code)

const safeRequestId = (data: unknown): string | null => {
  if (data === null || typeof data !== 'object' || !('requestId' in data)) return null
  const result = AdminCorrelationIdSchema.safeParse(data.requestId)
  return result.success ? result.data : null
}

export const isAdminRequestCancellation = (error: unknown): boolean => {
  if (isCancelledError(error)) return true
  return error instanceof Error && error.name === 'AbortError'
}

export const isAdminNetworkError = (error: unknown): boolean => {
  if (isAdminRequestCancellation(error)) return false
  return error instanceof AdminNetworkError
}

export const isAdminServerError = (error: unknown): boolean => {
  if (!(error instanceof ORPCError)) return false
  if (isAdminErrorCode(error.code)) return error.code === 'INTERNAL_SERVER_ERROR'
  return error.status >= 500 && error.status <= 599
}

export const normalizeAdminError = (error: unknown): AdminPresentationError => {
  if (isAdminRequestCancellation(error)) return { kind: 'cancelled', requestId: null }
  if (isAdminNetworkError(error)) return { kind: 'network', requestId: null }

  if (error instanceof ORPCError) {
    const requestId = safeRequestId(error.data)

    // The private contract defines recovery behavior by code. Status and
    // message text are deliberately not used until known codes are exhausted.
    if (isAdminErrorCode(error.code)) {
      return { kind: ADMIN_ERROR_KIND_BY_CODE[error.code], requestId }
    }

    if (error.status === 429) return { kind: 'rate-limited', requestId }
    if (error.status >= 500 && error.status <= 599) return { kind: 'server', requestId }
    return { kind: 'unexpected', requestId }
  }

  return { kind: 'unexpected', requestId: null }
}

export const ADMIN_MAX_READ_RETRIES = 2

export const shouldRetryAdminRead = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= ADMIN_MAX_READ_RETRIES || isAdminRequestCancellation(error)) return false
  return isAdminNetworkError(error) || isAdminServerError(error)
}

export const adminReadRetryDelay = (failureCount: number): number =>
  Math.min(250 * 2 ** Math.min(Math.max(failureCount, 0), 3), 2_000)