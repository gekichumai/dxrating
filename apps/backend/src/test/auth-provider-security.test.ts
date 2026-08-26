import { describe, expect, it } from 'vitest'
import { requireExistingOauthAccount } from '../auth-security.js'

describe('OAuth account creation policy', () => {
  it('disables implicit sign-up without discarding provider configuration', () => {
    expect(
      requireExistingOauthAccount({
        clientId: 'provider-client-id',
        clientSecret: 'provider-client-secret',
        enabled: true,
      }),
    ).toEqual({
      clientId: 'provider-client-id',
      clientSecret: 'provider-client-secret',
      disableImplicitSignUp: true,
      enabled: true,
    })
  })
})