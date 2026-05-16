import { describe, expect, it } from 'vitest'
import { resolveCrossSubDomainCookieOptions } from '../auth-cookies.js'

describe('auth cookie options', () => {
  it('keeps cross-subdomain cookies disabled without a configured domain', () => {
    expect(resolveCrossSubDomainCookieOptions({ configuredDomain: undefined })).toBeUndefined()
    expect(resolveCrossSubDomainCookieOptions({ configuredDomain: '' })).toBeUndefined()
    expect(resolveCrossSubDomainCookieOptions({ configuredDomain: '   ' })).toBeUndefined()
  })

  it('enables Better Auth cross-subdomain cookies for the configured parent domain', () => {
    expect(resolveCrossSubDomainCookieOptions({ configuredDomain: 'dxrating.net' })).toEqual({
      enabled: true,
      domain: 'dxrating.net',
    })
  })

  it('derives the parent domain when the auth host is a frontend subdomain', () => {
    expect(
      resolveCrossSubDomainCookieOptions({
        authURL: 'https://miruku.dxrating.net',
        frontendURL: 'https://dxrating.net',
      }),
    ).toEqual({
      enabled: true,
      domain: 'dxrating.net',
    })
  })

  it('does not enable cross-subdomain cookies when hosts are already the same', () => {
    expect(
      resolveCrossSubDomainCookieOptions({
        authURL: 'http://localhost:3000',
        frontendURL: 'http://localhost:5173',
      }),
    ).toBeUndefined()
  })
})