import { describe, expect, it } from 'vitest'
import { decodeLegacyErrorResponse } from '../error-response.ts'

describe('legacy oRPC error response decoding', () => {
  it('preserves typed error details while accepting the v1 status field', () => {
    const error = decodeLegacyErrorResponse({
      defined: true,
      code: 'CONFLICT',
      status: 409,
      message: 'Already exists',
      data: { id: 1 },
    })

    expect(error?.toJSON()).toEqual({
      defined: true,
      code: 'CONFLICT',
      message: 'Already exists',
      data: { id: 1 },
    })
  })

  it.each([
    null,
    'failure',
    { defined: false, code: 'UNAUTHORIZED', message: 'Unauthorized' },
    { defined: false, code: 'UNAUTHORIZED', message: 'Unauthorized', status: '401' },
    { defined: false, code: 'UNAUTHORIZED', message: 'Unauthorized', status: 401, unexpected: true },
    { status: 500 },
  ])('leaves native or malformed responses to the client decoder: %j', (body) => {
    expect(decodeLegacyErrorResponse(body)).toBeUndefined()
  })
})