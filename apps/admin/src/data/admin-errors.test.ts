import { ORPCError } from '@orpc/client'
import { CancelledError } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_MAX_READ_RETRIES,
  AdminNetworkError,
  adminReadRetryDelay,
  isAdminNetworkError,
  isAdminRequestCancellation,
  normalizeAdminError,
  shouldRetryAdminRead,
  type AdminErrorKind,
} from './admin-errors'

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'

const definedError = (code: string, status: number, requestId: unknown = REQUEST_ID) =>
  new ORPCError(code, {
    data: { requestId },
    defined: true,
    message: 'raw backend message must not enter presentation state',
    status,
  })

describe('administrator error normalization', () => {
  it.each<[string, number, AdminErrorKind]>([
    ['ADMIN_CLIENT_INCOMPATIBLE', 409, 'client-incompatible'],
    ['UNAUTHENTICATED', 401, 'unauthenticated'],
    ['FORBIDDEN', 403, 'forbidden'],
    ['RECENT_AUTH_REQUIRED', 401, 'recent-auth-required'],
    ['FRESH_LOGIN_REQUIRED', 401, 'fresh-login-required'],
    ['STEP_UP_FAILED', 401, 'step-up-failed'],
    ['STEP_UP_RATE_LIMITED', 429, 'step-up-rate-limited'],
    ['VALIDATION_FAILED', 400, 'validation'],
    ['NOT_FOUND', 404, 'not-found'],
    ['CONFLICT', 409, 'conflict'],
    ['INTERNAL_SERVER_ERROR', 500, 'server'],
  ])('maps %s by code before considering HTTP status', (code, status, kind) => {
    const normalized = normalizeAdminError(definedError(code, status))

    expect(normalized).toEqual({ kind, requestId: REQUEST_ID })
    expect(normalized).not.toHaveProperty('message')
  })

  it('does not collapse same-status contract errors into one recovery path', () => {
    expect(normalizeAdminError(definedError('ADMIN_CLIENT_INCOMPATIBLE', 409)).kind).toBe('client-incompatible')
    expect(normalizeAdminError(definedError('CONFLICT', 409)).kind).toBe('conflict')
    expect(normalizeAdminError(definedError('UNAUTHENTICATED', 401)).kind).toBe('unauthenticated')
    expect(normalizeAdminError(definedError('RECENT_AUTH_REQUIRED', 401)).kind).toBe('recent-auth-required')
    expect(normalizeAdminError(definedError('FRESH_LOGIN_REQUIRED', 401)).kind).toBe('fresh-login-required')
    expect(normalizeAdminError(definedError('STEP_UP_FAILED', 401)).kind).toBe('step-up-failed')
  })

  it('preserves only schema-valid correlation identifiers', () => {
    expect(normalizeAdminError(definedError('FORBIDDEN', 403, REQUEST_ID)).requestId).toBe(REQUEST_ID)
    expect(normalizeAdminError(definedError('FORBIDDEN', 403, 'credential=do-not-copy')).requestId).toBeNull()
    expect(normalizeAdminError(definedError('FORBIDDEN', 403, 42)).requestId).toBeNull()
    expect(normalizeAdminError(new Error(`secret ${REQUEST_ID}`))).toEqual({
      kind: 'unexpected',
      requestId: null,
    })
  })

  it('uses narrow fallbacks for non-contract rate-limit, server, network, and cancellation errors', () => {
    expect(normalizeAdminError(new ORPCError('TOO_MANY_REQUESTS', { status: 429 }))).toEqual({
      kind: 'rate-limited',
      requestId: null,
    })
    expect(normalizeAdminError(new ORPCError('SERVICE_UNAVAILABLE', { status: 503 }))).toEqual({
      kind: 'server',
      requestId: null,
    })
    expect(normalizeAdminError(new AdminNetworkError())).toEqual({ kind: 'network', requestId: null })
    expect(normalizeAdminError(new DOMException('cancelled', 'AbortError'))).toEqual({
      kind: 'cancelled',
      requestId: null,
    })
    expect(normalizeAdminError(new Error('raw server detail'))).toEqual({ kind: 'unexpected', requestId: null })
  })
})

describe('administrator read retry policy', () => {
  it('allows only bounded network and server retries', () => {
    const network = new AdminNetworkError()
    const server = definedError('INTERNAL_SERVER_ERROR', 500)

    for (let failureCount = 0; failureCount < ADMIN_MAX_READ_RETRIES; failureCount += 1) {
      expect(shouldRetryAdminRead(failureCount, network)).toBe(true)
      expect(shouldRetryAdminRead(failureCount, server)).toBe(true)
    }
    expect(shouldRetryAdminRead(ADMIN_MAX_READ_RETRIES, network)).toBe(false)
    expect(shouldRetryAdminRead(ADMIN_MAX_READ_RETRIES, server)).toBe(false)
  })

  it.each([
    definedError('UNAUTHENTICATED', 401),
    definedError('FORBIDDEN', 403),
    definedError('VALIDATION_FAILED', 400),
    definedError('NOT_FOUND', 404),
    definedError('CONFLICT', 409),
    definedError('STEP_UP_RATE_LIMITED', 429),
    definedError('ADMIN_CLIENT_INCOMPATIBLE', 409),
    new Error('programming error'),
    new TypeError('programming type error'),
  ])('never retries an operational or non-network error', (error) => {
    expect(shouldRetryAdminRead(0, error)).toBe(false)
  })

  it('denies authentication retries by typed code even when an invalid status suggests a server error', () => {
    expect(shouldRetryAdminRead(0, definedError('UNAUTHENTICATED', 503))).toBe(false)
    expect(shouldRetryAdminRead(0, definedError('FORBIDDEN', 503))).toBe(false)
    expect(shouldRetryAdminRead(0, definedError('ADMIN_CLIENT_INCOMPATIBLE', 503))).toBe(false)
  })

  it('never retries cancellation and caps backoff', () => {
    const cancellation = new CancelledError()
    const abort = new DOMException('cancelled', 'AbortError')

    expect(isAdminRequestCancellation(cancellation)).toBe(true)
    expect(isAdminRequestCancellation(abort)).toBe(true)
    expect(isAdminNetworkError(abort)).toBe(false)
    expect(shouldRetryAdminRead(0, cancellation)).toBe(false)
    expect(shouldRetryAdminRead(0, abort)).toBe(false)
    expect([0, 1, 2, 3, 20].map(adminReadRetryDelay)).toEqual([250, 500, 1_000, 2_000, 2_000])
  })
})