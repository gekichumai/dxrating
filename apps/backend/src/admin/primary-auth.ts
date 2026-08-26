import { createHash, randomBytes } from 'node:crypto'
import type { AdminPrimaryAuthProvider } from '@gekichumai/admin-contract'

export const ADMIN_PRIMARY_AUTH_WINDOW_SECONDS = 10 * 60
export const ADMIN_PRIMARY_AUTH_OAUTH_ATTEMPT_SECONDS = 10 * 60
export const ADMIN_PRIMARY_AUTH_PASSWORD_ATTEMPT_LIMIT = 5
export const ADMIN_PRIMARY_AUTH_PASSWORD_RATE_WINDOW_SECONDS = 15 * 60

export type AdminPrimaryAuthIdentity = {
  readonly userId: string
  readonly sessionId: string
}

export type AdminPrimaryAuthActor = AdminPrimaryAuthIdentity

export type AdminPrimaryAuthMethod = 'password' | AdminPrimaryAuthProvider

export type AdminPrimaryAuthWindow = {
  readonly expiresAt: Date
}

export type AdminPrimaryAuthLinkedAccount = {
  readonly id: string
  readonly accountId: string
}

export type AdminPrimaryAuthPasswordCredential = {
  readonly id: string
  readonly passwordHash: string
}

export type AdminPrimaryAuthOauthAttempt = {
  readonly stateDigest: string
  readonly userId: string
  readonly sessionId: string
  readonly accountId: string
  readonly provider: AdminPrimaryAuthProvider
  readonly providerAccountId: string
  readonly codeVerifier: string
  readonly nonce: string | null
  readonly redirectUri: string
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly consumedAt: Date
}

export type CreateAdminPrimaryAuthOauthAttempt = Omit<
  AdminPrimaryAuthOauthAttempt,
  'createdAt' | 'expiresAt' | 'consumedAt'
>

export type AdminPrimaryAuthStore = {
  getActiveWindow(identity: AdminPrimaryAuthIdentity): Promise<AdminPrimaryAuthWindow | null>
  getPasswordCredential(userId: string): Promise<AdminPrimaryAuthPasswordCredential | null>
  reservePasswordAttempt(userId: string): Promise<boolean>
  clearPasswordAttempts(userId: string): Promise<void>
  findSingleLinkedOauthAccount(
    userId: string,
    provider: AdminPrimaryAuthProvider,
  ): Promise<AdminPrimaryAuthLinkedAccount | null>
  createOauthAttempt(attempt: CreateAdminPrimaryAuthOauthAttempt): Promise<{
    readonly createdAt: Date
    readonly expiresAt: Date
  }>
  consumeOauthAttempt(input: {
    readonly stateDigest: string
    readonly identity: AdminPrimaryAuthIdentity
    readonly provider: AdminPrimaryAuthProvider
  }): Promise<AdminPrimaryAuthOauthAttempt | null>
  openWindow(input: {
    readonly identity: AdminPrimaryAuthActor
    readonly method: AdminPrimaryAuthMethod
    readonly passwordCredential?: AdminPrimaryAuthPasswordCredential
    readonly linkedAccount?: AdminPrimaryAuthLinkedAccount
  }): Promise<AdminPrimaryAuthWindow | null>
  invalidateSession(sessionId: string): Promise<void>
  invalidateUser(userId: string): Promise<void>
}

export type AdminPrimaryAuthOauthProvider = {
  createAuthorizationUrl(input: {
    readonly state: string
    readonly codeVerifier: string
    readonly nonce: string | null
    readonly redirectUri: string
  }): Promise<URL>
  exchangeAndVerify(input: {
    readonly code: string
    readonly codeVerifier: string
    readonly nonce: string | null
    readonly redirectUri: string
    readonly attemptCreatedAt: Date
    readonly consumedAt: Date
  }): Promise<{ readonly accountId: string }>
}

export type AdminPrimaryAuthFailureCode = 'FAILED' | 'RATE_LIMITED'

export class AdminPrimaryAuthFailure extends Error {
  readonly code: AdminPrimaryAuthFailureCode

  constructor(code: AdminPrimaryAuthFailureCode) {
    super('Administrator primary authentication failed')
    this.name = 'AdminPrimaryAuthFailure'
    this.code = code
  }
}

type AdminPrimaryAuthRandom = (size: number) => string

export type AdminPrimaryAuthService = ReturnType<typeof createAdminPrimaryAuthService>

export const digestAdminPrimaryAuthOauthState = (state: string): string =>
  createHash('sha256').update(state).digest('hex')

const secureRandomBase64Url: AdminPrimaryAuthRandom = (size) => randomBytes(size).toString('base64url')

const isValidCallbackValue = (value: string | null, minimum: number, maximum: number): value is string =>
  value !== null && value.length >= minimum && value.length <= maximum

export const createAdminPrimaryAuthService = ({
  store,
  providers,
  verifyPassword,
  dummyPasswordHash,
  callbackOrigin,
  trustedAdminOrigins,
  random = secureRandomBase64Url,
}: {
  store: AdminPrimaryAuthStore
  providers: Readonly<Partial<Record<AdminPrimaryAuthProvider, AdminPrimaryAuthOauthProvider>>>
  verifyPassword: (input: { password: string; hash: string }) => Promise<boolean>
  dummyPasswordHash: Promise<string>
  callbackOrigin: string
  trustedAdminOrigins: readonly string[]
  random?: AdminPrimaryAuthRandom
}) => {
  const allowedOrigins = new Set(trustedAdminOrigins)

  const getStatus = async (identity: AdminPrimaryAuthIdentity) => {
    const window = await store.getActiveWindow(identity)
    return {
      active: window !== null,
      expiresAt: window?.expiresAt.toISOString() ?? null,
    }
  }

  const completePassword = async (identity: AdminPrimaryAuthActor, password: string) => {
    if (!(await store.reservePasswordAttempt(identity.userId))) {
      throw new AdminPrimaryAuthFailure('RATE_LIMITED')
    }

    const credential = await store.getPasswordCredential(identity.userId)
    const hash = credential?.passwordHash ?? (await dummyPasswordHash)
    let verified = false

    try {
      verified = await verifyPassword({ password, hash })
    } catch {
      verified = false
    }

    if (!verified || credential === null) throw new AdminPrimaryAuthFailure('FAILED')

    const window = await store.openWindow({ identity, method: 'password', passwordCredential: credential })
    if (!window) throw new AdminPrimaryAuthFailure('FAILED')

    await store.clearPasswordAttempts(identity.userId)
    return { completed: true as const, expiresAt: window.expiresAt.toISOString() }
  }

  const initiateOauth = async (
    identity: AdminPrimaryAuthActor,
    providerName: AdminPrimaryAuthProvider,
    requestOrigin: string | undefined,
  ) => {
    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) throw new AdminPrimaryAuthFailure('FAILED')

    const provider = providers[providerName]
    if (!provider) throw new AdminPrimaryAuthFailure('FAILED')

    const linkedAccount = await store.findSingleLinkedOauthAccount(identity.userId, providerName)
    if (!linkedAccount) throw new AdminPrimaryAuthFailure('FAILED')

    const state = random(32)
    const codeVerifier = random(64)
    const nonce = random(32)
    const redirectUri = `${callbackOrigin}/api/admin/primary-auth/oauth/callback/${providerName}`
    const stateDigest = digestAdminPrimaryAuthOauthState(state)

    await store.createOauthAttempt({
      stateDigest,
      ...identity,
      accountId: linkedAccount.id,
      provider: providerName,
      providerAccountId: linkedAccount.accountId,
      codeVerifier,
      nonce,
      redirectUri,
    })

    try {
      const authorizationUrl = await provider.createAuthorizationUrl({
        state,
        codeVerifier,
        nonce,
        redirectUri,
      })
      return { authorizationUrl: authorizationUrl.toString() }
    } catch {
      // The persisted challenge expires quickly and is replaced by the next
      // initiation. Do not surface provider or account configuration details.
      throw new AdminPrimaryAuthFailure('FAILED')
    }
  }

  const completeOauth = async (
    identity: AdminPrimaryAuthActor,
    providerName: AdminPrimaryAuthProvider,
    state: string | null,
    code: string | null,
  ) => {
    if (!isValidCallbackValue(state, 32, 512)) throw new AdminPrimaryAuthFailure('FAILED')

    const attempt = await store.consumeOauthAttempt({
      stateDigest: digestAdminPrimaryAuthOauthState(state),
      identity,
      provider: providerName,
    })
    if (!attempt || !isValidCallbackValue(code, 1, 4096)) throw new AdminPrimaryAuthFailure('FAILED')

    const provider = providers[providerName]
    if (!provider) throw new AdminPrimaryAuthFailure('FAILED')

    let providerIdentity: { readonly accountId: string }
    try {
      providerIdentity = await provider.exchangeAndVerify({
        code,
        codeVerifier: attempt.codeVerifier,
        nonce: attempt.nonce,
        redirectUri: attempt.redirectUri,
        attemptCreatedAt: attempt.createdAt,
        consumedAt: attempt.consumedAt,
      })
    } catch {
      throw new AdminPrimaryAuthFailure('FAILED')
    }

    if (providerIdentity.accountId !== attempt.providerAccountId) {
      throw new AdminPrimaryAuthFailure('FAILED')
    }

    const window = await store.openWindow({
      identity,
      method: providerName,
      linkedAccount: { id: attempt.accountId, accountId: attempt.providerAccountId },
    })
    if (!window) throw new AdminPrimaryAuthFailure('FAILED')

    return { completed: true as const, expiresAt: window.expiresAt.toISOString() }
  }

  return {
    getStatus,
    completePassword,
    initiateOauth,
    completeOauth,
    invalidateSession: (sessionId: string) => store.invalidateSession(sessionId),
    invalidateUser: (userId: string) => store.invalidateUser(userId),
  }
}