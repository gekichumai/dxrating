import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_PRIMARY_AUTH_OAUTH_ATTEMPT_SECONDS,
  ADMIN_PRIMARY_AUTH_WINDOW_SECONDS,
  AdminPrimaryAuthFailure,
  createAdminPrimaryAuthService,
  digestAdminPrimaryAuthOauthState,
  type AdminPrimaryAuthActor,
  type AdminPrimaryAuthOauthAttempt,
  type AdminPrimaryAuthOauthProvider,
  type AdminPrimaryAuthStore,
  type CreateAdminPrimaryAuthOauthAttempt,
} from './primary-auth.js'

const ADMIN_ORIGIN = 'https://admin.example.com'
const CALLBACK_ORIGIN = 'https://api.example.com'
const PASSWORD_HASH = 'real-password-hash'
const DUMMY_PASSWORD_HASH = 'fixed-dummy-password-hash'

const actor: AdminPrimaryAuthActor = {
  userId: 'admin-user-id',
  sessionId: 'admin-session-id',
}

type StoredOauthAttempt = Omit<AdminPrimaryAuthOauthAttempt, 'consumedAt'>

const createHarness = ({
  passwordHash = PASSWORD_HASH as string | null,
  passwordAttemptAllowed = true,
  linkedAccount = { id: 'linked-account-row-id', accountId: 'provider-account-id' } as {
    id: string
    accountId: string
  } | null,
  providerAccountId = 'provider-account-id',
  providerFailure,
  passwordVerified = true,
}: {
  passwordHash?: string | null
  passwordAttemptAllowed?: boolean
  linkedAccount?: { id: string; accountId: string } | null
  providerAccountId?: string
  providerFailure?: Error
  passwordVerified?: boolean
} = {}) => {
  let now = new Date('2026-08-24T12:00:00.000Z')
  let activeWindow: { expiresAt: Date } | null = null
  const attempts = new Map<string, StoredOauthAttempt>()
  const randomValues = [
    'state-value-'.padEnd(43, 's'),
    'verifier-value-'.padEnd(64, 'v'),
    'nonce-value-'.padEnd(43, 'n'),
  ]

  const getActiveWindow = vi.fn(async (identity: { userId: string; sessionId: string }) => {
    if (
      identity.userId !== actor.userId ||
      identity.sessionId !== actor.sessionId ||
      !activeWindow ||
      activeWindow.expiresAt.getTime() <= now.getTime()
    ) {
      return null
    }
    return activeWindow
  })
  const getPasswordCredential = vi.fn(async () =>
    passwordHash === null ? null : { id: 'credential-account-row-id', passwordHash },
  )
  const reservePasswordAttempt = vi.fn(async () => passwordAttemptAllowed)
  const clearPasswordAttempts = vi.fn(async () => undefined)
  const findSingleLinkedOauthAccount = vi.fn(async () => linkedAccount)
  const createOauthAttempt = vi.fn(async (attempt: CreateAdminPrimaryAuthOauthAttempt) => {
    const createdAt = new Date(now)
    const expiresAt = new Date(now.getTime() + ADMIN_PRIMARY_AUTH_OAUTH_ATTEMPT_SECONDS * 1_000)
    attempts.set(attempt.stateDigest, { ...attempt, createdAt, expiresAt })
    return { createdAt, expiresAt }
  })
  const consumeOauthAttempt = vi.fn(
    async ({
      stateDigest,
      identity,
      provider,
    }: {
      stateDigest: string
      identity: { userId: string; sessionId: string }
      provider: 'google'
    }) => {
      const attempt = attempts.get(stateDigest)
      if (
        !attempt ||
        attempt.userId !== identity.userId ||
        attempt.sessionId !== identity.sessionId ||
        attempt.provider !== provider ||
        attempt.expiresAt.getTime() <= now.getTime()
      ) {
        return null
      }

      // Delete before returning so two callbacks racing in the same turn cannot
      // both obtain the one-time challenge.
      attempts.delete(stateDigest)
      return { ...attempt, consumedAt: new Date(now) }
    },
  )
  const openWindow = vi.fn(
    async ({
      identity,
    }: {
      identity: AdminPrimaryAuthActor
      method: 'password' | 'google'
      linkedAccount?: { id: string; accountId: string }
    }) => {
      if (identity.userId !== actor.userId || identity.sessionId !== actor.sessionId) return null
      activeWindow = {
        expiresAt: new Date(now.getTime() + ADMIN_PRIMARY_AUTH_WINDOW_SECONDS * 1_000),
      }
      return activeWindow
    },
  )
  const invalidateSession = vi.fn(async () => {
    activeWindow = null
  })
  const invalidateUser = vi.fn(async () => {
    activeWindow = null
  })

  const store = {
    getActiveWindow,
    getPasswordCredential,
    reservePasswordAttempt,
    clearPasswordAttempts,
    findSingleLinkedOauthAccount,
    createOauthAttempt,
    consumeOauthAttempt,
    openWindow,
    invalidateSession,
    invalidateUser,
  } satisfies AdminPrimaryAuthStore

  const verifyPassword = vi.fn(async () => passwordVerified)
  const oauthProvider: AdminPrimaryAuthOauthProvider = {
    createAuthorizationUrl: vi.fn(
      async ({ state }) => new URL(`https://provider.example/authorize?state=${encodeURIComponent(state)}`),
    ),
    exchangeAndVerify: vi.fn(async () => {
      if (providerFailure) throw providerFailure
      return { accountId: providerAccountId }
    }),
  }
  const service = createAdminPrimaryAuthService({
    store,
    providers: { google: oauthProvider },
    verifyPassword,
    dummyPasswordHash: Promise.resolve(DUMMY_PASSWORD_HASH),
    callbackOrigin: CALLBACK_ORIGIN,
    trustedAdminOrigins: [ADMIN_ORIGIN],
    random: () => {
      const value = randomValues.shift()
      if (!value) throw new Error('test random sequence exhausted')
      return value
    },
  })

  return {
    service,
    store,
    oauthProvider,
    verifyPassword,
    attempts,
    get now() {
      return now
    },
    setNow(value: Date) {
      now = value
    },
    get activeWindow() {
      return activeWindow
    },
  }
}

const expectPrimaryAuthFailure = async (promise: Promise<unknown>, code: 'FAILED' | 'RATE_LIMITED' = 'FAILED') => {
  let failure: unknown
  try {
    await promise
  } catch (error) {
    failure = error
  }

  expect(failure).toBeInstanceOf(AdminPrimaryAuthFailure)
  expect(failure).toMatchObject({
    code,
    message: 'Administrator primary authentication failed',
  })
  return failure as AdminPrimaryAuthFailure
}

describe('administrator primary-auth password ceremony', () => {
  it('opens an absolute ten-minute window and clears failed-attempt state after a valid password', async () => {
    const harness = createHarness()

    await expect(harness.service.completePassword(actor, 'correct password')).resolves.toEqual({
      completed: true,
      expiresAt: '2026-08-24T12:10:00.000Z',
    })
    expect(harness.store.reservePasswordAttempt).toHaveBeenCalledWith(actor.userId)
    expect(harness.store.getPasswordCredential).toHaveBeenCalledWith(actor.userId)
    expect(harness.verifyPassword).toHaveBeenCalledOnce()
    expect(harness.verifyPassword).toHaveBeenCalledWith({ password: 'correct password', hash: PASSWORD_HASH })
    expect(harness.store.openWindow).toHaveBeenCalledWith({
      identity: actor,
      method: 'password',
      passwordCredential: { id: 'credential-account-row-id', passwordHash: PASSWORD_HASH },
    })
    expect(harness.store.clearPasswordAttempts).toHaveBeenCalledWith(actor.userId)
  })

  it('does one password verification for both a wrong password and a missing credential', async () => {
    const wrongPassword = createHarness({ passwordVerified: false })
    const missingCredential = createHarness({ passwordHash: null, passwordVerified: false })

    await expectPrimaryAuthFailure(wrongPassword.service.completePassword(actor, 'candidate password'))
    await expectPrimaryAuthFailure(missingCredential.service.completePassword(actor, 'candidate password'))

    expect(wrongPassword.verifyPassword).toHaveBeenCalledTimes(1)
    expect(wrongPassword.verifyPassword).toHaveBeenCalledWith({
      password: 'candidate password',
      hash: PASSWORD_HASH,
    })
    expect(missingCredential.verifyPassword).toHaveBeenCalledTimes(1)
    expect(missingCredential.verifyPassword).toHaveBeenCalledWith({
      password: 'candidate password',
      hash: DUMMY_PASSWORD_HASH,
    })
    expect(wrongPassword.store.openWindow).not.toHaveBeenCalled()
    expect(missingCredential.store.openWindow).not.toHaveBeenCalled()
    expect(wrongPassword.store.clearPasswordAttempts).not.toHaveBeenCalled()
    expect(missingCredential.store.clearPasswordAttempts).not.toHaveBeenCalled()
  })

  it('still fails generically when the password verifier throws', async () => {
    const harness = createHarness()
    harness.verifyPassword.mockRejectedValueOnce(new Error('bcrypt implementation detail'))

    const failure = await expectPrimaryAuthFailure(harness.service.completePassword(actor, 'candidate password'))
    expect(String(failure)).not.toContain('bcrypt')
    expect(harness.verifyPassword).toHaveBeenCalledOnce()
    expect(harness.store.openWindow).not.toHaveBeenCalled()
  })

  it('rejects a rate-limited attempt before loading a hash or performing expensive verification', async () => {
    const harness = createHarness({ passwordAttemptAllowed: false })

    await expectPrimaryAuthFailure(harness.service.completePassword(actor, 'candidate password'), 'RATE_LIMITED')
    expect(harness.store.getPasswordCredential).not.toHaveBeenCalled()
    expect(harness.verifyPassword).not.toHaveBeenCalled()
    expect(harness.store.openWindow).not.toHaveBeenCalled()
  })

  it('reports the stored expiry without sliding or reopening the primary-auth window', async () => {
    const harness = createHarness()
    await harness.service.completePassword(actor, 'correct password')
    harness.store.openWindow.mockClear()

    await expect(harness.service.getStatus(actor)).resolves.toEqual({
      active: true,
      expiresAt: '2026-08-24T12:10:00.000Z',
    })
    harness.setNow(new Date('2026-08-24T12:09:59.999Z'))
    await expect(harness.service.getStatus(actor)).resolves.toEqual({
      active: true,
      expiresAt: '2026-08-24T12:10:00.000Z',
    })
    expect(harness.store.openWindow).not.toHaveBeenCalled()

    harness.setNow(new Date('2026-08-24T12:10:00.000Z'))
    await expect(harness.service.getStatus(actor)).resolves.toEqual({ active: false, expiresAt: null })
  })
})

describe('administrator primary-auth OAuth ceremony', () => {
  it('creates a one-time challenge only for the already-linked account and exact trusted origin', async () => {
    const harness = createHarness()
    const state = 'state-value-'.padEnd(43, 's')
    const verifier = 'verifier-value-'.padEnd(64, 'v')
    const nonce = 'nonce-value-'.padEnd(43, 'n')

    await expect(harness.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)).resolves.toEqual({
      authorizationUrl: `https://provider.example/authorize?state=${state}`,
    })
    expect(harness.store.findSingleLinkedOauthAccount).toHaveBeenCalledWith(actor.userId, 'google')
    expect(harness.store.createOauthAttempt).toHaveBeenCalledWith({
      stateDigest: digestAdminPrimaryAuthOauthState(state),
      ...actor,
      accountId: 'linked-account-row-id',
      provider: 'google',
      providerAccountId: 'provider-account-id',
      codeVerifier: verifier,
      nonce,
      redirectUri: `${CALLBACK_ORIGIN}/api/admin/primary-auth/oauth/callback/google`,
    })
    expect(harness.oauthProvider.createAuthorizationUrl).toHaveBeenCalledWith({
      state,
      codeVerifier: verifier,
      nonce,
      redirectUri: `${CALLBACK_ORIGIN}/api/admin/primary-auth/oauth/callback/google`,
    })
  })

  it('rejects an untrusted or missing browser origin and an unlinked provider account', async () => {
    for (const origin of [undefined, 'https://admin.example.com.evil.example']) {
      const harness = createHarness()
      await expectPrimaryAuthFailure(harness.service.initiateOauth(actor, 'google', origin))
      expect(harness.store.findSingleLinkedOauthAccount).not.toHaveBeenCalled()
      expect(harness.store.createOauthAttempt).not.toHaveBeenCalled()
    }

    const unlinked = createHarness({ linkedAccount: null })
    await expectPrimaryAuthFailure(unlinked.service.initiateOauth(actor, 'google', ADMIN_ORIGIN))
    expect(unlinked.store.createOauthAttempt).not.toHaveBeenCalled()
    expect(unlinked.oauthProvider.createAuthorizationUrl).not.toHaveBeenCalled()
  })

  it('opens a window only when the callback resolves to the exact account captured at initiation', async () => {
    const harness = createHarness()
    const state = 'state-value-'.padEnd(43, 's')
    await harness.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)

    await expect(harness.service.completeOauth(actor, 'google', state, 'authorization-code')).resolves.toEqual({
      completed: true,
      expiresAt: '2026-08-24T12:10:00.000Z',
    })
    expect(harness.oauthProvider.exchangeAndVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'authorization-code',
        nonce: 'nonce-value-'.padEnd(43, 'n'),
        redirectUri: `${CALLBACK_ORIGIN}/api/admin/primary-auth/oauth/callback/google`,
      }),
    )
    expect(harness.store.openWindow).toHaveBeenCalledWith({
      identity: actor,
      method: 'google',
      linkedAccount: { id: 'linked-account-row-id', accountId: 'provider-account-id' },
    })
  })

  it('rejects provider account switching after consuming the one-time challenge', async () => {
    const harness = createHarness({ providerAccountId: 'different-provider-account-id' })
    const state = 'state-value-'.padEnd(43, 's')
    await harness.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)

    await expectPrimaryAuthFailure(harness.service.completeOauth(actor, 'google', state, 'authorization-code'))
    expect(harness.store.openWindow).not.toHaveBeenCalled()
    await expectPrimaryAuthFailure(harness.service.completeOauth(actor, 'google', state, 'authorization-code'))
    expect(harness.oauthProvider.exchangeAndVerify).toHaveBeenCalledOnce()
  })

  it('binds challenges to the initiating session and rejects expired or replayed callbacks', async () => {
    const state = 'state-value-'.padEnd(43, 's')

    const wrongSession = createHarness()
    await wrongSession.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)
    await expectPrimaryAuthFailure(
      wrongSession.service.completeOauth({ ...actor, sessionId: 'other-session' }, 'google', state, 'code'),
    )
    expect(wrongSession.oauthProvider.exchangeAndVerify).not.toHaveBeenCalled()

    const expired = createHarness()
    await expired.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)
    expired.setNow(new Date(expired.now.getTime() + ADMIN_PRIMARY_AUTH_OAUTH_ATTEMPT_SECONDS * 1_000))
    await expectPrimaryAuthFailure(expired.service.completeOauth(actor, 'google', state, 'code'))
    expect(expired.oauthProvider.exchangeAndVerify).not.toHaveBeenCalled()

    const replay = createHarness()
    await replay.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)
    await expect(replay.service.completeOauth(actor, 'google', state, 'code')).resolves.toMatchObject({
      completed: true,
    })
    await expectPrimaryAuthFailure(replay.service.completeOauth(actor, 'google', state, 'code'))
    expect(replay.oauthProvider.exchangeAndVerify).toHaveBeenCalledOnce()
  })

  it('allows exactly one winner when duplicate callbacks arrive concurrently', async () => {
    const harness = createHarness()
    const state = 'state-value-'.padEnd(43, 's')
    await harness.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)

    const outcomes = await Promise.allSettled([
      harness.service.completeOauth(actor, 'google', state, 'first-code'),
      harness.service.completeOauth(actor, 'google', state, 'second-code'),
    ])

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'FAILED' }),
    })
    expect(harness.oauthProvider.exchangeAndVerify).toHaveBeenCalledOnce()
    expect(harness.store.openWindow).toHaveBeenCalledOnce()
  })

  it('converts raw provider failures to the same safe failure without exposing tokens or response details', async () => {
    const secret = 'raw-provider-token-that-must-not-escape'
    const harness = createHarness({ providerFailure: new Error(`provider response contained ${secret}`) })
    const state = 'state-value-'.padEnd(43, 's')
    await harness.service.initiateOauth(actor, 'google', ADMIN_ORIGIN)

    const failure = await expectPrimaryAuthFailure(
      harness.service.completeOauth(actor, 'google', state, 'authorization-code'),
    )
    expect(JSON.stringify(failure)).not.toContain(secret)
    expect(String(failure)).not.toContain(secret)
    expect(harness.store.openWindow).not.toHaveBeenCalled()
  })
})