import { useMemo } from 'react'
import { createAuthClient } from 'better-auth/react'
import { resolveAdminBackendOrigin, validateAdminBackendOrigin } from '../config/backend-origin'

export const ADMIN_AUTH_BASE_PATH = '/api/auth' as const
export const ADMIN_CAPTCHA_HEADER = 'x-captcha-response' as const

export const ADMIN_OAUTH_PROVIDERS = ['google', 'github'] as const
export type AdminOauthProvider = (typeof ADMIN_OAUTH_PROVIDERS)[number]

const ADMIN_OAUTH_PROVIDER_ORIGINS = {
  github: 'https://github.com',
  google: 'https://accounts.google.com',
} as const satisfies Readonly<Record<AdminOauthProvider, string>>

export type AdminAuthOperation = 'password' | 'session' | 'sign-out' | 'social'

export type AdminAuthFailureKind =
  | 'cancelled'
  | 'captcha-rejected'
  | 'captcha-required'
  | 'invalid-credentials'
  | 'provider-unavailable'
  | 'rate-limited'
  | 'session-expired'
  | 'unavailable'
  | 'unexpected'

export type AdminAuthFailure = {
  readonly kind: AdminAuthFailureKind
  readonly operation: AdminAuthOperation
}

export type AdminAuthResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: AdminAuthFailure }

export type AdminSessionIdentity = {
  readonly sessionId: string
  readonly user: {
    readonly email: string
    readonly id: string
    readonly image: string | null
    readonly name: string
  }
}

export type AdminSessionSnapshot = {
  readonly data: AdminSessionIdentity | null
  readonly error: AdminAuthFailure | null
  readonly isPending: boolean
  readonly isRefetching: boolean
  readonly refetch: () => Promise<void>
}

export type AdminAuthClient = {
  readonly beginSocialSignIn: (provider: AdminOauthProvider) => Promise<AdminAuthResult<{ authorizationUrl: string }>>
  readonly getSession: () => Promise<AdminAuthResult<AdminSessionIdentity | null>>
  readonly signInWithPassword: (input: {
    readonly captchaToken?: string
    readonly email: string
    readonly password: string
  }) => Promise<AdminAuthResult<null>>
  readonly signOut: () => Promise<AdminAuthResult<null>>
  readonly useSession: () => AdminSessionSnapshot
}

type FetchImplementation = typeof globalThis.fetch

export type CreateAdminAuthClientOptions = {
  readonly backendOrigin?: string
  readonly fetch?: FetchImplementation
  readonly frontendOrigin?: string
  readonly mode?: string
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const stringField = (source: unknown, field: string): string | undefined => {
  if (!isRecord(source)) return undefined
  const value = source[field]
  return typeof value === 'string' ? value : undefined
}

const numberField = (source: unknown, field: string): number | undefined => {
  if (!isRecord(source)) return undefined
  const value = source[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const nestedError = (error: unknown): unknown => (isRecord(error) && 'error' in error ? error.error : undefined)

const errorCode = (error: unknown): string | undefined =>
  stringField(error, 'code') ?? stringField(nestedError(error), 'code')

const errorStatus = (error: unknown): number | undefined =>
  numberField(error, 'status') ?? numberField(nestedError(error), 'status')

const isCancellation = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')

export const sanitizeAdminAuthFailure = (error: unknown, operation: AdminAuthOperation): AdminAuthFailure => {
  if (isCancellation(error)) return { kind: 'cancelled', operation }

  const code = errorCode(error)
  const status = errorStatus(error)

  if (code === 'MISSING_RESPONSE') return { kind: 'captcha-required', operation }
  if (code === 'VERIFICATION_FAILED') return { kind: 'captcha-rejected', operation }
  if (code === 'TOO_MANY_REQUESTS' || status === 429) return { kind: 'rate-limited', operation }

  if (operation === 'password') {
    if (
      code === 'INVALID_EMAIL' ||
      code === 'INVALID_EMAIL_OR_PASSWORD' ||
      code === 'INVALID_PASSWORD' ||
      status === 401
    ) {
      return { kind: 'invalid-credentials', operation }
    }
  }

  if (operation === 'social') {
    if (code === 'OAUTH_LINK_ERROR' || code === 'PROVIDER_NOT_FOUND' || status === 401 || status === 404) {
      return { kind: 'provider-unavailable', operation }
    }
  }

  if (operation === 'session' && status === 401) return { kind: 'session-expired', operation }
  if ((status !== undefined && status >= 500) || (status === undefined && error instanceof TypeError)) {
    return { kind: 'unavailable', operation }
  }

  return { kind: 'unexpected', operation }
}

const sanitizeSessionIdentity = (value: unknown): AdminSessionIdentity | null | undefined => {
  if (value === null) return null
  if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.user)) return undefined

  const sessionId = stringField(value.session, 'id')
  const id = stringField(value.user, 'id')
  const email = stringField(value.user, 'email')
  const name = stringField(value.user, 'name')
  const image = value.user.image

  if (!sessionId || !id || email === undefined || name === undefined) return undefined
  if (image !== undefined && image !== null && typeof image !== 'string') return undefined

  return {
    sessionId,
    user: {
      email,
      id,
      image: image ?? null,
      name,
    },
  }
}

export const validateAdminOauthAuthorizationUrl = (value: string, provider: AdminOauthProvider): string => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('The authentication provider returned an invalid authorization URL')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== ADMIN_OAUTH_PROVIDER_ORIGINS[provider] ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new Error('The authentication provider returned an invalid authorization URL')
  }

  return parsed.toString()
}

const getBrowserOrigin = (): string => {
  if (typeof globalThis.location?.origin !== 'string') {
    throw new Error('The administrator frontend origin is unavailable')
  }
  return globalThis.location.origin
}

const actionFailure = <T>(error: unknown, operation: AdminAuthOperation): AdminAuthResult<T> => ({
  ok: false,
  failure: sanitizeAdminAuthFailure(error, operation),
})

export const createAdminAuthClient = ({
  backendOrigin,
  fetch: fetchImplementation = globalThis.fetch.bind(globalThis),
  frontendOrigin = getBrowserOrigin(),
  mode = import.meta.env.MODE,
}: CreateAdminAuthClientOptions = {}): AdminAuthClient => {
  const resolvedBackendOrigin =
    backendOrigin === undefined
      ? resolveAdminBackendOrigin({ mode, configuredOrigin: import.meta.env.VITE_BACKEND_URL })
      : validateAdminBackendOrigin(backendOrigin, mode)
  const resolvedFrontendOrigin = validateAdminBackendOrigin(frontendOrigin, mode)
  const callbackURL = new URL('/', resolvedFrontendOrigin).toString()
  const errorCallbackURL = new URL('/sign-in?oauth=failed', resolvedFrontendOrigin).toString()

  const client = createAuthClient({
    basePath: ADMIN_AUTH_BASE_PATH,
    baseURL: resolvedBackendOrigin,
    fetchOptions: {
      credentials: 'include',
      customFetchImpl: fetchImplementation,
    },
    sessionOptions: {
      refetchInterval: 0,
      refetchOnWindowFocus: true,
      refetchWhenOffline: false,
    },
  })

  const getSession = async (): Promise<AdminAuthResult<AdminSessionIdentity | null>> => {
    try {
      const result = await client.getSession()
      if (result.error) return actionFailure(result.error, 'session')

      const session = sanitizeSessionIdentity(result.data)
      return session === undefined ? actionFailure(undefined, 'session') : { ok: true, data: session }
    } catch (error) {
      return actionFailure(error, 'session')
    }
  }

  return {
    beginSocialSignIn: async (provider) => {
      try {
        const result = await client.signIn.social({
          callbackURL,
          disableRedirect: true,
          errorCallbackURL,
          provider,
          requestSignUp: false,
        })
        if (result.error) return actionFailure(result.error, 'social')

        const authorizationUrl = result.data?.url
        if (typeof authorizationUrl !== 'string') return actionFailure(undefined, 'social')

        try {
          return {
            ok: true,
            data: { authorizationUrl: validateAdminOauthAuthorizationUrl(authorizationUrl, provider) },
          }
        } catch {
          return { ok: false, failure: { kind: 'unexpected', operation: 'social' } }
        }
      } catch (error) {
        return actionFailure(error, 'social')
      }
    },
    getSession,
    signInWithPassword: async ({ captchaToken, email, password }) => {
      try {
        const result = await client.signIn.email({
          email: email.trim(),
          password,
          ...(captchaToken
            ? {
                fetchOptions: {
                  headers: { [ADMIN_CAPTCHA_HEADER]: captchaToken },
                },
              }
            : {}),
        })
        if (result.error) return actionFailure(result.error, 'password')
        return { ok: true, data: null }
      } catch (error) {
        return actionFailure(error, 'password')
      }
    },
    signOut: async () => {
      try {
        const result = await client.signOut()
        if (result.error) return actionFailure(result.error, 'sign-out')
        return { ok: true, data: null }
      } catch (error) {
        return actionFailure(error, 'sign-out')
      }
    },
    useSession: () => {
      const session = client.useSession()
      const sanitizedData = useMemo(() => sanitizeSessionIdentity(session.data), [session.data])
      const malformed = sanitizedData === undefined && session.data !== null
      const failure = useMemo(
        () =>
          session.error
            ? sanitizeAdminAuthFailure(session.error, 'session')
            : malformed
              ? ({ kind: 'unexpected', operation: 'session' } as const)
              : null,
        [malformed, session.error],
      )

      return useMemo(
        () => ({
          data: sanitizedData ?? null,
          error: failure,
          isPending: session.isPending,
          isRefetching: session.isRefetching,
          refetch: async () => session.refetch(),
        }),
        [failure, sanitizedData, session.isPending, session.isRefetching, session.refetch],
      )
    },
  }
}