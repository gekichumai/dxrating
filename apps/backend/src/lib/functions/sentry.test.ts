import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { NetImportError } from './client.js'
import { shouldCaptureSentryError } from './sentry.js'

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