import { describe, expect, it, vi } from 'vitest'
import { revokeOAuthGrants } from '../lib/oauth-revocation.js'

describe('OAuth grant revocation', () => {
  it('revokes Apple using the refresh token', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }))

    const issues = await revokeOAuthGrants(
      [{ providerId: 'apple', accessToken: 'access', refreshToken: 'refresh' }],
      {
        apple: {
          clientId: 'apple-client',
          clientSecret: () => 'apple-secret',
        },
      },
      { fetch },
    )

    expect(issues).toEqual([])
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://appleid.apple.com/auth/revoke')
    expect(init?.method).toBe('POST')
    expect(init?.body?.toString()).toBe(
      'client_id=apple-client&client_secret=apple-secret&token=refresh&token_type_hint=refresh_token',
    )
  })

  it('treats an already-invalid Google token as revoked', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 400 }))

    const issues = await revokeOAuthGrants(
      [{ providerId: 'google', accessToken: 'access', refreshToken: null }],
      {},
      { fetch },
    )

    expect(issues).toEqual([])
    expect(fetch.mock.calls[0]![0]).toBe('https://oauth2.googleapis.com/revoke')
  })

  it('revokes a GitHub application token with application credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }))

    const issues = await revokeOAuthGrants(
      [{ providerId: 'github', accessToken: 'access', refreshToken: null }],
      { github: { clientId: 'github-client', clientSecret: 'github-secret' } },
      { fetch },
    )

    expect(issues).toEqual([])
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.github.com/applications/github-client/token')
    expect(init?.method).toBe('DELETE')
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('github-client:github-secret').toString('base64')}`,
    })
    expect(init?.body).toBe(JSON.stringify({ access_token: 'access' }))
  })

  it('reports failures without exposing token values', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 503 }))

    const issues = await revokeOAuthGrants(
      [{ providerId: 'google', accessToken: 'secret-token', refreshToken: null }],
      {},
      { fetch },
    )

    expect(issues).toEqual([
      {
        providerId: 'google',
        reason: 'request-failed',
        error: 'Unexpected HTTP status 503',
      },
    ])
    expect(JSON.stringify(issues)).not.toContain('secret-token')
  })
})