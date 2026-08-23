import { describe, expect, it } from 'vitest'
import {
  buildAuthSecurityOptions,
  expireLegacyDomainAuthCookies,
  findAuthReturnUrlUserInfoField,
  hasUrlUserInfo,
} from '../auth-security.js'

describe('auth cookie options', () => {
  it('builds secure, HTTP-only, host-only production cookie defaults', () => {
    const options = buildAuthSecurityOptions({
      production: true,
      trustedOrigins: ['https://dxrating.net', 'https://admin.dxrating.net'],
    })

    expect(options).toEqual({
      trustedOrigins: ['https://dxrating.net', 'https://admin.dxrating.net'],
      advanced: {
        useSecureCookies: true,
        disableCSRFCheck: false,
        disableOriginCheck: false,
        defaultCookieAttributes: {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        },
      },
    })
    expect(options.advanced).not.toHaveProperty('crossSubDomainCookies')
    expect(options.advanced.defaultCookieAttributes).not.toHaveProperty('domain')
  })

  it('keeps local HTTP cookies host-only without weakening CSRF checks', () => {
    const options = buildAuthSecurityOptions({
      production: false,
      trustedOrigins: ['http://localhost:5173', 'http://localhost:5174'],
    })

    expect(options.advanced).toMatchObject({
      useSecureCookies: false,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      defaultCookieAttributes: { secure: false, httpOnly: true, sameSite: 'lax', path: '/' },
    })
    expect(options.advanced.defaultCookieAttributes).not.toHaveProperty('domain')
  })

  it('expires legacy parent-domain cookies only when a session cookie changes', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', '__Secure-dxrating.session_token=signed-value; Path=/; HttpOnly; Secure; SameSite=Lax')
    const original = new Response(JSON.stringify({ ok: true }), { headers })
    const migrated = expireLegacyDomainAuthCookies(original, 'dxrating.net')
    const setCookies = migrated.headers.getSetCookie()

    expect(setCookies[0]).toBe('__Secure-dxrating.session_token=signed-value; Path=/; HttpOnly; Secure; SameSite=Lax')
    expect(setCookies[0]).not.toContain('Domain=')
    expect(setCookies).toContainEqual(
      expect.stringContaining('__Secure-dxrating.session_token=; Path=/; Domain=dxrating.net; Max-Age=0;'),
    )

    const unchanged = new Response(null, { headers: { 'Set-Cookie': 'unrelated=value; Path=/' } })
    expect(expireLegacyDomainAuthCookies(unchanged, 'dxrating.net')).toBe(unchanged)
  })
})

describe('authentication return URLs', () => {
  it.each([
    'https://user@admin.dxrating.net/path',
    'https://user:password@admin.dxrating.net/path',
    'dxrating://user@example/path',
  ])('detects URL user information in %s', (value) => {
    expect(hasUrlUserInfo(value)).toBe(true)
  })

  it.each(['/admin', 'https://admin.dxrating.net/path', 'not-a-url'])(
    'leaves non-user-info URL %s to Better Auth origin validation',
    (value) => {
      expect(hasUrlUserInfo(value)).toBe(false)
    },
  )

  it.each(['callbackURL', 'redirectTo', 'errorCallbackURL', 'newUserCallbackURL'] as const)(
    'checks the %s field in both request bodies and queries',
    (field) => {
      const unsafe = { [field]: 'https://user@admin.dxrating.net/after-auth' }
      expect(findAuthReturnUrlUserInfoField(unsafe)).toBe(field)
      expect(findAuthReturnUrlUserInfoField({}, unsafe)).toBe(field)
    },
  )
})