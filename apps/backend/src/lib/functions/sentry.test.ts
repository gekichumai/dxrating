import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { NetImportError } from './client.js'
import {
  isAdminSentryRequest,
  isAdminSentryTransaction,
  scrubAdminSentryEvent,
  SENTRY_DATA_COLLECTION,
  shouldCaptureSentryError,
} from './sentry.js'

describe('Sentry error filtering', () => {
  it.each(['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'] as const)(
    'does not capture expected %s oRPC client errors',
    (code) => {
      expect(shouldCaptureSentryError(new ORPCError(code))).toBe(false)
    },
  )

  it('captures oRPC server errors', () => {
    expect(shouldCaptureSentryError(new ORPCError('INTERNAL_SERVER_ERROR'))).toBe(true)
  })

  it.each(['INVALID_CREDENTIALS', 'NET_MAINTENANCE', 'AIME_CARD_UNAVAILABLE'] as const)(
    'does not capture expected maimai NET account state %s',
    (code) => {
      expect(shouldCaptureSentryError(new NetImportError(code))).toBe(false)
    },
  )

  it('captures unexpected maimai NET failures', () => {
    expect(shouldCaptureSentryError(new NetImportError('UNKNOWN_ERROR'))).toBe(true)
  })

  it('captures unexpected errors', () => {
    expect(shouldCaptureSentryError(new Error('Unexpected failure'))).toBe(true)
  })
})

describe('administrator telemetry privacy', () => {
  it('disables sensitive automatic data collection for events and spans', () => {
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    })
  })

  it('allowlists administrator event fields and keeps safe correlation tags', () => {
    const secret = 'private-reason-and-session-cookie'
    const scrubbed = scrubAdminSentryEvent({
      event_id: 'event-id',
      timestamp: 1,
      level: 'error',
      message: secret,
      transaction: `/api/admin/${secret}`,
      request: { data: secret, cookies: { session: secret }, headers: { authorization: secret } },
      user: { email: secret },
      breadcrumbs: [{ message: secret }],
      contexts: { secret: { value: secret } },
      extra: { secret },
      tags: {
        'orpc.surface': 'admin',
        'orpc.procedure': 'bootstrap',
        requestId: 'safe-request-id',
        secret,
      },
    })

    expect(scrubbed).toEqual({
      event_id: 'event-id',
      timestamp: 1,
      level: 'error',
      message: 'Administrator request failed',
      tags: {
        'orpc.surface': 'admin',
        'orpc.procedure': 'bootstrap',
        requestId: 'safe-request-id',
      },
    })
    expect(JSON.stringify(scrubbed)).not.toContain(secret)
  })

  it('leaves public error events unchanged and drops administrator transactions', () => {
    const publicEvent = { message: 'public failure' }
    expect(scrubAdminSentryEvent(publicEvent)).toBe(publicEvent)
    expect(isAdminSentryTransaction({ transaction: 'GET /api/admin/bootstrap' })).toBe(true)
    expect(isAdminSentryTransaction({ request: { url: 'https://api.example/api/admin/bootstrap' } })).toBe(true)
    expect(isAdminSentryTransaction({ transaction: 'GET /api/v1/comments' })).toBe(false)
  })

  it('rejects administrator traces at sampling time without matching adjacent paths', () => {
    expect(isAdminSentryRequest('GET /api/admin/bootstrap')).toBe(true)
    expect(isAdminSentryRequest(undefined, 'https://api.example/api/admin/bootstrap?secret=value')).toBe(true)
    expect(isAdminSentryRequest('GET /api/administrator')).toBe(false)
    expect(isAdminSentryRequest('GET /api/v1/comments')).toBe(false)
  })
})