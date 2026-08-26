import { describe, expect, it } from 'vitest'
import { createPublicOauthSignInInput } from './oauth-sign-in-policy'

describe('public OAuth account-creation policy', () => {
  it.each([
    ['sign-in', false],
    ['registration', true],
  ] as const)('marks an explicit %s request with requestSignUp=%s', (_flow, isSignUp) => {
    const callbackURL = 'https://dxrating.net/profile'

    expect(createPublicOauthSignInInput({ callbackURL, isSignUp, provider: 'google' })).toEqual({
      callbackURL,
      errorCallbackURL: callbackURL,
      provider: 'google',
      requestSignUp: isSignUp,
    })
  })
})