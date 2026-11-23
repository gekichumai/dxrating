import { ORPCError } from '@orpc/server'
import { Cause } from 'effect'
import { describe, expect, it } from 'vitest'
import { DatabaseError } from '../../db/errors'
import { ClientClosedRequestError, RequestRunnerClosedError } from '../../request-runner'
import { NetImportError } from './client'
import { classifyFailure } from './sentry'

describe('Sentry error filtering', () => {
  it.each(['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'] as const)(
    'does not capture expected %s oRPC client errors',
    (code) => {
      expect(classifyFailure(new ORPCError(code)).report).toBe(false)
    },
  )

  it('captures oRPC server errors', () => {
    expect(classifyFailure(new ORPCError('INTERNAL_SERVER_ERROR')).report).toBe(true)
  })

  it.each(['INVALID_CREDENTIALS', 'NET_MAINTENANCE', 'AIME_CARD_UNAVAILABLE'] as const)(
    'does not capture expected maimai NET account state %s',
    (code) => {
      expect(classifyFailure(new NetImportError(code)).report).toBe(false)
    },
  )

  it('captures unexpected maimai NET failures', () => {
    expect(classifyFailure(new NetImportError('UNKNOWN_ERROR')).report).toBe(true)
  })

  it('captures unexpected errors', () => {
    expect(classifyFailure(new Error('Unexpected failure')).report).toBe(true)
  })

  it.each([
    ['a client that left', new ClientClosedRequestError()],
    ['shutdown', new RequestRunnerClosedError()],
    ['maimai NET maintenance', new NetImportError('NET_MAINTENANCE')],
  ])('does not capture a failure caused by %s, however it is wrapped', (_cause, expected) => {
    const wrapped = new ORPCError('INTERNAL_SERVER_ERROR', {
      cause: new DatabaseError({ operation: 'Read', cause: Cause.fail(expected) }),
    })
    expect(classifyFailure(wrapped).report).toBe(false)
  })
})