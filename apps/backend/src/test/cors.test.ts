import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

const PRODUCTION_ADMIN_ORIGIN = 'https://admin.dxrating.net'
const LOCAL_ADMIN_ORIGIN = 'http://localhost:5174'
const PREVIEW_ADMIN_ORIGIN = 'https://admin-pr-306.preview.dxrating.net'
const PREVIEW_PUBLIC_ORIGIN = 'https://web-pr-306.preview.dxrating.net'

const preflight = (path: string, origin?: string, method = 'PATCH') => {
  const headers = new Headers({
    'Access-Control-Request-Method': method,
    'Access-Control-Request-Headers': `Content-Type,${ADMIN_CONTRACT_HEADER}`,
  })
  if (origin !== undefined) headers.set('Origin', origin)

  return app.request(path, { method: 'OPTIONS', headers })
}

const expectPrivateNoStore = (response: Response) => {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
}

describe('administrator CORS', () => {
  it.each([PRODUCTION_ADMIN_ORIGIN, LOCAL_ADMIN_ORIGIN, PREVIEW_ADMIN_ORIGIN])(
    'allows the exact configured origin %s',
    async (origin) => {
      const response = await preflight('/api/admin/bootstrap', origin)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
      expect(response.headers.get('Access-Control-Allow-Methods')?.split(',')).toEqual([
        'GET',
        'POST',
        'PATCH',
        'DELETE',
        'OPTIONS',
      ])
      expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(',')).toEqual([
        'content-type',
        'authorization',
        'sentry-trace',
        'baggage',
        'x-captcha-response',
        ADMIN_CONTRACT_HEADER,
      ])
      expect(
        response.headers
          .get('Vary')
          ?.split(',')
          .map((value) => value.trim()),
      ).toEqual(expect.arrayContaining(['Origin', 'Access-Control-Request-Headers']))
      expectPrivateNoStore(response)
    },
  )

  it.each([
    ['an unrelated origin', 'https://unrelated.example'],
    ['a deceptive suffix host', 'https://admin.dxrating.net.evil.example'],
    ['a protocol downgrade', 'http://admin.dxrating.net'],
    ['an unconfigured preview', 'https://admin-pr-999.preview.dxrating.net'],
    ['an unconfigured local port', 'http://localhost:9999'],
    ['the literal null origin', 'null'],
    ['a missing origin', undefined],
  ])('does not authorize credentials for %s', async (_description, origin) => {
    const response = await preflight('/api/admin/bootstrap', origin)

    expect(response.status).toBe(204)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    expect(response.headers.has('Access-Control-Allow-Methods')).toBe(false)
    expect(
      response.headers
        .get('Vary')
        ?.split(',')
        .map((value) => value.trim()),
    ).toContain('Origin')
    expectPrivateNoStore(response)
  })

  it('reflects an allowed origin on actual responses and omits credential headers for denied origins', async () => {
    const allowed = await app.request('/api/admin/bootstrap', {
      headers: {
        Origin: PRODUCTION_ADMIN_ORIGIN,
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })
    expect(allowed.status).toBe(401)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(PRODUCTION_ADMIN_ORIGIN)
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(
      allowed.headers
        .get('Vary')
        ?.split(',')
        .map((value) => value.trim()),
    ).toContain('Origin')
    expectPrivateNoStore(allowed)

    const denied = await app.request('/api/admin/bootstrap', {
      headers: {
        Origin: 'https://admin.dxrating.net.evil.example',
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })
    expect(denied.status).toBe(401)
    expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(denied.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    expect(
      denied.headers
        .get('Vary')
        ?.split(',')
        .map((value) => value.trim()),
    ).toContain('Origin')
    expectPrivateNoStore(denied)
  })

  it('uses the expanded method set only for the administrator surface', async () => {
    const authPreflight = await preflight('/api/auth/get-session', PRODUCTION_ADMIN_ORIGIN, 'PATCH')

    expect(authPreflight.headers.get('Access-Control-Allow-Origin')).toBe(PRODUCTION_ADMIN_ORIGIN)
    expect(authPreflight.headers.get('Access-Control-Allow-Methods')?.split(',')).toEqual(['POST', 'GET', 'OPTIONS'])
  })

  it('keeps an ordinary public preview outside administrator origin trust', async () => {
    const publicPreflight = await app.request('/api/auth/get-session', {
      method: 'OPTIONS',
      headers: {
        Origin: PREVIEW_PUBLIC_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    })
    const adminPreflight = await preflight('/api/admin/bootstrap', PREVIEW_PUBLIC_ORIGIN)

    expect(publicPreflight.headers.get('Access-Control-Allow-Origin')).toBe(PREVIEW_PUBLIC_ORIGIN)
    expect(publicPreflight.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(adminPreflight.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(adminPreflight.headers.has('Access-Control-Allow-Credentials')).toBe(false)
  })
})

describe('administrator cache isolation', () => {
  it('marks compatibility, authorization, bare-prefix, and preflight responses private and no-store', async () => {
    const responses = await Promise.all([
      app.request('/api/admin/bootstrap'),
      app.request('/api/admin/bootstrap', {
        headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
      }),
      app.request('/api/admin'),
      preflight('/api/admin/bootstrap', PRODUCTION_ADMIN_ORIGIN),
    ])

    expect(responses.map((response) => response.status)).toEqual([409, 401, 409, 204])
    for (const response of responses) expectPrivateNoStore(response)
  })

  it('keeps the compatibility gate ahead of the unsafe-method origin guard', async () => {
    const response = await app.request('/api/admin/not-a-procedure', { method: 'POST' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'ADMIN_CLIENT_INCOMPATIBLE' })
    expectPrivateNoStore(response)
  })
})

describe('public catalog CORS isolation', () => {
  it('keeps wildcard, credential-independent catalog preflight behavior for the admin origin', async () => {
    const response = await app.request('/api/v1/dxdata', {
      method: 'OPTIONS',
      headers: {
        Origin: PRODUCTION_ADMIN_ORIGIN,
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    expect(response.headers.get('Vary') ?? '').not.toContain('Origin')
    expect(response.headers.has('Cache-Control')).toBe(false)
  })
})