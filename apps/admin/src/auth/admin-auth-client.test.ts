import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_AUTH_BASE_PATH,
  ADMIN_CAPTCHA_HEADER,
  createAdminAuthClient,
  sanitizeAdminAuthFailure,
  validateAdminOauthAuthorizationUrl,
} from './admin-auth-client'

const API_ORIGIN = 'https://api.dxrating.test'
const ADMIN_ORIGIN = 'https://admin.dxrating.test'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })

const requestAt = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`Expected fetch call ${index}`)
  const [input, init] = call as [RequestInfo | URL, RequestInit]
  return {
    body: JSON.parse(String(init.body)) as Readonly<Record<string, unknown>>,
    headers: new Headers(init.headers),
    init,
    url: String(input),
  }
}

const clientWithFetch = (fetchMock: ReturnType<typeof vi.fn>) =>
  createAdminAuthClient({
    backendOrigin: API_ORIGIN,
    fetch: fetchMock as typeof fetch,
    frontendOrigin: ADMIN_ORIGIN,
    mode: 'test',
  })

describe('administrator Better Auth client', () => {
  it('uses the exact auth subroute and sends a one-attempt captcha token only with password sign-in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'must-not-escape' }))
    const client = clientWithFetch(fetchMock)

    await expect(
      client.signInWithPassword({
        captchaToken: 'single-use-turnstile-token',
        email: '  administrator@example.com  ',
        password: 'correct horse battery staple',
      }),
    ).resolves.toEqual({ ok: true, data: null })

    const passwordRequest = requestAt(fetchMock)
    expect(passwordRequest.url).toBe(`${API_ORIGIN}${ADMIN_AUTH_BASE_PATH}/sign-in/email`)
    expect(passwordRequest.init.credentials).toBe('include')
    expect(passwordRequest.headers.get(ADMIN_CAPTCHA_HEADER)).toBe('single-use-turnstile-token')
    expect(passwordRequest.body).toEqual({
      email: 'administrator@example.com',
      password: 'correct horse battery staple',
    })
    expect(passwordRequest.body).not.toHaveProperty('rememberMe')

    await client.signInWithPassword({ email: 'administrator@example.com', password: 'next attempt' })
    expect(requestAt(fetchMock, 1).headers.has(ADMIN_CAPTCHA_HEADER)).toBe(false)
  })

  it('keeps social sign-in existing-account-only with fixed callbacks and no captcha header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        redirect: false,
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=admin-client',
      }),
    )
    const client = clientWithFetch(fetchMock)

    await expect(client.beginSocialSignIn('google')).resolves.toEqual({
      ok: true,
      data: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=admin-client',
      },
    })

    const request = requestAt(fetchMock)
    expect(request.url).toBe(`${API_ORIGIN}${ADMIN_AUTH_BASE_PATH}/sign-in/social`)
    expect(request.init.credentials).toBe('include')
    expect(request.headers.has(ADMIN_CAPTCHA_HEADER)).toBe(false)
    expect(request.body).toEqual({
      callbackURL: `${ADMIN_ORIGIN}/`,
      disableRedirect: true,
      errorCallbackURL: `${ADMIN_ORIGIN}/sign-in?oauth=failed`,
      provider: 'google',
      requestSignUp: false,
    })
  })

  it('applies the same existing-account policy to GitHub sign-in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        redirect: false,
        url: 'https://github.com/login/oauth/authorize?client_id=admin-client',
      }),
    )
    const client = clientWithFetch(fetchMock)

    await expect(client.beginSocialSignIn('github')).resolves.toMatchObject({ ok: true })
    expect(requestAt(fetchMock).body).toMatchObject({
      disableRedirect: true,
      provider: 'github',
      requestSignUp: false,
    })
  })

  it('rejects an authorization URL that is not the selected provider exact HTTPS origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        redirect: false,
        url: 'https://accounts.google.com.attacker.example/oauth',
      }),
    )

    await expect(clientWithFetch(fetchMock).beginSocialSignIn('google')).resolves.toEqual({
      ok: false,
      failure: { kind: 'unexpected', operation: 'social' },
    })

    expect(() => validateAdminOauthAuthorizationUrl('http://github.com/login/oauth', 'github')).toThrow()
    expect(() => validateAdminOauthAuthorizationUrl('https://attacker@example.com/login/oauth', 'github')).toThrow()
    expect(validateAdminOauthAuthorizationUrl('https://github.com/login/oauth/authorize', 'github')).toBe(
      'https://github.com/login/oauth/authorize',
    )
  })

  it('sanitizes server and transport failures instead of exposing backend text', async () => {
    const invalidCredentialsFetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: 'INVALID_EMAIL_OR_PASSWORD',
          message: 'Sensitive backend diagnostics and account details',
        },
        401,
      ),
    )
    const unavailableFetch = vi.fn().mockRejectedValue(new TypeError('internal gateway hostname leaked'))

    const invalidCredentials = await clientWithFetch(invalidCredentialsFetch).signInWithPassword({
      email: 'administrator@example.com',
      password: 'wrong',
    })
    const unavailable = await clientWithFetch(unavailableFetch).getSession()

    expect(invalidCredentials).toEqual({
      ok: false,
      failure: { kind: 'invalid-credentials', operation: 'password' },
    })
    expect(unavailable).toEqual({
      ok: false,
      failure: { kind: 'unavailable', operation: 'session' },
    })
    expect(JSON.stringify([invalidCredentials, unavailable])).not.toContain('Sensitive backend')
    expect(JSON.stringify([invalidCredentials, unavailable])).not.toContain('gateway hostname')
  })

  it('exposes only the minimum session identity and never the raw session token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        session: {
          expiresAt: '2099-01-01T00:00:00.000Z',
          id: 'session-id',
          token: 'secret-session-token',
          userId: 'administrator-id',
        },
        user: {
          email: 'administrator@example.com',
          id: 'administrator-id',
          image: null,
          name: 'Administrator',
          role: 'super_admin',
        },
      }),
    )

    const result = await clientWithFetch(fetchMock).getSession()

    expect(result).toEqual({
      ok: true,
      data: {
        sessionId: 'session-id',
        user: {
          email: 'administrator@example.com',
          id: 'administrator-id',
          image: null,
          name: 'Administrator',
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('secret-session-token')
    expect(JSON.stringify(result)).not.toContain('super_admin')
  })

  it('maps captcha, throttling, cancellation, and expired-session failures to bounded categories', () => {
    const cancelled = new Error('raw cancellation')
    cancelled.name = 'AbortError'

    expect(sanitizeAdminAuthFailure({ code: 'MISSING_RESPONSE' }, 'password').kind).toBe('captcha-required')
    expect(sanitizeAdminAuthFailure({ code: 'VERIFICATION_FAILED' }, 'password').kind).toBe('captcha-rejected')
    expect(sanitizeAdminAuthFailure({ status: 429 }, 'password').kind).toBe('rate-limited')
    expect(sanitizeAdminAuthFailure({ status: 401 }, 'session').kind).toBe('session-expired')
    expect(sanitizeAdminAuthFailure(cancelled, 'social').kind).toBe('cancelled')
  })
})