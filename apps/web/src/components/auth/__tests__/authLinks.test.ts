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
  it('is a success without a query', () => {
    expect(readVerifyOutcome('')).toEqual({ status: 'verified' })
  })

  it('tells an expired link from any other failure', () => {
    expect(readVerifyOutcome('?error=TOKEN_EXPIRED')).toEqual({ status: 'error', reason: 'expired' })
    expect(readVerifyOutcome('?error=INVALID_TOKEN')).toEqual({ status: 'error', reason: 'invalid' })
    expect(readVerifyOutcome('?error=USER_NOT_FOUND')).toEqual({ status: 'error', reason: 'invalid' })
  })
})

describe('hasErrorCode', () => {
  it('matches a Better Auth client error by code', () => {
    expect(hasErrorCode({ code: 'INVALID_TOKEN', message: 'Invalid token' }, 'INVALID_TOKEN')).toBe(true)
    expect(hasErrorCode({ code: 'OTHER' }, 'INVALID_TOKEN')).toBe(false)
    expect(hasErrorCode(null, 'INVALID_TOKEN')).toBe(false)
  })
})