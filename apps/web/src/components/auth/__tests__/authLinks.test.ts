import { describe, expect, it } from 'vitest'
import { hasErrorCode, readResetLink, readVerifyOutcome } from '../authLinks'

describe('password reset landing', () => {
  it('takes the token Better Auth hands over', () => {
    expect(readResetLink('?token=abc123')).toEqual({ status: 'ready', token: 'abc123' })
  })

  it('has nothing to reset with after an error or without a token', () => {
    expect(readResetLink('?error=INVALID_TOKEN')).toEqual({ status: 'invalid' })
    expect(readResetLink('?token=abc&error=INVALID_TOKEN')).toEqual({ status: 'invalid' })
    expect(readResetLink('')).toEqual({ status: 'invalid' })
  })
})

describe('email verification landing', () => {
  const verified = { isPending: false, emailVerified: true }
  const unverified = { isPending: false, emailVerified: false }
  const signedOut = { isPending: false, emailVerified: undefined }

  it('is a success only when the session shows the address verified', () => {
    expect(readVerifyOutcome('', verified)).toEqual({ status: 'verified' })
    expect(readVerifyOutcome('', { isPending: true, emailVerified: undefined })).toEqual({ status: 'pending' })
  })

  it('reports nothing for a page opened without an outcome (history, a bookmark, a reload)', () => {
    expect(readVerifyOutcome('', signedOut)).toEqual({ status: 'unknown' })
    expect(readVerifyOutcome('', unverified)).toEqual({ status: 'unknown' })
  })

  it('tells an expired link and a missing session from any other failure', () => {
    expect(readVerifyOutcome('?error=TOKEN_EXPIRED', verified)).toEqual({ status: 'error', reason: 'expired' })
    expect(readVerifyOutcome('?error=SESSION_REQUIRED', signedOut)).toEqual({
      status: 'error',
      reason: 'signInRequired',
    })
    expect(readVerifyOutcome('?error=INVALID_TOKEN', unverified)).toEqual({ status: 'error', reason: 'invalid' })
    expect(readVerifyOutcome('?error=USER_NOT_FOUND', unverified)).toEqual({ status: 'error', reason: 'invalid' })
  })
})

describe('hasErrorCode', () => {
  it('matches a Better Auth client error by code', () => {
    expect(hasErrorCode({ code: 'INVALID_TOKEN', message: 'Invalid token' }, 'INVALID_TOKEN')).toBe(true)
    expect(hasErrorCode({ code: 'OTHER' }, 'INVALID_TOKEN')).toBe(false)
    expect(hasErrorCode(null, 'INVALID_TOKEN')).toBe(false)
  })
})