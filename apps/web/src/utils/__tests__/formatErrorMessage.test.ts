import { describe, expect, it } from 'vitest'
import { formatErrorMessage } from '../formatErrorMessage'

describe('formatErrorMessage', () => {
  it('formats nested error-like message objects as text', () => {
    const error = {
      code: 'PASSKEY_AUTHENTICATION_FAILED',
      message: {
        code: 'NotAllowedError',
        message: 'The operation either timed out or was not allowed.',
        toString: () => 'NotAllowedError: The operation either timed out or was not allowed.',
      },
      toString: () => 'PASSKEY_AUTHENTICATION_FAILED',
    }

    expect(formatErrorMessage(error)).toBe('The operation either timed out or was not allowed.')
  })
})