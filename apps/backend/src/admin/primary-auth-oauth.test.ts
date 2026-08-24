import { describe, expect, it, vi } from 'vitest'
import { createGoogleAdminPrimaryAuthOauthProvider, type BetterAuthOauthProvider } from './primary-auth-oauth.js'

const STATE = 'oauth-state-value-that-is-long-enough'
const CODE_VERIFIER = 'pkce-verifier-value-that-is-deliberately-long-enough'
const NONCE = 'google-nonce-value-that-is-long-enough'
const REDIRECT_URI = 'https://api.example.com/api/admin/primary-auth/oauth/callback/google'
const ATTEMPT_CREATED_AT = new Date('2026-08-24T12:00:00.000Z')
const CONSUMED_AT = new Date('2026-08-24T12:05:00.000Z')

type TestFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const compactJwt = (
  claims: Record<string, unknown>,
  protectedHeader: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' },
) =>
  [protectedHeader, claims, { signature: 'test-only' }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.')

const createBetterAuthProvider = ({
  id = 'google',
  verifyIdToken = vi.fn(async () => true),
  authorizationUrl,
}: {
  id?: string
  verifyIdToken?: ReturnType<typeof vi.fn<(token: string, nonce?: string) => Promise<boolean>>>
  authorizationUrl?: URL
} = {}) => {
  const createAuthorizationURL = vi.fn(async ({ state }: { state: string }) => {
    if (authorizationUrl) return new URL(authorizationUrl)
    const url = new URL(`https://${id}.example/authorize`)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', 'better-auth-derived-s256-challenge')
    url.searchParams.set('code_challenge_method', 'S256')
    return url
  })

  return {
    provider: { id, createAuthorizationURL, verifyIdToken } satisfies BetterAuthOauthProvider,
    createAuthorizationURL,
    verifyIdToken,
  }
}

const googleExchangeInput = {
  code: 'google-authorization-code',
  codeVerifier: CODE_VERIFIER,
  nonce: NONCE,
  redirectUri: REDIRECT_URI,
  attemptCreatedAt: ATTEMPT_CREATED_AT,
  consumedAt: CONSUMED_AT,
}

const expectGenericProviderFailure = async (promise: Promise<unknown>, forbiddenValue?: string) => {
  let failure: unknown
  try {
    await promise
  } catch (error) {
    failure = error
  }

  expect(failure).toBeInstanceOf(Error)
  expect(failure).toMatchObject({ message: 'Administrator OAuth challenge failed' })
  if (forbiddenValue) {
    expect(String(failure)).not.toContain(forbiddenValue)
    expect(JSON.stringify(failure)).not.toContain(forbiddenValue)
  }
  return failure
}

describe('Google administrator primary-auth OAuth adapter', () => {
  it('forces an interactive account selection and preserves state, S256 PKCE, nonce, and auth_time request', async () => {
    const betterAuth = createBetterAuthProvider()
    const provider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      getProvider: async () => betterAuth.provider,
      fetchImplementation: vi.fn() as unknown as typeof fetch,
    })

    const url = await provider.createAuthorizationUrl({
      state: STATE,
      codeVerifier: CODE_VERIFIER,
      nonce: NONCE,
      redirectUri: REDIRECT_URI,
    })

    expect(betterAuth.createAuthorizationURL).toHaveBeenCalledWith({
      state: STATE,
      codeVerifier: CODE_VERIFIER,
      redirectURI: REDIRECT_URI,
      scopes: ['openid', 'email'],
    })
    expect(url.searchParams.get('state')).toBe(STATE)
    expect(url.searchParams.get('code_challenge')).toBe('better-auth-derived-s256-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('prompt')).toBe('select_account')
    expect(url.searchParams.get('max_age')).toBe('0')
    expect(url.searchParams.get('nonce')).toBe(NONCE)
    expect(url.searchParams.get('access_type')).toBe('online')
    expect(JSON.parse(url.searchParams.get('claims')!)).toEqual({
      id_token: { auth_time: { essential: true } },
    })
  })

  it('exchanges the code with PKCE and accepts identity only through the injected signed-token verifier', async () => {
    const subject = 'google-provider-subject'
    const idToken = compactJwt({
      sub: subject,
      auth_time: Math.floor(new Date('2026-08-24T12:01:00.000Z').getTime() / 1_000),
    })
    const fetchImplementation = vi.fn<TestFetch>(async () =>
      Response.json({ id_token: idToken, access_token: 'sensitive' }),
    )
    const betterAuth = createBetterAuthProvider()
    const provider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      getProvider: async () => betterAuth.provider,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })

    const result = await provider.exchangeAndVerify(googleExchangeInput)

    expect(result).toEqual({ accountId: subject })
    expect(Object.keys(result)).toEqual(['accountId'])
    expect(betterAuth.verifyIdToken).toHaveBeenCalledWith(idToken, NONCE)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0]!
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: googleExchangeInput.code,
      client_id: 'google-client-id',
      client_secret: 'google-client-secret',
      redirect_uri: REDIRECT_URI,
      code_verifier: CODE_VERIFIER,
    })
  })

  it.each([
    ['the lower clock-skew boundary', Math.floor(ATTEMPT_CREATED_AT.getTime() / 1_000) - 120, true],
    ['one second before the lower clock-skew boundary', Math.floor(ATTEMPT_CREATED_AT.getTime() / 1_000) - 121, false],
    ['the upper clock-skew boundary', Math.floor(CONSUMED_AT.getTime() / 1_000) + 120, true],
    ['one second after the upper clock-skew boundary', Math.floor(CONSUMED_AT.getTime() / 1_000) + 121, false],
    ['a fractional auth_time claim', Math.floor(ATTEMPT_CREATED_AT.getTime() / 1_000) + 0.5, false],
  ])('handles auth_time at %s', async (_description, authTime, accepted) => {
    const idToken = compactJwt({ sub: 'google-subject', auth_time: authTime })
    const betterAuth = createBetterAuthProvider()
    const provider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      getProvider: async () => betterAuth.provider,
      fetchImplementation: vi.fn(async () => Response.json({ id_token: idToken })) as unknown as typeof fetch,
    })

    if (accepted) {
      await expect(provider.exchangeAndVerify(googleExchangeInput)).resolves.toEqual({ accountId: 'google-subject' })
    } else {
      await expectGenericProviderFailure(provider.exchangeAndVerify(googleExchangeInput))
    }
  })

  it('rejects an unverified token, a non-RS256 token, missing nonce, and missing auth_time', async () => {
    const validClaims = {
      sub: 'google-subject',
      auth_time: Math.floor(ATTEMPT_CREATED_AT.getTime() / 1_000),
    }

    const rejectedSignature = createBetterAuthProvider({ verifyIdToken: vi.fn(async () => false) })
    const signatureProvider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => rejectedSignature.provider,
      fetchImplementation: vi.fn(async () =>
        Response.json({ id_token: compactJwt(validClaims) }),
      ) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(signatureProvider.exchangeAndVerify(googleExchangeInput))

    const wrongAlgorithm = createBetterAuthProvider()
    const algorithmProvider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => wrongAlgorithm.provider,
      fetchImplementation: vi.fn(async () =>
        Response.json({ id_token: compactJwt(validClaims, { alg: 'HS256' }) }),
      ) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(algorithmProvider.exchangeAndVerify(googleExchangeInput))
    expect(wrongAlgorithm.verifyIdToken).not.toHaveBeenCalled()

    const missingClaim = createBetterAuthProvider()
    const missingClaimProvider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => missingClaim.provider,
      fetchImplementation: vi.fn(async () =>
        Response.json({ id_token: compactJwt({ sub: 'google-subject' }) }),
      ) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(missingClaimProvider.exchangeAndVerify(googleExchangeInput))

    const nonceProvider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => createBetterAuthProvider().provider,
      fetchImplementation: vi.fn() as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(
      nonceProvider.createAuthorizationUrl({
        state: STATE,
        codeVerifier: CODE_VERIFIER,
        nonce: null,
        redirectUri: REDIRECT_URI,
      }),
    )
    await expectGenericProviderFailure(nonceProvider.exchangeAndVerify({ ...googleExchangeInput, nonce: null }))
  })

  it('uses one generic error for token endpoint, malformed token, and verifier failures without leaking details', async () => {
    const secret = 'raw-google-provider-secret'
    const endpointFailure = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => createBetterAuthProvider().provider,
      fetchImplementation: vi.fn(async () =>
        Response.json({ error_description: secret }, { status: 400 }),
      ) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(endpointFailure.exchangeAndVerify(googleExchangeInput), secret)

    const malformedToken = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => createBetterAuthProvider().provider,
      fetchImplementation: vi.fn(async () => Response.json({ id_token: secret })) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(malformedToken.exchangeAndVerify(googleExchangeInput), secret)

    const throwingVerifier = createBetterAuthProvider({
      verifyIdToken: vi.fn(async () => {
        throw new Error(secret)
      }),
    })
    const verifierFailure = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => throwingVerifier.provider,
      fetchImplementation: vi.fn(async () =>
        Response.json({
          id_token: compactJwt({
            sub: 'google-subject',
            auth_time: Math.floor(ATTEMPT_CREATED_AT.getTime() / 1_000),
          }),
        }),
      ) as unknown as typeof fetch,
    })
    await expectGenericProviderFailure(verifierFailure.exchangeAndVerify(googleExchangeInput), secret)
  })
})

describe('administrator OAuth authorization URL invariants', () => {
  it.each([
    ['missing state', new URL('https://provider.example/authorize?code_challenge=x&code_challenge_method=S256')],
    [
      'different state',
      new URL('https://provider.example/authorize?state=other&code_challenge=x&code_challenge_method=S256'),
    ],
    ['missing challenge', new URL(`https://provider.example/authorize?state=${STATE}&code_challenge_method=S256`)],
    [
      'non-S256 challenge',
      new URL(`https://provider.example/authorize?state=${STATE}&code_challenge=x&code_challenge_method=plain`),
    ],
  ])('fails closed for a Better Auth URL with %s', async (_description, authorizationUrl) => {
    const betterAuth = createBetterAuthProvider({ authorizationUrl })
    const provider = createGoogleAdminPrimaryAuthOauthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      getProvider: async () => betterAuth.provider,
      fetchImplementation: vi.fn() as unknown as typeof fetch,
    })

    await expectGenericProviderFailure(
      provider.createAuthorizationUrl({
        state: STATE,
        codeVerifier: CODE_VERIFIER,
        nonce: NONCE,
        redirectUri: REDIRECT_URI,
      }),
    )
  })
})