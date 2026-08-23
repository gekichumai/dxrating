import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type FetchImplementation, type JWK } from 'jose'
import { Hono } from 'hono'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminAccessBoundaryMiddleware } from './access-boundary.js'
import {
  ADMIN_ACCESS_ASSERTION_HEADER,
  ADMIN_ACCESS_TEST_BYPASS_HEADER,
  consumeAdminAccessProof,
  createAdminAccessVerifier,
} from './access-verifier.js'

const ISSUER = 'https://example-team.cloudflareaccess.com'
const AUDIENCE = 'a'.repeat(64)
const OTHER_AUDIENCE = 'b'.repeat(64)
const TEST_BYPASS_SECRET = 'test-only-bypass-secret-that-is-long-enough'

type TestSigningKey = {
  kid: string
  privateKey: CryptoKey
  jwk: JWK
}

let trustedKey: TestSigningKey
let rotatedKey: TestSigningKey
let attackerKey: TestSigningKey

const createSigningKey = async (kid: string): Promise<TestSigningKey> => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  return {
    kid,
    privateKey,
    jwk: {
      ...(await exportJWK(publicKey)),
      alg: 'RS256',
      kid,
      use: 'sig',
    },
  }
}

beforeAll(async () => {
  ;[trustedKey, rotatedKey, attackerKey] = await Promise.all([
    createSigningKey('trusted-key'),
    createSigningKey('rotated-key'),
    createSigningKey('attacker-key'),
  ])
})

afterEach(() => {
  vi.useRealTimers()
})

const signAccessToken = async ({
  key = trustedKey,
  payload = {},
  protectedHeader = {},
  omit = [],
}: {
  key?: TestSigningKey
  payload?: Record<string, unknown>
  protectedHeader?: Record<string, unknown>
  omit?: string[]
} = {}) => {
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    aud: [AUDIENCE],
    exp: now + 300,
    iat: now - 5,
    iss: ISSUER,
    nbf: now - 5,
    sub: 'cloudflare-human-subject',
    type: 'app',
    ...payload,
  }
  for (const claim of omit) delete claims[claim]

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...protectedHeader })
    .sign(key.privateKey)
}

const createJwksFetch = (getKeys: () => JWK[]): FetchImplementation =>
  vi.fn(async () => Response.json({ keys: getKeys() }))

const createCloudflareVerifier = (fetchImplementation: FetchImplementation, options: Record<string, number> = {}) =>
  createAdminAccessVerifier(
    { mode: 'cloudflare', issuer: ISSUER, audiences: [AUDIENCE] },
    { fetch: fetchImplementation, ...options },
  )

describe('Cloudflare Access assertion verification', () => {
  it('accepts only a signed application token for the exact issuer and audience', async () => {
    const jwksFetch = createJwksFetch(() => [trustedKey.jwk])
    const verifier = createCloudflareVerifier(jwksFetch)
    const assertion = await signAccessToken({
      payload: { email: 'access-identity@example.com', groups: ['administrators'], role: 'super_admin' },
    })

    await expect(verifier.verify({ assertion })).resolves.toEqual({ ok: true })
    expect(jwksFetch).toHaveBeenCalledOnce()
    expect(jwksFetch).toHaveBeenCalledWith(
      `${ISSUER}/cdn-cgi/access/certs`,
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    )
  })

  it.each([
    ['a missing assertion', undefined, 'MISSING'],
    ['a malformed compact token', 'not-a-jwt', 'MALFORMED'],
    ['an oversized token', 'x'.repeat(16 * 1024 + 1), 'OVERSIZED'],
  ] as const)('rejects %s without exposing it', async (_description, assertion, category) => {
    const verifier = createCloudflareVerifier(createJwksFetch(() => [trustedKey.jwk]))
    const result = await verifier.verify({ assertion })

    expect(result).toEqual({ ok: false, category })
    expect(JSON.stringify(result)).not.toContain(assertion?.slice(0, 64) ?? 'cf-access-jwt-assertion')
  })

  it('distinguishes safe time, issuer, and audience denial categories', async () => {
    const verifier = createCloudflareVerifier(createJwksFetch(() => [trustedKey.jwk]))
    const now = Math.floor(Date.now() / 1000)
    const cases = [
      [await signAccessToken({ payload: { exp: now - 60 } }), 'EXPIRED'],
      [await signAccessToken({ payload: { iat: now + 120, nbf: now + 120 } }), 'NOT_YET_VALID'],
      [
        await signAccessToken({ payload: { iss: 'https://example-team.cloudflareaccess.com.evil.example' } }),
        'WRONG_ISSUER',
      ],
      [await signAccessToken({ payload: { aud: [`${AUDIENCE}-lookalike`] } }), 'WRONG_AUDIENCE'],
    ] as const

    for (const [assertion, category] of cases) {
      await expect(verifier.verify({ assertion })).resolves.toEqual({ ok: false, category })
    }
  })

  it.each([
    ['the app token type', { payload: { type: 'org' } }],
    ['a nonempty human subject', { payload: { sub: '' } }],
    ['the issued-at claim', { omit: ['iat'] }],
    ['the not-before claim', { omit: ['nbf'] }],
    ['the expiration claim', { omit: ['exp'] }],
    ['a bounded key identifier', { protectedHeader: { kid: '' } }],
  ])('requires %s', async (_description, tokenOptions) => {
    const verifier = createCloudflareVerifier(createJwksFetch(() => [trustedKey.jwk]))
    const assertion = await signAccessToken(tokenOptions)

    const result = await verifier.verify({ assertion })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(['INVALID_SHAPE', 'UNKNOWN_KEY']).toContain(result.category)
  })

  it('never follows a token-controlled JWK URL or accepts an attacker signature', async () => {
    const jwksFetch = createJwksFetch(() => [trustedKey.jwk])
    const verifier = createCloudflareVerifier(jwksFetch, { cooldownMs: 0 })
    const assertion = await signAccessToken({
      key: attackerKey,
      protectedHeader: { jku: 'https://attacker.example/jwks.json' },
    })

    await expect(verifier.verify({ assertion })).resolves.toEqual({ ok: false, category: 'UNKNOWN_KEY' })
    expect(jwksFetch).toHaveBeenCalledTimes(2)
    for (const [url] of vi.mocked(jwksFetch).mock.calls) {
      expect(url).toBe(`${ISSUER}/cdn-cgi/access/certs`)
    }
  })

  it('rejects a wrong signature even when the key identifier exists', async () => {
    const verifier = createCloudflareVerifier(createJwksFetch(() => [trustedKey.jwk]))
    const assertion = await signAccessToken({
      key: { ...attackerKey, kid: trustedKey.kid },
    })

    await expect(verifier.verify({ assertion })).resolves.toEqual({
      ok: false,
      category: 'INVALID_SIGNATURE',
    })
  })

  it('refreshes once for a safely rotated signing key after cooldown', async () => {
    let keys = [trustedKey.jwk]
    const jwksFetch = createJwksFetch(() => keys)
    const verifier = createCloudflareVerifier(jwksFetch, { cooldownMs: 0 })

    await expect(verifier.verify({ assertion: await signAccessToken() })).resolves.toEqual({ ok: true })
    keys = [trustedKey.jwk, rotatedKey.jwk]
    await expect(verifier.verify({ assertion: await signAccessToken({ key: rotatedKey }) })).resolves.toEqual({
      ok: true,
    })
    expect(jwksFetch).toHaveBeenCalledTimes(2)
  })

  it('uses cached keys only inside the bounded freshness window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T00:00:00.000Z'))
    let keysAvailable = true
    const jwksFetch: FetchImplementation = vi.fn(async () => {
      if (!keysAvailable) throw new Error('sentinel fetch failure')
      return Response.json({ keys: [trustedKey.jwk] })
    })
    const verifier = createCloudflareVerifier(jwksFetch, { cacheMaxAgeMs: 60_000 })
    const assertion = await signAccessToken()

    await expect(verifier.verify({ assertion })).resolves.toEqual({ ok: true })
    keysAvailable = false
    vi.advanceTimersByTime(59_999)
    await expect(verifier.verify({ assertion })).resolves.toEqual({ ok: true })
    vi.advanceTimersByTime(2)
    await expect(verifier.verify({ assertion })).resolves.toEqual({
      ok: false,
      category: 'JWKS_UNAVAILABLE',
    })
    expect(jwksFetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a network failure', async () => Promise.reject(new Error('network sentinel'))],
    ['a non-success response', async () => new Response('', { status: 503 })],
    ['an invalid JWKS response', async () => new Response('not-json', { status: 200 })],
  ])('fails closed for %s', async (_description, responseFactory) => {
    const verifier = createCloudflareVerifier(responseFactory as FetchImplementation)
    const result = await verifier.verify({ assertion: await signAccessToken() })

    expect(result).toEqual({ ok: false, category: 'JWKS_UNAVAILABLE' })
    expect(JSON.stringify(result)).not.toContain('sentinel')
  })
})

describe('local/test Access substitute', () => {
  it('accepts only the exact bypass proof and rejects an assertion in bypass mode', async () => {
    const verifier = createAdminAccessVerifier({ mode: 'test_bypass', bypassSecret: TEST_BYPASS_SECRET })

    await expect(
      verifier.verify({ testBypass: TEST_BYPASS_SECRET, requestUrl: 'http://127.0.0.1:3001/api/admin/check' }),
    ).resolves.toEqual({ ok: true })
    await expect(verifier.verify({ requestUrl: 'http://localhost:3001/api/admin/check' })).resolves.toEqual({
      ok: false,
      category: 'MISSING',
    })
    await expect(
      verifier.verify({
        testBypass: `${TEST_BYPASS_SECRET}-wrong`,
        requestUrl: 'http://localhost:3001/api/admin/check',
      }),
    ).resolves.toEqual({ ok: false, category: 'TEST_BYPASS_REJECTED' })
    await expect(
      verifier.verify({
        assertion: 'spoofed',
        testBypass: TEST_BYPASS_SECRET,
        requestUrl: 'http://localhost:3001/api/admin/check',
      }),
    ).resolves.toEqual({ ok: false, category: 'TEST_BYPASS_REJECTED' })
  })

  it('rejects the exact bypass proof for a non-loopback request URL', async () => {
    const verifier = createAdminAccessVerifier({ mode: 'test_bypass', bypassSecret: TEST_BYPASS_SECRET })

    for (const requestUrl of [
      undefined,
      'https://admin-pr-307.preview.dxrating.net/api/admin/check',
      'https://localhost.evil.example/api/admin/check',
    ]) {
      await expect(verifier.verify({ testBypass: TEST_BYPASS_SECRET, requestUrl })).resolves.toEqual({
        ok: false,
        category: 'TEST_BYPASS_REJECTED',
      })
    }
  })

  it('consumes both bearer headers before downstream logging can inspect them', () => {
    const headers = new Headers({
      [ADMIN_ACCESS_ASSERTION_HEADER]: 'assertion-sentinel',
      [ADMIN_ACCESS_TEST_BYPASS_HEADER]: 'bypass-sentinel',
      'x-request-id': 'safe-request-id',
    })

    expect(consumeAdminAccessProof(headers)).toEqual({
      assertion: 'assertion-sentinel',
      testBypass: 'bypass-sentinel',
    })
    expect(headers.has(ADMIN_ACCESS_ASSERTION_HEADER)).toBe(false)
    expect(headers.has(ADMIN_ACCESS_TEST_BYPASS_HEADER)).toBe(false)
    expect(headers.get('x-request-id')).toBe('safe-request-id')
  })
})

describe('administrator Access HTTP boundary', () => {
  it('fails with one generic response before dispatch for invalid signed-proof cases', async () => {
    const verifier = createCloudflareVerifier(createJwksFetch(() => [trustedKey.jwk]))
    const denied: string[] = []
    const testApp = new Hono()
    testApp.use(
      '*',
      createAdminAccessBoundaryMiddleware(verifier, {
        createRequestId: () => '18d7118c-ec70-4603-9176-cffea8a6cd8f',
        recordDenial: (category) => denied.push(category),
      }),
    )
    testApp.get('/api/admin/check', (context) => context.json({ reached: true }))

    const valid = await testApp.request('/api/admin/check', {
      headers: { [ADMIN_ACCESS_ASSERTION_HEADER]: await signAccessToken() },
    })
    expect(valid.status).toBe(200)

    const now = Math.floor(Date.now() / 1000)
    const cases = [
      [undefined, 'MISSING'],
      ['malformed-token-sentinel', 'MALFORMED'],
      [await signAccessToken({ payload: { exp: now - 60 } }), 'EXPIRED'],
      [await signAccessToken({ payload: { nbf: now + 120 } }), 'NOT_YET_VALID'],
      [
        await signAccessToken({ payload: { iss: 'https://lookalike.cloudflareaccess.com.evil.example' } }),
        'WRONG_ISSUER',
      ],
      [await signAccessToken({ payload: { aud: [OTHER_AUDIENCE] } }), 'WRONG_AUDIENCE'],
    ] as const

    for (const [assertion, expectedCategory] of cases) {
      const headers = new Headers()
      if (assertion) headers.set(ADMIN_ACCESS_ASSERTION_HEADER, assertion)
      const response = await testApp.request('/api/admin/check', { headers })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({
        defined: true,
        code: 'FORBIDDEN',
        status: 403,
        message: 'Administrator access is not permitted',
        data: { requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' },
      })
      expect(JSON.stringify(body)).not.toContain(assertion?.slice(0, 32) ?? 'missing')
      expect(denied.at(-1)).toBe(expectedCategory)
    }
  })

  it('strips proof headers on public and preflight requests without treating them as application access', async () => {
    const verifier = createAdminAccessVerifier({ mode: 'test_bypass', bypassSecret: TEST_BYPASS_SECRET })
    const testApp = new Hono()
    testApp.use('*', createAdminAccessBoundaryMiddleware(verifier))
    testApp.get('/health', (context) =>
      context.json({ assertion: context.req.header(ADMIN_ACCESS_ASSERTION_HEADER) ?? null }),
    )
    testApp.options('/api/admin/check', (context) =>
      context.json({ assertion: context.req.header(ADMIN_ACCESS_ASSERTION_HEADER) ?? null }),
    )

    const publicResponse = await testApp.request('/health', {
      headers: { [ADMIN_ACCESS_ASSERTION_HEADER]: 'public-sentinel' },
    })
    expect(publicResponse.status).toBe(200)
    await expect(publicResponse.json()).resolves.toEqual({ assertion: null })

    const preflightResponse = await testApp.request('/api/admin/check', {
      method: 'OPTIONS',
      headers: { [ADMIN_ACCESS_ASSERTION_HEADER]: 'preflight-sentinel' },
    })
    expect(preflightResponse.status).toBe(200)
    await expect(preflightResponse.json()).resolves.toEqual({ assertion: null })
  })

  it('never accepts the local substitute at a protected-preview URL', async () => {
    const verifier = createAdminAccessVerifier({ mode: 'test_bypass', bypassSecret: TEST_BYPASS_SECRET })
    const testApp = new Hono()
    testApp.use('*', createAdminAccessBoundaryMiddleware(verifier))
    testApp.get('/api/admin/check', (context) => context.json({ reached: true }))

    const response = await testApp.request('https://admin-pr-307.preview.dxrating.net/api/admin/check', {
      headers: { [ADMIN_ACCESS_TEST_BYPASS_HEADER]: TEST_BYPASS_SECRET },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ defined: true, code: 'FORBIDDEN' })
  })

  it('does not let a telemetry failure change the fail-closed response', async () => {
    const verifier = createAdminAccessVerifier({ mode: 'test_bypass', bypassSecret: TEST_BYPASS_SECRET })
    const testApp = new Hono()
    testApp.use(
      '*',
      createAdminAccessBoundaryMiddleware(verifier, {
        recordDenial: () => {
          throw new Error('telemetry sentinel')
        },
      }),
    )
    testApp.get('/api/admin/check', (context) => context.json({ reached: true }))

    const response = await testApp.request('/api/admin/check')
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ defined: true, code: 'FORBIDDEN' })
  })
})