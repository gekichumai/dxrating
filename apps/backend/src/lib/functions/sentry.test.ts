import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
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

  it('captures unexpected errors', () => {
    expect(shouldCaptureSentryError(new Error('Unexpected failure'))).toBe(true)
  })
})