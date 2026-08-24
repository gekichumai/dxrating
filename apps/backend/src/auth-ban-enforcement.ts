import type { GenericEndpointContext } from '@better-auth/core'
import { defineRequestState, hasRequestState, runWithRequestState } from '@better-auth/core/context'
import { createLogger } from '@better-auth/core/env'
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import type { Pool, PoolClient } from 'pg'
import { jwtVerify } from 'jose'
import { loadPostgresUserBanState, type EvaluatedUserBanState } from './admin/user-ban-store.js'
import { assertAuthReturnUrlsDoNotContainUserInfo } from './auth-security.js'
import { pool } from './db/index.js'
import { isExpectedAccountBanDenial } from './lib/functions/sentry.js'

export const ACCOUNT_BANNED_CODE = 'ACCOUNT_BANNED' as const
export const ACCOUNT_BANNED_MESSAGE = 'This account is currently unavailable'
export const AUTH_OPERATION_FAILED_CODE = 'AUTH_OPERATION_FAILED' as const
export const AUTH_OPERATION_FAILED_MESSAGE = 'Authentication operation failed'

export type AccountBannedResponse = {
  readonly code: typeof ACCOUNT_BANNED_CODE
  readonly message: typeof ACCOUNT_BANNED_MESSAGE
  readonly reason: string
  readonly expiresAt: string | null
}

export const createPrivateAuthOperationFailedResponse = (): Response =>
  new Response(
    JSON.stringify({
      code: AUTH_OPERATION_FAILED_CODE,
      message: AUTH_OPERATION_FAILED_MESSAGE,
    }),
    {
      status: 500,
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'Referrer-Policy': 'no-referrer',
      },
    },
  )

export type AuthRoutePolicy =
  | 'authentication'
  | 'internal_session_write'
  | 'proof_write'
  | 'public'
  | 'safe_sign_out'
  | 'session_probe'
  | 'session_read'
  | 'session_write'

export type AuthRouteInventoryEntry = {
  readonly operation: string
  readonly path: string | null
  readonly methods: readonly string[]
  readonly policy: AuthRoutePolicy
}

/**
 * Complete Better Auth HTTP surface enabled by auth.ts. Classification is by
 * exact endpoint identity, never by HTTP verb. The drift test intentionally
 * fails whenever Better Auth or an enabled plugin adds or changes a route.
 */
export const AUTH_ROUTE_INVENTORY = [
  { operation: 'signInSocial', path: '/sign-in/social', methods: ['POST'], policy: 'authentication' },
  { operation: 'callbackOAuth', path: '/callback/:id', methods: ['GET', 'POST'], policy: 'authentication' },
  { operation: 'getSession', path: '/get-session', methods: ['GET', 'POST'], policy: 'session_probe' },
  { operation: 'signOut', path: '/sign-out', methods: ['POST'], policy: 'safe_sign_out' },
  { operation: 'signUpEmail', path: '/sign-up/email', methods: ['POST'], policy: 'public' },
  { operation: 'signInEmail', path: '/sign-in/email', methods: ['POST'], policy: 'authentication' },
  { operation: 'resetPassword', path: '/reset-password', methods: ['POST'], policy: 'proof_write' },
  { operation: 'verifyPassword', path: '/verify-password', methods: ['POST'], policy: 'session_read' },
  { operation: 'verifyEmail', path: '/verify-email', methods: ['GET'], policy: 'proof_write' },
  { operation: 'sendVerificationEmail', path: '/send-verification-email', methods: ['POST'], policy: 'public' },
  { operation: 'changeEmail', path: '/change-email', methods: ['POST'], policy: 'session_write' },
  { operation: 'changePassword', path: '/change-password', methods: ['POST'], policy: 'session_write' },
  { operation: 'setPassword', path: null, methods: ['POST'], policy: 'internal_session_write' },
  { operation: 'updateSession', path: '/update-session', methods: ['POST'], policy: 'session_write' },
  { operation: 'updateUser', path: '/update-user', methods: ['POST'], policy: 'session_write' },
  { operation: 'deleteUser', path: '/delete-user', methods: ['POST'], policy: 'session_write' },
  { operation: 'requestPasswordReset', path: '/request-password-reset', methods: ['POST'], policy: 'public' },
  {
    operation: 'requestPasswordResetCallback',
    path: '/reset-password/:token',
    methods: ['GET'],
    policy: 'public',
  },
  { operation: 'listSessions', path: '/list-sessions', methods: ['GET'], policy: 'session_read' },
  { operation: 'revokeSession', path: '/revoke-session', methods: ['POST'], policy: 'session_write' },
  { operation: 'revokeSessions', path: '/revoke-sessions', methods: ['POST'], policy: 'session_write' },
  { operation: 'revokeOtherSessions', path: '/revoke-other-sessions', methods: ['POST'], policy: 'session_write' },
  { operation: 'linkSocialAccount', path: '/link-social', methods: ['POST'], policy: 'session_write' },
  { operation: 'listUserAccounts', path: '/list-accounts', methods: ['GET'], policy: 'session_read' },
  { operation: 'deleteUserCallback', path: '/delete-user/callback', methods: ['GET'], policy: 'session_write' },
  { operation: 'unlinkAccount', path: '/unlink-account', methods: ['POST'], policy: 'session_write' },
  { operation: 'refreshToken', path: '/refresh-token', methods: ['POST'], policy: 'session_write' },
  { operation: 'getAccessToken', path: '/get-access-token', methods: ['POST'], policy: 'session_write' },
  { operation: 'accountInfo', path: '/account-info', methods: ['GET'], policy: 'session_write' },
  { operation: 'expoAuthorizationProxy', path: '/expo-authorization-proxy', methods: ['GET'], policy: 'public' },
  { operation: 'generateOpenAPISchema', path: '/open-api/generate-schema', methods: ['GET'], policy: 'public' },
  { operation: 'openAPIReference', path: '/reference', methods: ['GET'], policy: 'public' },
  {
    operation: 'generatePasskeyRegistrationOptions',
    path: '/passkey/generate-register-options',
    methods: ['GET'],
    policy: 'session_write',
  },
  {
    operation: 'generatePasskeyAuthenticationOptions',
    path: '/passkey/generate-authenticate-options',
    methods: ['GET'],
    policy: 'public',
  },
  {
    operation: 'verifyPasskeyRegistration',
    path: '/passkey/verify-registration',
    methods: ['POST'],
    policy: 'session_write',
  },
  {
    operation: 'verifyPasskeyAuthentication',
    path: '/passkey/verify-authentication',
    methods: ['POST'],
    policy: 'authentication',
  },
  { operation: 'listPasskeys', path: '/passkey/list-user-passkeys', methods: ['GET'], policy: 'session_read' },
  { operation: 'deletePasskey', path: '/passkey/delete-passkey', methods: ['POST'], policy: 'session_write' },
  { operation: 'updatePasskey', path: '/passkey/update-passkey', methods: ['POST'], policy: 'session_write' },
  { operation: 'oneTapCallback', path: '/one-tap/callback', methods: ['POST'], policy: 'authentication' },
  { operation: 'ok', path: '/ok', methods: ['GET'], policy: 'public' },
  { operation: 'error', path: '/error', methods: ['GET'], policy: 'public' },
] as const satisfies readonly AuthRouteInventoryEntry[]

type BanDatabase = Pool | PoolClient
type OauthFlow = 'link' | 'sign_in'

const banDenialState = defineRequestState<AccountBannedResponse | null>(() => null)
const oauthFlowState = defineRequestState<OauthFlow>(() => 'sign_in')
const provenUserIdState = defineRequestState<string | null>(() => null)

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'

const hasActiveBanDatabaseGuardCause = (error: unknown): boolean => {
  const seen = new Set<object>()
  let candidate = error
  for (let depth = 0; depth < 8 && isObject(candidate) && !seen.has(candidate); depth += 1) {
    seen.add(candidate)
    if (
      Reflect.get(candidate, 'code') === 'DXB01' &&
      Reflect.get(candidate, 'constraint') === 'active_user_ban_write_guard'
    ) {
      return true
    }
    candidate = Reflect.get(candidate, 'cause')
  }
  return false
}

const stringField = (value: unknown, field: string): string | undefined => {
  if (!isObject(value)) return undefined
  const fieldValue = value[field]
  return typeof fieldValue === 'string' ? fieldValue : undefined
}

export const projectAccountBannedResponse = (state: EvaluatedUserBanState): AccountBannedResponse => {
  if (!state.active || state.banReason === null) {
    throw new Error('Cannot project an inactive or malformed account ban')
  }
  return {
    code: ACCOUNT_BANNED_CODE,
    message: ACCOUNT_BANNED_MESSAGE,
    reason: state.banReason,
    expiresAt: state.banExpiresAt?.toISOString() ?? null,
  }
}

export const createAccountBannedApiError = (response: AccountBannedResponse): APIError =>
  new APIError('FORBIDDEN', response)

type AuthErrorLogger = {
  error(...values: unknown[]): void
}

type BetterAuthLogLevel = 'debug' | 'error' | 'info' | 'warn'

// Better Auth only calls a custom logger after applying its own configured
// level. Delegate accepted entries to a normal logger so formatting and the
// console error/warn/log split remain identical to the library default.
const defaultBetterAuthLogger = createLogger({ level: 'debug' })
const SAFE_BETTER_AUTH_LOG_MESSAGES = {
  debug: 'Better Auth debug event',
  error: 'Better Auth error event',
  info: 'Better Auth information event',
  warn: 'Better Auth warning event',
} as const satisfies Record<BetterAuthLogLevel, string>

/**
 * Passkey catches hook and adapter failures and logs them before onAPIError.
 * Suppress the complete entry whenever any logged value identifies an
 * expected active-ban outcome; this also keeps console-based Sentry capture
 * from observing the otherwise-generic passkey error message.
 */
export const logBanAwareBetterAuthMessage = (
  level: BetterAuthLogLevel,
  message: string,
  ...values: unknown[]
): void => {
  if (
    [message, ...values].some((value) => isExpectedAccountBanDenial(value) || hasActiveBanDatabaseGuardCause(value))
  ) {
    return
  }

  // Better Auth includes emails in both structured values and interpolated
  // messages for ordinary sign-in/sign-up failures. Its logger also receives
  // raw adapter errors whose causes can contain account IDs or query values.
  // Preserve only a finite level-specific signal for generic logs; detailed
  // request outcomes already have typed responses and bounded metrics.
  defaultBetterAuthLogger[level](SAFE_BETTER_AUTH_LOG_MESSAGES[level])
}

/** Preserve Better Auth's default unexpected-error logging while suppressing
 * active-ban authorization outcomes (including the database race backstop). */
export const logUnexpectedBetterAuthError = (error: unknown, logger: AuthErrorLogger): void => {
  if (hasActiveBanDatabaseGuardCause(error)) {
    // Better Call logs every non-API error after onAPIError returns. Replace a
    // wrapped Drizzle/pg race denial with a data-free API error so that layer
    // recognizes it as handled; app.ts rechecks the proven identity and
    // projects the current typed ban from request-local state.
    throw new APIError('INTERNAL_SERVER_ERROR', {
      code: AUTH_OPERATION_FAILED_CODE,
      message: AUTH_OPERATION_FAILED_MESSAGE,
    })
  }
  if (isExpectedAccountBanDenial(error)) return
  if (isAPIError(error)) {
    if (error.status === 'INTERNAL_SERVER_ERROR') logger.error(error.status, error)
    return
  }
  const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
  logger.error(name, error)
}

const markProvenUserId = async (userId: string): Promise<void> => {
  if (await hasRequestState()) await provenUserIdState.set(userId)
}

/**
 * Opens Better Auth request state outside auth.handler so the outer HTTP
 * wrapper can still inspect proof identity after an adapter/trigger failure.
 * Better Auth detects and reuses this scope instead of creating a nested one.
 */
export const runWithAuthBanRequestState = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
  if (await hasRequestState()) return operation()
  return runWithRequestState(new WeakMap(), operation)
}

export const getProvenAuthBanUserId = async (): Promise<string | null> =>
  (await hasRequestState()) ? provenUserIdState.get() : null

export const getProjectedAuthBanDenial = async (): Promise<AccountBannedResponse | null> =>
  (await hasRequestState()) ? banDenialState.get() : null

const loadActiveBan = async (database: BanDatabase, userId: string): Promise<AccountBannedResponse | null> => {
  const state = await loadPostgresUserBanState(database, userId)
  return state.active ? projectAccountBannedResponse(state) : null
}

export const assertUserIsNotBanned = async (database: BanDatabase, userId: string): Promise<void> => {
  await markProvenUserId(userId)
  const denial = await loadActiveBan(database, userId)
  if (denial) {
    if (await hasRequestState()) await banDenialState.set(denial)
    throw createAccountBannedApiError(denial)
  }
}

/**
 * Passkey catches and logs every post-verification exception before replacing
 * it with its own generic 400. Keep private ban details in request-local state
 * and throw a data-free control-flow error; the global after hook restores the
 * typed 403 response without placing the reason or identity in logs.
 */
const rejectPasskeyWithSanitizedError = async (denial: AccountBannedResponse): Promise<never> => {
  await banDenialState.set(denial)
  const error = new Error('Verified authentication is unavailable')
  Object.defineProperty(error, 'code', { value: ACCOUNT_BANNED_CODE })
  throw error
}

const assertPasskeyUserIsNotBanned = async (database: BanDatabase, userId: string): Promise<void> => {
  await markProvenUserId(userId)
  const denial = await loadActiveBan(database, userId)
  if (denial) await rejectPasskeyWithSanitizedError(denial)
}

const findOauthAccountUserId = async (
  database: BanDatabase,
  providerId: string,
  providerAccountId: string,
): Promise<string | undefined> => {
  const result = await database.query<{ readonly user_id: string }>(
    `
      SELECT user_id
      FROM account
      WHERE provider_id = $1 AND account_id = $2
      LIMIT 1
    `,
    [providerId, providerAccountId],
  )
  return result.rows[0]?.user_id
}

type OauthUserInfoResult = {
  readonly user: {
    readonly id: string | number
  }
  readonly data: unknown
} | null

export const withOauthAccountBanCheck =
  <Arguments extends readonly unknown[], Result extends OauthUserInfoResult>(
    database: BanDatabase,
    providerId: string,
    getUserInfo: (...args: Arguments) => Promise<Result>,
  ): ((...args: Arguments) => Promise<Result>) =>
  async (...args) => {
    const result = await getUserInfo(...args)
    if (!result || (await oauthFlowState.get()) === 'link') return result

    const userId = await findOauthAccountUserId(database, providerId, String(result.user.id))
    if (userId) await assertUserIsNotBanned(database, userId)
    return result
  }

const findPasskeyUserId = async (database: BanDatabase, credentialId: string): Promise<string | undefined> => {
  const result = await database.query<{ readonly user_id: string }>(
    `
      SELECT user_id
      FROM passkey
      WHERE credential_id = $1
      LIMIT 1
    `,
    [credentialId],
  )
  return result.rows[0]?.user_id
}

export const createPasskeyBanCallbacks = (database: BanDatabase = pool) => ({
  registration: {
    afterVerification: async ({ user }: { readonly user: { readonly id: string } }) => {
      await assertPasskeyUserIsNotBanned(database, user.id)
    },
  },
  authentication: {
    afterVerification: async ({ clientData }: { readonly clientData: unknown }) => {
      const credentialId = stringField(clientData, 'id')
      if (!credentialId) return
      const userId = await findPasskeyUserId(database, credentialId)
      if (userId) await assertPasskeyUserIsNotBanned(database, userId)
    },
  },
})

const routePolicyByIdentity = new Map<string, AuthRoutePolicy>(
  AUTH_ROUTE_INVENTORY.flatMap((entry) =>
    entry.path === null ? [] : entry.methods.map((method) => [`${entry.path}\u0000${method}`, entry.policy] as const),
  ),
)
const pathlessRoutePolicies = AUTH_ROUTE_INVENTORY.filter((entry) => entry.path === null)
const routePoliciesByPath = new Map<string, Set<AuthRoutePolicy>>()
for (const entry of AUTH_ROUTE_INVENTORY) {
  if (entry.path === null) continue
  const policies = routePoliciesByPath.get(entry.path) ?? new Set<AuthRoutePolicy>()
  policies.add(entry.policy)
  routePoliciesByPath.set(entry.path, policies)
}

const resolveRoutePolicy = (path: string | undefined, method: string | undefined): AuthRoutePolicy | undefined => {
  if (path) {
    if (method) return routePolicyByIdentity.get(`${path}\u0000${method.toUpperCase()}`)
    const policies = routePoliciesByPath.get(path)
    return policies?.size === 1 ? policies.values().next().value : undefined
  }
  if (!method) return pathlessRoutePolicies.length === 1 ? pathlessRoutePolicies[0]?.policy : undefined
  return pathlessRoutePolicies.find((entry) => entry.methods.some((candidate) => candidate === method.toUpperCase()))
    ?.policy
}

const loadSessionIdentity = async (
  context: GenericEndpointContext,
  database: BanDatabase,
): Promise<string | undefined> => {
  const sessionToken = await context.getSignedCookie(
    context.context.authCookies.sessionToken.name,
    context.context.secret,
  )
  if (!sessionToken) return undefined
  const session = await database.query<{ readonly user_id: string }>(
    `
      SELECT user_id
      FROM session
      WHERE token = $1 AND expires_at > clock_timestamp()
      LIMIT 1
    `,
    [sessionToken],
  )
  const userId = session.rows[0]?.user_id
  if (userId) await markProvenUserId(userId)
  return userId
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const inspectOauthCallbackState = async (context: GenericEndpointContext, database: BanDatabase): Promise<void> => {
  const state = stringField(context.query, 'state') ?? stringField(context.body, 'state')
  if (!state) return

  const stateCookie = context.context.createAuthCookie('state')
  const signedState = await context.getSignedCookie(stateCookie.name, context.context.secret)
  if (signedState !== state) return

  const verification = await context.context.internalAdapter.findVerificationValue(state)
  if (!verification || verification.expiresAt <= new Date()) return

  let parsed: unknown
  try {
    parsed = JSON.parse(verification.value)
  } catch {
    return
  }
  if (!isObject(parsed) || parsed.oauthState !== state || !isObject(parsed.link)) return
  const linkUserId = stringField(parsed.link, 'userId')
  if (!linkUserId) return

  await oauthFlowState.set('link')
  await assertUserIsNotBanned(database, linkUserId)
}

const inspectResetPasswordProof = async (context: GenericEndpointContext, database: BanDatabase): Promise<void> => {
  const token = stringField(context.body, 'token') ?? stringField(context.query, 'token')
  if (!token) return
  const verification = await context.context.internalAdapter.findVerificationValue(`reset-password:${token}`)
  if (!verification || verification.expiresAt <= new Date()) return
  await assertUserIsNotBanned(database, verification.value)
}

const inspectEmailVerificationProof = async (context: GenericEndpointContext, database: BanDatabase): Promise<void> => {
  const token = stringField(context.query, 'token')
  if (!token) return

  let email: string | undefined
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(context.context.secret), { algorithms: ['HS256'] })
    email = stringField(verified.payload, 'email')
  } catch {
    return
  }
  if (!email) return
  const user = await context.context.internalAdapter.findUserByEmail(email)
  if (user) await assertUserIsNotBanned(database, user.user.id)
}

export const createAuthBanBeforeHook = (database: BanDatabase = pool) =>
  createAuthMiddleware(async (context) => {
    assertAuthReturnUrlsDoNotContainUserInfo(context.body, context.query)

    const method = typeof context.method === 'string' ? context.method : undefined
    const policy = resolveRoutePolicy(context.path, method)
    if (!policy) {
      throw APIError.from('INTERNAL_SERVER_ERROR', {
        code: 'AUTH_ROUTE_UNCLASSIFIED',
        message: 'Authentication route policy is not configured',
      })
    }

    if (context.path === '/callback/:id') await inspectOauthCallbackState(context, database)
    if (context.path === '/link-social') await oauthFlowState.set('link')
    if (policy === 'proof_write') {
      if (context.path === '/reset-password') await inspectResetPasswordProof(context, database)
      if (context.path === '/verify-email') await inspectEmailVerificationProof(context, database)
      return
    }

    if (
      policy !== 'internal_session_write' &&
      policy !== 'session_probe' &&
      policy !== 'session_read' &&
      policy !== 'session_write'
    ) {
      return
    }
    const userId = await loadSessionIdentity(context, database)
    if (!userId) return
    const denial = await loadActiveBan(database, userId)
    if (!denial) return
    if (policy === 'session_probe') {
      // Programmatic auth.api.getSession callers need the canonical identity
      // so their surface-specific policy can return a typed write denial or a
      // generic administrator 401. Only the public Better Auth HTTP probe
      // degrades the stale cookie directly to an anonymous null response.
      return context.request ? jsonResponse(null) : undefined
    }
    if (await hasRequestState()) await banDenialState.set(denial)
    throw createAccountBannedApiError(denial)
  })

export const createAuthBanAfterHook = (database: BanDatabase = pool) =>
  createAuthMiddleware(async (context) => {
    let denial = await banDenialState.get()
    if (!denial) {
      const provenUserId = await provenUserIdState.get()
      if (provenUserId) {
        denial = await loadActiveBan(database, provenUserId)
        if (denial) await banDenialState.set(denial)
      }
    }
    if (!denial) return

    if (context.path === '/get-session') {
      if (context.request) {
        await banDenialState.set(null)
        context.context.returned = jsonResponse(null)
      }
      return
    }

    // A Response retains its own 403 status when Better Auth's outer pipeline
    // had already recorded the passkey plugin's replacement 400 status.
    context.context.returned = jsonResponse(denial, 403)
  })

export const authBanAfterHook = createAuthBanAfterHook(pool)

export const createSessionBanHook =
  (database: BanDatabase = pool) =>
  async (session: { readonly userId: string }, context: GenericEndpointContext | null): Promise<void> => {
    await markProvenUserId(session.userId)
    const denial = await loadActiveBan(database, session.userId)
    if (!denial) return
    if (await hasRequestState()) await banDenialState.set(denial)
    if (context?.path === '/passkey/verify-authentication') await rejectPasskeyWithSanitizedError(denial)
    throw createAccountBannedApiError(denial)
  }