import { decodeJwt, decodeProtectedHeader } from 'jose'
import type { AdminPrimaryAuthProvider } from '@gekichumai/admin-contract'
import { auth } from '../auth.js'
import { config } from '../config.js'
import type { AdminPrimaryAuthOauthProvider } from './primary-auth.js'

type BetterAuthOauthProvider = {
  readonly id: string
  createAuthorizationURL(input: {
    state: string
    codeVerifier: string
    redirectURI: string
    scopes?: string[]
  }): URL | Promise<URL>
  verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>
}

type FetchImplementation = typeof fetch

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const OAUTH_CLOCK_TOLERANCE_SECONDS = 120
export const ADMIN_PRIMARY_AUTH_OAUTH_PROVIDER_TIMEOUT_MS = 10_000

class AdminPrimaryAuthOauthProviderFailure extends Error {
  constructor() {
    super('Administrator OAuth challenge failed')
    this.name = 'AdminPrimaryAuthOauthProviderFailure'
  }
}

const providerFailure = (): never => {
  throw new AdminPrimaryAuthOauthProviderFailure()
}

const runBoundedProviderOperation = async <Result>(
  timeoutMilliseconds: number,
  operation: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> => {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new AdminPrimaryAuthOauthProviderFailure())
    }, timeoutMilliseconds)
  })

  try {
    return await Promise.race([operation(controller.signal), timedOut])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const requireAuthorizationUrlInvariants = (url: URL, state: string): URL => {
  if (
    url.searchParams.get('state') !== state ||
    url.searchParams.get('code_challenge_method') !== 'S256' ||
    !url.searchParams.get('code_challenge')
  ) {
    providerFailure()
  }
  return url
}

const readJsonResponse = async (request: Promise<Response>): Promise<Record<string, unknown>> => {
  let response: Response
  try {
    response = await request
  } catch {
    return providerFailure()
  }
  if (!response.ok) return providerFailure()

  try {
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return providerFailure()
    return value as Record<string, unknown>
  } catch {
    return providerFailure()
  }
}

const getConfiguredBetterAuthProvider = async (
  providerName: AdminPrimaryAuthProvider,
): Promise<BetterAuthOauthProvider> => {
  const context = await auth.$context
  const provider = context.socialProviders.find((candidate) => candidate.id === providerName)
  if (!provider) return providerFailure()
  return provider
}

export const createGoogleAdminPrimaryAuthOauthProvider = ({
  clientId,
  clientSecret,
  getProvider = () => getConfiguredBetterAuthProvider('google'),
  fetchImplementation = fetch,
  providerTimeoutMilliseconds = ADMIN_PRIMARY_AUTH_OAUTH_PROVIDER_TIMEOUT_MS,
}: {
  clientId: string
  clientSecret: string
  getProvider?: () => Promise<BetterAuthOauthProvider>
  fetchImplementation?: FetchImplementation
  providerTimeoutMilliseconds?: number
}): AdminPrimaryAuthOauthProvider => ({
  async createAuthorizationUrl({ state, codeVerifier, nonce, redirectUri }) {
    if (!nonce) return providerFailure()
    const provider = await getProvider()
    const url = requireAuthorizationUrlInvariants(
      await provider.createAuthorizationURL({
        state,
        codeVerifier,
        redirectURI: redirectUri,
        scopes: ['openid', 'email'],
      }),
      state,
    )

    url.searchParams.set('prompt', 'select_account')
    url.searchParams.set('max_age', '0')
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('access_type', 'online')
    url.searchParams.set('claims', JSON.stringify({ id_token: { auth_time: { essential: true } } }))
    return url
  },

  async exchangeAndVerify({ code, codeVerifier, nonce, redirectUri, attemptCreatedAt, consumedAt }) {
    if (!nonce) return providerFailure()
    if (!Number.isFinite(providerTimeoutMilliseconds) || providerTimeoutMilliseconds <= 0) return providerFailure()

    // The callback holds the administrator's write lease while proving the
    // provider identity. Bound the complete provider operation so a stalled
    // token endpoint or verifier cannot indefinitely starve a queued ban or
    // demotion. Native fetch receives the same abort signal.
    return runBoundedProviderOperation(providerTimeoutMilliseconds, async (signal) => {
      const tokenResponse = await readJsonResponse(
        fetchImplementation(GOOGLE_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
          signal,
        }),
      )
      const idToken = tokenResponse.id_token
      if (typeof idToken !== 'string') return providerFailure()

      let verified = false
      let claims: ReturnType<typeof decodeJwt>
      try {
        const provider = await getProvider()
        if (decodeProtectedHeader(idToken).alg !== 'RS256' || !provider.verifyIdToken) return providerFailure()
        verified = await provider.verifyIdToken(idToken, nonce)
        claims = decodeJwt(idToken)
      } catch {
        return providerFailure()
      }
      if (!verified || typeof claims.sub !== 'string' || typeof claims.auth_time !== 'number') {
        return providerFailure()
      }

      const authenticatedAt = claims.auth_time * 1000
      const earliestAllowed = attemptCreatedAt.getTime() - OAUTH_CLOCK_TOLERANCE_SECONDS * 1000
      const latestAllowed = consumedAt.getTime() + OAUTH_CLOCK_TOLERANCE_SECONDS * 1000
      if (!Number.isInteger(claims.auth_time) || authenticatedAt < earliestAllowed || authenticatedAt > latestAllowed) {
        return providerFailure()
      }

      return { accountId: claims.sub }
    })
  },
})

export const adminPrimaryAuthOauthProviders: Readonly<
  Partial<Record<AdminPrimaryAuthProvider, AdminPrimaryAuthOauthProvider>>
> = {
  ...(config.auth.google.clientId && config.auth.google.clientSecret
    ? {
        google: createGoogleAdminPrimaryAuthOauthProvider({
          clientId: config.auth.google.clientId,
          clientSecret: config.auth.google.clientSecret,
        }),
      }
    : {}),
}

export type { BetterAuthOauthProvider }