import { describe, expect, it, vi } from 'vitest'
import { ORPCError } from '@orpc/server'
import { shouldCaptureSentryError } from '../lib/functions/sentry.js'
import {
  createSafeAdminTelemetryError,
  recordAdminAccessDenialTo,
  recordAdminAuthorizationResultTo,
  reportAdminExceptionTo,
  sanitizeAdminAuthorizationResult,
  sanitizeAdminAccessDenialCategory,
  sanitizeAdminCorrelationId,
  sanitizeAdminTelemetryProcedure,
} from './observability.js'

describe('administrator observability redaction', () => {
  it('creates telemetry errors without privileged exception contents', () => {
    const secret = 'private moderation reason and credential'
    const original = new Error(secret)
    const sanitized = createSafeAdminTelemetryError()

    expect(sanitized).not.toBe(original)
    expect(sanitized.message).toBe('Administrator request failed')
    expect(sanitized.stack).not.toContain(secret)
    expect(Object.keys(sanitized)).toEqual([])
  })

  it('reports only a procedure identifier and a new sanitized error', () => {
    const capture = vi.fn()

    reportAdminExceptionTo('bootstrap', '18d7118c-ec70-4603-9176-cffea8a6cd8f', { capture })

    expect(capture).toHaveBeenCalledOnce()
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ message: 'Administrator request failed' })
    expect(capture.mock.calls[0]?.[1]).toEqual({
      tags: {
        'orpc.procedure': 'bootstrap',
        'orpc.surface': 'admin',
        requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
      },
    })
  })

  it('drops unsafe client-supplied correlation identifiers', () => {
    const capture = vi.fn()

    reportAdminExceptionTo('user@example.com', 'credential=do-not-send', { capture })

    expect(capture.mock.calls[0]?.[1]).toEqual({
      tags: {
        'orpc.procedure': 'unknown',
        'orpc.surface': 'admin',
      },
    })
  })

  it('accepts only UUID correlation identifiers', () => {
    expect(sanitizeAdminCorrelationId('18d7118c-ec70-4603-9176-cffea8a6cd8f')).toBe(
      '18d7118c-ec70-4603-9176-cffea8a6cd8f',
    )
    expect(sanitizeAdminCorrelationId('session-token')).toBeUndefined()
    expect(sanitizeAdminCorrelationId(null)).toBeUndefined()
  })
})

describe('administrator authorization outcome telemetry', () => {
  it('records only finite Access denial categories', () => {
    const increment = vi.fn()

    recordAdminAccessDenialTo('WRONG_AUDIENCE', { increment })
    recordAdminAccessDenialTo('user@example.com credential=do-not-send', { increment })

    expect(increment.mock.calls).toEqual([['WRONG_AUDIENCE'], ['UNKNOWN']])
    expect(JSON.stringify(increment.mock.calls)).not.toContain('user@example.com')
    expect(sanitizeAdminAccessDenialCategory('INVALID_SIGNATURE')).toBe('INVALID_SIGNATURE')
    expect(sanitizeAdminAccessDenialCategory('jwt-payload')).toBe('UNKNOWN')
  })

  it('records only finite procedure and result labels', () => {
    const increment = vi.fn()

    recordAdminAuthorizationResultTo('bootstrap', 'FORBIDDEN', { increment })
    recordAdminAuthorizationResultTo('completePrimaryAuthPassword', 'STEP_UP_FAILED', { increment })
    recordAdminAuthorizationResultTo('grantAdministrator', 'CONFLICT', { increment })
    recordAdminAuthorizationResultTo('searchUsers', 'SUCCESS', { increment })
    recordAdminAuthorizationResultTo('banUser', 'RECENT_AUTH_REQUIRED', { increment })
    recordAdminAuthorizationResultTo('user@example.com', 'private moderation reason', { increment })

    expect(increment.mock.calls).toEqual([
      [{ procedure: 'bootstrap', result: 'FORBIDDEN' }],
      [{ procedure: 'completePrimaryAuthPassword', result: 'STEP_UP_FAILED' }],
      [{ procedure: 'grantAdministrator', result: 'CONFLICT' }],
      [{ procedure: 'searchUsers', result: 'SUCCESS' }],
      [{ procedure: 'banUser', result: 'RECENT_AUTH_REQUIRED' }],
      [{ procedure: 'unknown', result: 'UNKNOWN' }],
    ])
    expect(JSON.stringify(increment.mock.calls)).not.toContain('user@example.com')
    expect(JSON.stringify(increment.mock.calls)).not.toContain('private moderation reason')
  })

  it('keeps the sanitizers fail closed for unknown labels', () => {
    expect(sanitizeAdminTelemetryProcedure('bootstrap')).toBe('bootstrap')
    expect(sanitizeAdminTelemetryProcedure('bootstrap.user-id')).toBe('unknown')
    expect(sanitizeAdminAuthorizationResult('SUCCESS')).toBe('SUCCESS')
    expect(sanitizeAdminAuthorizationResult('FORBIDDEN:user-id')).toBe('UNKNOWN')
  })

  it.each([
    ['UNAUTHORIZED', 'UNAUTHENTICATED'],
    ['FORBIDDEN', 'FORBIDDEN'],
    ['UNAUTHORIZED', 'RECENT_AUTH_REQUIRED'],
    ['UNAUTHORIZED', 'FRESH_LOGIN_REQUIRED'],
    ['UNAUTHORIZED', 'STEP_UP_FAILED'],
    ['TOO_MANY_REQUESTS', 'STEP_UP_RATE_LIMITED'],
    ['BAD_REQUEST', 'VALIDATION_FAILED'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['CONFLICT', 'CONFLICT'],
    ['CONFLICT', 'ADMIN_CLIENT_INCOMPATIBLE'],
  ] as const)('keeps expected %s/%s client outcomes out of Sentry', (orpcCode, result) => {
    expect(shouldCaptureSentryError(new ORPCError(orpcCode))).toBe(false)
    expect(sanitizeAdminAuthorizationResult(result)).toBe(result)
  })

  it('still captures unexpected administrator server failures', () => {
    expect(shouldCaptureSentryError(new ORPCError('INTERNAL_SERVER_ERROR'))).toBe(true)
  })
})