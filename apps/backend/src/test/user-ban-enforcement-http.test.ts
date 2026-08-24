import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { lockPostgresUserIdentitiesForModeration } from '../user-identity-advisory-lock.js'

const sentrySpies = vi.hoisted(() => ({
  captureException: vi.fn(),
  metricCount: vi.fn(),
}))

vi.mock('@sentry/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sentry/node')>()
  return {
    ...original,
    captureException: sentrySpies.captureException,
    metrics: {
      ...original.metrics,
      count: sentrySpies.metricCount,
    },
  }
})

// These values are intentionally non-secret test fixtures. Set them before the
// backend is dynamically imported so both OAuth callbacks can reach their ban
// guards without ever making a real provider request.
process.env.LXNS_CLIENT_ID = 'user-ban-http-test-client'
process.env.LXNS_CLIENT_SECRET = 'user-ban-http-test-secret'
process.env.GOOGLE_CLIENT_ID = 'user-ban-http-test-google-client'
process.env.GOOGLE_CLIENT_SECRET = 'user-ban-http-test-google-secret'

type TestSetup = typeof import('./setup.js')
type PromoteFixture = typeof import('./admin-role-fixtures.js').promoteFixtureUserToAdministrator
type AuthBanEnforcement = typeof import('../auth-ban-enforcement.js')

type TestUser = {
  readonly id: string
  readonly cookie: string
  readonly email: string
  readonly password: string
}

type BanFixture = {
  readonly eventId: string
  readonly expiresAt: Date | null
}

type GoogleProfileFixture = {
  readonly email: string
  readonly email_verified: boolean
  readonly name: string
  readonly picture: string
  readonly sub: string
}

type GoogleOauthAttempt = {
  readonly cookie: string
  readonly state: string
}

const PASSWORD = 'password123'
const ADMIN_ACCESS_TEST_BYPASS_HEADER = 'x-dxrating-admin-access-test'
const ADMIN_ACCESS_TEST_BYPASS_SECRET = 'dxrating-test-only-admin-access-proof-2026'
const PUBLIC_ORIGIN = 'http://localhost:5173'
const ADMIN_ORIGIN = 'http://localhost:5174'
const LXNS_ORIGIN = 'https://maimai.lxns.net'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

let setup: TestSetup
let promoteFixtureUserToAdministrator: PromoteFixture
let authBanEnforcement: AuthBanEnforcement
let database: pg.Pool
let moderatorUserId: string
let nativeFetch: typeof globalThis.fetch
const attemptedExternalRequests: string[] = []
const googleProfilesByCode = new Map<string, GoogleProfileFixture>()
const googleTokenRequests: Array<{
  readonly body: URLSearchParams
  readonly url: string
}> = []

const encodeJwtPart = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

const createGoogleIdToken = (profile: GoogleProfileFixture): string =>
  `${encodeJwtPart({ alg: 'none', typ: 'JWT' })}.${encodeJwtPart(profile)}.test-only-signature`

const responseBody = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

const expectSuccessfulResponse = async (response: Response): Promise<void> => {
  const body = await response.clone().text()
  expect(response.status, body).toBe(200)
}

const createUser = async (localPart: string, name = localPart): Promise<TestUser> => {
  const email = `${localPart}@example.com`
  const response = await setup.signUp(email, PASSWORD, name)
  await expectSuccessfulResponse(response)
  const cookie = setup.extractSessionCookie(response)
  expect(cookie).toContain('dxrating.session_token=')

  const result = await database.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  expect(result.rows).toHaveLength(1)
  return { id: result.rows[0]!.id, cookie, email, password: PASSWORD }
}

const extractResponseCookies = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')

const beginGoogleOauth = async (): Promise<GoogleOauthAttempt> => {
  const response = await fetch(`${setup.getBaseUrl()}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: PUBLIC_ORIGIN,
      disableRedirect: true,
    }),
  })
  await expectSuccessfulResponse(response)
  const body = (await response.json()) as {
    readonly redirect: boolean
    readonly url: string
  }
  expect(body.redirect).toBe(false)
  const authorizationUrl = new URL(body.url)
  expect(authorizationUrl.origin).toBe('https://accounts.google.com')
  expect(authorizationUrl.searchParams.get('client_id')).toBe(process.env.GOOGLE_CLIENT_ID)
  expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()

  const state = authorizationUrl.searchParams.get('state')
  expect(state).toBeTruthy()
  const cookie = extractResponseCookies(response)
  expect(cookie).toContain('dxrating.state=')
  return { cookie, state: state! }
}

const insertBanState = async (
  transaction: PoolClient,
  subjectUserId: string,
  reason: string,
  expiresAt: Date | null,
): Promise<BanFixture> => {
  const history = await transaction.query<{
    readonly id: string
    readonly expires_at: Date | null
  }>(
    `INSERT INTO admin_user_ban_history (
       subject_user_id,
       actor_user_id,
       previous_event_id,
       action,
       reason,
       ban_started_at,
       expires_at
     )
     VALUES ($1, $2, NULL, 'ban', $3, clock_timestamp(), $4)
     RETURNING id::text, expires_at`,
    [subjectUserId, moderatorUserId, reason, expiresAt],
  )
  const event = history.rows[0]!

  await transaction.query(
    `INSERT INTO admin_user_ban_state (
       subject_user_id,
       established_action,
       ban_started_at,
       ban_expires_at,
       ban_reason,
       actor_user_id,
       established_by_event_id
     )
     SELECT
       subject_user_id,
       action,
       ban_started_at,
       expires_at,
       reason,
       actor_user_id,
       id
     FROM admin_user_ban_history
     WHERE id = $1`,
    [event.id],
  )
  return { eventId: event.id, expiresAt: event.expires_at }
}

const appendBan = async (subjectUserId: string, reason: string, expiresAt: Date | null): Promise<BanFixture> => {
  const transaction = await database.connect()
  try {
    await transaction.query('BEGIN')
    await lockPostgresUserIdentitiesForModeration(transaction, [subjectUserId, moderatorUserId])
    const lockedUsers = await transaction.query<{ readonly id: string }>(
      `SELECT id
         FROM "user"
        WHERE id = ANY($1::text[])
        ORDER BY id
        FOR UPDATE`,
      [[subjectUserId, moderatorUserId]],
    )
    expect(lockedUsers.rowCount).toBe(2)
    const event = await insertBanState(transaction, subjectUserId, reason, expiresAt)
    await transaction.query('COMMIT')
    return event
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
  }
}

const waitUntilBanExpires = async (subjectUserId: string): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await database.query<{ readonly expired: boolean }>(
      `SELECT ban_expires_at <= clock_timestamp() AS expired
         FROM admin_user_ban_state
        WHERE subject_user_id = $1`,
      [subjectUserId],
    )
    if (result.rows[0]?.expired) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Temporary test ban did not expire')
}

const waitForBlockedGoogleIdentityMutation = async (): Promise<string> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocked = await database.query<{ readonly query: string }>(
      `SELECT activity.query
         FROM pg_stat_activity AS activity
        WHERE activity.datname = current_database()
          AND activity.pid <> pg_backend_pid()
          AND activity.wait_event_type = 'Lock'
          AND (
            activity.query ILIKE '%update "account"%'
            OR activity.query ILIKE '%insert into "session"%'
          )
        ORDER BY activity.query_start
        LIMIT 1`,
    )
    if (blocked.rows[0]) return blocked.rows[0].query
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('OAuth callback did not reach a trigger-protected identity mutation')
}

const waitForBlockedQueryMarker = async (marker: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocked = await database.query<{ readonly blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity AS activity
         WHERE activity.datname = current_database()
           AND activity.pid <> pg_backend_pid()
           AND activity.wait_event_type = 'Lock'
           AND position($1 in activity.query) > 0
       ) AS blocked`,
      [marker],
    )
    if (blocked.rows[0]?.blocked) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Public request did not reach the expected blocked database operation')
}

const expectAuthBan = async (
  response: Response,
  fixture: {
    readonly reason: string
    readonly expiresAt: Date | null
    readonly userId: string
  },
): Promise<void> => {
  expect(response.status).toBe(403)
  expect(setup.extractSessionCookie(response)).toBe('')
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  const body = await responseBody(response)
  expect(body).toEqual({
    code: 'ACCOUNT_BANNED',
    message: 'This account is currently unavailable',
    reason: fixture.reason,
    expiresAt: fixture.expiresAt?.toISOString() ?? null,
  })
  expect(JSON.stringify(body)).not.toContain(fixture.userId)
}

const expectGenericPublicAuthenticationFailure = async (
  response: Response,
  privateValues: readonly string[],
): Promise<void> => {
  expect(response.status).toBe(401)
  const body = await responseBody(response)
  expect(body).toMatchObject({
    defined: true,
    code: 'UNAUTHORIZED',
    status: 401,
  })
  const serialized = JSON.stringify(body)
  expect(serialized).not.toContain('ACCOUNT_BANNED')
  for (const privateValue of privateValues) expect(serialized).not.toContain(privateValue)
}

const withCookie = (cookie: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    ...init.headers,
    Cookie: cookie,
  },
})

const promoteToAdministrator = async (userId: string): Promise<void> => {
  const transaction: PoolClient = await database.connect()
  try {
    await transaction.query('BEGIN')
    await expect(promoteFixtureUserToAdministrator(transaction, userId)).resolves.toMatchObject({
      previousRole: 'user',
      nextRole: 'admin',
    })
    await transaction.query('COMMIT')
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
  }
}

describe('active user-ban HTTP enforcement', () => {
  beforeAll(async () => {
    nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === GOOGLE_TOKEN_ENDPOINT) {
        const request = new Request(input, init)
        const body = new URLSearchParams(await request.text())
        googleTokenRequests.push({ body, url })
        const profile = googleProfilesByCode.get(body.get('code') ?? '')
        if (!profile) {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({
            access_token: `access-token-for-${profile.sub}`,
            expires_in: 3600,
            id_token: createGoogleIdToken(profile),
            refresh_token: `refresh-token-for-${profile.sub}`,
            scope: 'openid email profile',
            token_type: 'Bearer',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.startsWith(LXNS_ORIGIN)) {
        attemptedExternalRequests.push(url)
        return new Response(JSON.stringify({ success: false }), {
          status: 599,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return nativeFetch(input, init)
    })

    setup = await import('./setup.js')
    ;({ promoteFixtureUserToAdministrator } = await import('./admin-role-fixtures.js'))
    authBanEnforcement = await import('../auth-ban-enforcement.js')
    await setup.setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await database?.end()
    await setup?.teardownTestServer()
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    attemptedExternalRequests.length = 0
    googleProfilesByCode.clear()
    googleTokenRequests.length = 0
    sentrySpies.captureException.mockClear()
    sentrySpies.metricCount.mockClear()
    await setup.cleanDatabase()
    moderatorUserId = (await createUser('ban-fixture-moderator', 'Ban Fixture Moderator')).id
  })

  it.each([
    { label: 'permanent', expiresInMs: null },
    { label: 'temporary', expiresInMs: 60 * 60 * 1000 },
  ])('returns the typed self-facing response after a correct password for a $label ban', async ({ expiresInMs }) => {
    const user = await createUser(`password-${expiresInMs === null ? 'permanent' : 'temporary'}`)
    const reason = expiresInMs === null ? 'Permanent password-login ban' : 'Temporary password-login ban'
    const ban = await appendBan(user.id, reason, expiresInMs === null ? null : new Date(Date.now() + expiresInMs))

    const response = await setup.signIn(user.email, user.password)
    await expectAuthBan(response, {
      reason,
      expiresAt: ban.expiresAt,
      userId: user.id,
    })

    const sessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE user_id = $1`,
      [user.id],
    )
    expect(sessions.rows[0]?.count).toBe(0)
  })

  it('keeps wrong-password and unknown-email failures generic without disclosing ban details', async () => {
    const user = await createUser('password-privacy')
    const reason = 'Private moderation reason that must not identify an account'
    await appendBan(user.id, reason, null)

    const wrongPassword = await setup.signIn(user.email, 'definitely-the-wrong-password')
    const unknownEmail = await setup.signIn('unknown-password-user@example.com', 'definitely-the-wrong-password')
    expect(wrongPassword.status).not.toBe(200)
    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(setup.extractSessionCookie(wrongPassword)).toBe('')
    expect(setup.extractSessionCookie(unknownEmail)).toBe('')

    const wrongBody = await responseBody(wrongPassword)
    const unknownBody = await responseBody(unknownEmail)
    expect(wrongBody).toEqual(unknownBody)
    const serialized = JSON.stringify([wrongBody, unknownBody])
    expect(serialized).not.toContain('ACCOUNT_BANNED')
    expect(serialized).not.toContain(reason)
    expect(serialized).not.toContain(user.id)
  })

  it('uses the proven OAuth provider account for a database-backed typed ban denial', async () => {
    const user = await createUser('oauth-provider-account')
    const decoy = await createUser('oauth-email-decoy')
    const providerSubject = 'google-provider-subject-for-ban-test'
    const reason = 'Database-backed OAuth provider-account ban'
    await database.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
       VALUES ('oauth-provider-account-fixture', $1, 'google', $2, clock_timestamp(), clock_timestamp())`,
      [providerSubject, user.id],
    )
    await appendBan(user.id, reason, null)

    const providerProof = vi.fn(async () => ({
      user: {
        id: providerSubject,
        // Deliberately point at another real user: enforcement must resolve
        // the exact provider/account tuple and never infer identity by email.
        email: decoy.email,
      },
      data: { sub: providerSubject },
    }))
    const wrapped = authBanEnforcement.withOauthAccountBanCheck(database, 'google', providerProof)

    await authBanEnforcement.runWithAuthBanRequestState(async () => {
      await expect(wrapped()).rejects.toMatchObject({
        statusCode: 403,
        body: {
          code: 'ACCOUNT_BANNED',
          message: 'This account is currently unavailable',
          reason,
          expiresAt: null,
        },
      })
      await expect(authBanEnforcement.getProvenAuthBanUserId()).resolves.toBe(user.id)
      await expect(authBanEnforcement.getProjectedAuthBanDenial()).resolves.toEqual({
        code: 'ACCOUNT_BANNED',
        message: 'This account is currently unavailable',
        reason,
        expiresAt: null,
      })
    })
    expect(providerProof).toHaveBeenCalledOnce()
    expect(attemptedExternalRequests).toEqual([])
  })

  it('returns a private typed denial from a genuine Google callback only after provider proof', async () => {
    const user = await createUser('google-callback-banned')
    const providerSubject = 'google-callback-banned-subject'
    const authorizationCode = 'google-callback-banned-code'
    const reason = 'Private Google callback moderation reason'
    const expiry = await database.query<{ readonly expires_at: Date }>(
      `SELECT clock_timestamp() + interval '1 hour' AS expires_at`,
    )
    await database.query(
      `INSERT INTO account (
         id, account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, created_at, updated_at
       )
       VALUES (
         'google-callback-banned-account', $1, 'google', $2,
         'original-access', 'original-refresh', 'original-id-token', 'openid',
         clock_timestamp(), clock_timestamp()
       )`,
      [providerSubject, user.id],
    )
    const accountBefore = await database.query(
      `SELECT account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, updated_at
         FROM account
        WHERE id = 'google-callback-banned-account'`,
    )
    const ban = await appendBan(user.id, reason, expiry.rows[0]!.expires_at)
    googleProfilesByCode.set(authorizationCode, {
      email: user.email,
      email_verified: true,
      name: 'Google Callback Banned',
      picture: 'https://images.example.test/google-callback-banned.png',
      sub: providerSubject,
    })

    const attempt = await beginGoogleOauth()
    const callbackUrl = `${setup.getBaseUrl()}/api/auth/callback/google?code=${authorizationCode}&state=${attempt.state}`

    // Possessing an authorization code and state is not account proof without
    // Better Auth's signed state cookie. This request must remain generic and
    // must not even reach Google's token endpoint.
    const unproven = await fetch(callbackUrl, { redirect: 'manual' })
    expect(unproven.status).toBe(302)
    expect(googleTokenRequests).toEqual([])
    const unprovenSurface = JSON.stringify({
      body: await unproven.text(),
      headers: Object.fromEntries(unproven.headers),
    })
    expect(unprovenSurface).not.toContain('ACCOUNT_BANNED')
    expect(unprovenSurface).not.toContain(reason)
    expect(unprovenSurface).not.toContain(user.id)

    const response = await fetch(callbackUrl, {
      headers: { Cookie: attempt.cookie },
      redirect: 'manual',
    })
    await expectAuthBan(response, {
      reason,
      expiresAt: ban.expiresAt,
      userId: user.id,
    })
    expect(googleTokenRequests).toHaveLength(1)
    expect(googleTokenRequests[0]!.body.get('code')).toBe(authorizationCode)
    expect(googleTokenRequests[0]!.body.get('code_verifier')).toBeTruthy()
    expect(googleTokenRequests[0]!.body.get('redirect_uri')).toBe(`${setup.getBaseUrl()}/api/auth/callback/google`)
    expect(JSON.stringify(Object.fromEntries(googleTokenRequests[0]!.body))).not.toContain(reason)
    expect(JSON.stringify(Object.fromEntries(googleTokenRequests[0]!.body))).not.toContain(user.id)

    const accountAfter = await database.query(
      `SELECT account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, updated_at
         FROM account
        WHERE id = 'google-callback-banned-account'`,
    )
    expect(accountAfter.rows).toEqual(accountBefore.rows)
    const sessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE user_id = $1`,
      [user.id],
    )
    expect(sessions.rows).toEqual([{ count: 0 }])
  })

  it('maps a post-proof Google ban race through the database backstop without logging it', async () => {
    const user = await createUser('google-callback-race')
    const providerSubject = 'google-callback-race-subject'
    const authorizationCode = 'google-callback-race-code'
    const reason = 'Post-proof Google callback race restriction'
    await database.query(
      `INSERT INTO account (
         id, account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, created_at, updated_at
       )
       VALUES (
         'google-callback-race-account', $1, 'google', $2,
         'original-access', 'original-refresh', 'original-id-token', 'openid',
         clock_timestamp(), clock_timestamp()
       )`,
      [providerSubject, user.id],
    )
    await database.query(`DELETE FROM session WHERE user_id = $1`, [user.id])
    const accountBefore = await database.query(
      `SELECT account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, updated_at
         FROM account
        WHERE id = 'google-callback-race-account'`,
    )
    googleProfilesByCode.set(authorizationCode, {
      email: user.email,
      email_verified: true,
      name: 'Google Callback Race',
      picture: 'https://images.example.test/google-callback-race.png',
      sub: providerSubject,
    })
    const attempt = await beginGoogleOauth()

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const transaction = await database.connect()
    let callbackPromise: Promise<Response> | undefined
    let committed = false
    let response: Response | undefined
    try {
      await transaction.query('BEGIN')
      await lockPostgresUserIdentitiesForModeration(transaction, [user.id, moderatorUserId])
      const lockedUsers = await transaction.query(
        `SELECT id
           FROM "user"
          WHERE id = ANY($1::text[])
          ORDER BY id
          FOR UPDATE`,
        [[user.id, moderatorUserId]],
      )
      expect(lockedUsers.rowCount).toBe(2)

      callbackPromise = fetch(
        `${setup.getBaseUrl()}/api/auth/callback/google?code=${authorizationCode}&state=${attempt.state}`,
        { headers: { Cookie: attempt.cookie }, redirect: 'manual' },
      )
      const blockedQuery = await waitForBlockedGoogleIdentityMutation()
      expect(blockedQuery.toLowerCase()).toMatch(/update "account"|insert into "session"/)
      expect(googleTokenRequests).toHaveLength(1)

      // The provider identity is now proven and the callback is waiting in the
      // trigger's user-row lease. Commit the ban first; the waiting identity
      // mutation must resume into SQLSTATE DXB01 and be projected by app.ts.
      await insertBanState(transaction, user.id, reason, null)
      await transaction.query('COMMIT')
      committed = true
      response = await callbackPromise
    } finally {
      if (!committed) await transaction.query('ROLLBACK').catch(() => undefined)
      transaction.release()
      if (!response && callbackPromise) await callbackPromise.catch(() => undefined)
    }

    try {
      await expectAuthBan(response!, {
        reason,
        expiresAt: null,
        userId: user.id,
      })
      expect(consoleError).not.toHaveBeenCalled()
      expect(sentrySpies.captureException).not.toHaveBeenCalled()
      const expectedMetrics = sentrySpies.metricCount.mock.calls.filter(([name]) => name === 'auth.account_banned')
      expect(expectedMetrics).toEqual([
        [
          'auth.account_banned',
          1,
          {
            attributes: {
              code: 'ACCOUNT_BANNED',
              flow: 'oauth',
              temporary: 'false',
            },
          },
        ],
      ])
      expect(JSON.stringify(expectedMetrics)).not.toContain(reason)
      expect(JSON.stringify(expectedMetrics)).not.toContain(user.id)
    } finally {
      consoleError.mockRestore()
    }

    const accountAfter = await database.query(
      `SELECT account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, updated_at
         FROM account
        WHERE id = 'google-callback-race-account'`,
    )
    expect(accountAfter.rows).toEqual(accountBefore.rows)
    const sessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE user_id = $1`,
      [user.id],
    )
    expect(sessions.rows).toEqual([{ count: 0 }])
  })

  it('allows a new login after temporary expiry while retaining immutable ban history', async () => {
    const user = await createUser('expired-temporary-ban')
    const reason = 'Short-lived integration-test ban'
    const ban = await appendBan(user.id, reason, new Date(Date.now() + 250))
    await waitUntilBanExpires(user.id)

    const response = await setup.signIn(user.email, user.password)
    await expectSuccessfulResponse(response)
    const replacementCookie = setup.extractSessionCookie(response)
    expect(replacementCookie).toContain('dxrating.session_token=')

    const sessionResponse = await fetch(`${setup.getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: replacementCookie },
    })
    expect(sessionResponse.status).toBe(200)
    await expect(sessionResponse.json()).resolves.toMatchObject({
      user: { id: user.id },
    })

    const persisted = await database.query<{
      readonly history_count: number
      readonly history_reason: string
      readonly history_expiry: Date
      readonly established_action: string
      readonly active: boolean
    }>(
      `SELECT
         count(history.id)::int AS history_count,
         min(history.reason) AS history_reason,
         min(history.expires_at) AS history_expiry,
         min(state.established_action) AS established_action,
         bool_or(
           state.established_action = 'ban'
             AND (state.ban_expires_at IS NULL OR state.ban_expires_at > clock_timestamp())
         ) AS active
       FROM admin_user_ban_history history
       INNER JOIN admin_user_ban_state state ON state.subject_user_id = history.subject_user_id
       WHERE history.subject_user_id = $1`,
      [user.id],
    )
    expect(persisted.rows).toEqual([
      {
        history_count: 1,
        history_reason: reason,
        history_expiry: ban.expiresAt,
        established_action: 'ban',
        active: false,
      },
    ])
  })

  it('returns no moderation reason when a ban wins after a public write proves its session', async () => {
    const user = await createUser('public-write-race')
    const reason = 'Private reason hidden from every public write response'
    const moderation = await database.connect()
    let responsePromise: Promise<Response> | undefined

    try {
      await moderation.query('BEGIN')
      await lockPostgresUserIdentitiesForModeration(moderation, [user.id, moderatorUserId])
      const lockedUsers = await moderation.query(
        `SELECT id
           FROM "user"
          WHERE id = ANY($1::text[])
          ORDER BY id
          FOR UPDATE`,
        [[user.id, moderatorUserId].sort()],
      )
      expect(lockedUsers.rowCount).toBe(2)
      await insertBanState(moderation, user.id, reason, null)

      responsePromise = fetch(`${setup.getBaseUrl()}/api/v1/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: user.cookie,
          Origin: PUBLIC_ORIGIN,
        },
        body: JSON.stringify({
          songId: 'public-write-race-song',
          sheetType: 'dx',
          sheetDifficulty: 'master',
          content: 'This comment must not be persisted',
        }),
      })
      await waitForBlockedQueryMarker('user-identity-advisory-lock:shared')
      await moderation.query('COMMIT')

      const response = await responsePromise
      expect(response.status).toBe(403)
      const body = await responseBody(response)
      expect(body).toMatchObject({
        defined: true,
        code: 'ACCOUNT_BANNED',
        status: 403,
        message: 'This account is banned',
      })
      expect(body).not.toHaveProperty('data')
      expect(body).not.toHaveProperty('reason')
      expect(body).not.toHaveProperty('expiresAt')
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain(reason)
      expect(serialized).not.toContain(user.id)
      await expect(database.query(`SELECT id FROM comments WHERE created_by = $1`, [user.id])).resolves.toMatchObject({
        rows: [],
      })

      const specificationResponse = await fetch(`${setup.getBaseUrl()}/spec.json`)
      expect(specificationResponse.status).toBe(200)
      const specification = (await specificationResponse.json()) as {
        readonly paths: {
          readonly '/comments': {
            readonly post: { readonly responses: { readonly '403': unknown } }
          }
        }
      }
      const publicBanResponseSpecification = JSON.stringify(specification.paths['/comments'].post.responses['403'])
      expect(publicBanResponseSpecification).toContain('ACCOUNT_BANNED')
      expect(publicBanResponseSpecification).not.toContain('reason')
      expect(publicBanResponseSpecification).not.toContain('expiresAt')
    } finally {
      await moderation.query('ROLLBACK').catch(() => undefined)
      moderation.release()
      await Promise.allSettled([responsePromise].filter((promise) => promise !== undefined))
    }
  })

  it('blocks every revoked-session public identity write and the LXNS callback before account side effects', async () => {
    const user = await createUser('live-session-writer')
    const reason = 'Live-session write denial'

    const tag = await database.query<{ readonly id: number }>(
      `WITH inserted_group AS (
         INSERT INTO tag_groups (localized_name, color)
         VALUES ('{"en":"Ban test"}'::jsonb, '#ff0000')
         RETURNING id
       )
       INSERT INTO tags (created_by, localized_name, localized_description, group_id)
       SELECT $1, '{"en":"Ban test tag"}'::jsonb, '{"en":"Guard fixture"}'::jsonb, id
       FROM inserted_group
       RETURNING id::int`,
      [user.id],
    )
    const oauthState = 'lxns-ban-http-state'
    await database.query(`INSERT INTO lxns_oauth_states (state, user_id) VALUES ($1, $2)`, [oauthState, user.id])
    await database.query(
      `INSERT INTO lxns_oauth_tokens (
         user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at
       ) VALUES ($1, 'existing-access', 'existing-refresh', clock_timestamp() + interval '1 day',
                 'read_player', clock_timestamp(), clock_timestamp())`,
      [user.id],
    )

    await appendBan(user.id, reason, null)
    const liveSessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count
         FROM session
        WHERE user_id = $1 AND expires_at > clock_timestamp()`,
      [user.id],
    )
    expect(liveSessions.rows[0]?.count).toBe(0)

    const writes: ReadonlyArray<{
      readonly name: string
      readonly path: string
      readonly init: RequestInit
    }> = [
      {
        name: 'tag attachment',
        path: '/api/v1/tags/attach',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: 'ban-test-song',
            sheetType: 'dx',
            sheetDifficulty: 'master',
            tagId: tag.rows[0]!.id,
          }),
        },
      },
      {
        name: 'comment creation',
        path: '/api/v1/comments',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: 'ban-test-song',
            sheetType: 'dx',
            sheetDifficulty: 'master',
            content: 'This must never be persisted',
          }),
        },
      },
      {
        name: 'alias creation',
        path: '/api/v1/aliases',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: 'ban-test-song',
            name: 'must-not-exist',
          }),
        },
      },
      {
        name: 'LXNS authorization-state creation',
        path: '/api/v1/io/import/lxns/authorize',
        init: { method: 'POST' },
      },
      {
        name: 'LXNS score import',
        path: '/api/v1/io/import/lxns/start',
        init: { method: 'POST' },
      },
      {
        name: 'LXNS disconnect',
        path: '/api/v1/io/import/lxns/disconnect',
        init: { method: 'POST' },
      },
    ]

    for (const write of writes) {
      const response = await fetch(`${setup.getBaseUrl()}${write.path}`, withCookie(user.cookie, write.init))
      await expectGenericPublicAuthenticationFailure(response, [reason, user.id])
    }

    const authenticatedRead = await fetch(`${setup.getBaseUrl()}/api/v1/io/import/lxns/status`, withCookie(user.cookie))
    await expectGenericPublicAuthenticationFailure(authenticatedRead, [reason, user.id])

    const beforeCallback = await database.query<{
      readonly tag_songs: number
      readonly comments: number
      readonly aliases: number
      readonly oauth_states: number
      readonly oauth_tokens: number
      readonly access_token: string
    }>(
      `SELECT
         (SELECT count(*)::int FROM tag_songs WHERE created_by = $1) AS tag_songs,
         (SELECT count(*)::int FROM comments WHERE created_by = $1) AS comments,
         (SELECT count(*)::int FROM song_aliases WHERE created_by = $1) AS aliases,
         (SELECT count(*)::int FROM lxns_oauth_states WHERE user_id = $1) AS oauth_states,
         (SELECT count(*)::int FROM lxns_oauth_tokens WHERE user_id = $1) AS oauth_tokens,
         (SELECT access_token FROM lxns_oauth_tokens WHERE user_id = $1) AS access_token`,
      [user.id],
    )
    expect(beforeCallback.rows).toEqual([
      {
        tag_songs: 0,
        comments: 0,
        aliases: 0,
        oauth_states: 1,
        oauth_tokens: 1,
        access_token: 'existing-access',
      },
    ])

    const authorizationCode = 'private-lxns-authorization-code'
    const callback = await fetch(
      `${setup.getBaseUrl()}/api/v1/io/import/lxns/oauth_callback?code=${authorizationCode}&state=${oauthState}`,
      { redirect: 'manual' },
    )
    expect(callback.status).toBe(302)
    const location = callback.headers.get('Location')
    expect(location).toBeTruthy()
    const resultUrl = new URL(location!)
    expect(Object.fromEntries(resultUrl.searchParams)).toEqual({
      status: 'error',
      error: 'account_banned',
    })
    for (const privateValue of [reason, user.id, authorizationCode, oauthState]) {
      expect(location).not.toContain(privateValue)
      expect(decodeURIComponent(location!)).not.toContain(privateValue)
    }

    const afterCallback = await database.query<{
      readonly oauth_states: number
      readonly oauth_tokens: number
      readonly access_token: string
    }>(
      `SELECT
         (SELECT count(*)::int FROM lxns_oauth_states WHERE user_id = $1) AS oauth_states,
         (SELECT count(*)::int FROM lxns_oauth_tokens WHERE user_id = $1) AS oauth_tokens,
         (SELECT access_token FROM lxns_oauth_tokens WHERE user_id = $1) AS access_token`,
      [user.id],
    )
    // The one-time callback state is consumed as a replay defense, but no
    // provider credential is sent, created, updated, or removed.
    expect(afterCallback.rows).toEqual([{ oauth_states: 0, oauth_tokens: 1, access_token: 'existing-access' }])
    expect(attemptedExternalRequests).toEqual([])
  })

  it('treats revoked cookies as generic authentication failures while keeping public content readable', async () => {
    const user = await createUser('revoked-cookie-reader')
    const retainedContent = 'A retained pre-ban chart comment'
    const reason = 'Reason hidden from stale cookie holders'

    const created = await fetch(
      `${setup.getBaseUrl()}/api/v1/comments`,
      withCookie(user.cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: 'retained-comment-song',
          sheetType: 'dx',
          sheetDifficulty: 'master',
          content: retainedContent,
        }),
      }),
    )
    await expectSuccessfulResponse(created)

    await appendBan(user.id, reason, null)
    const sessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE user_id = $1`,
      [user.id],
    )
    expect(sessions.rows[0]?.count).toBe(0)

    const protectedWrites: ReadonlyArray<{
      readonly path: string
      readonly init: RequestInit
    }> = [
      {
        path: '/api/v1/comments',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: 'retained-comment-song',
            sheetType: 'dx',
            sheetDifficulty: 'master',
            content: 'stale cookie write',
          }),
        },
      },
      { path: '/api/v1/io/import/lxns/authorize', init: { method: 'POST' } },
    ]
    for (const write of protectedWrites) {
      const response = await fetch(`${setup.getBaseUrl()}${write.path}`, withCookie(user.cookie, write.init))
      await expectGenericPublicAuthenticationFailure(response, [reason, user.id])
    }

    const staleSession = await fetch(`${setup.getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: user.cookie },
    })
    expect(staleSession.status).toBe(200)
    expect(await staleSession.json()).toBeNull()

    for (const cookie of [user.cookie, undefined]) {
      const comments = await fetch(
        `${setup.getBaseUrl()}/api/v1/comments?songId=retained-comment-song&sheetType=dx&sheetDifficulty=master`,
        cookie ? { headers: { Cookie: cookie } } : undefined,
      )
      expect(comments.status).toBe(200)
      const body = (await comments.json()) as Array<{
        readonly content: string
      }>
      expect(body).toContainEqual(expect.objectContaining({ content: retainedContent }))
      expect(JSON.stringify(body)).not.toContain(reason)
      expect(JSON.stringify(body)).not.toContain(user.id)
    }

    for (const path of ['/api/v1/tags', '/api/v1/aliases']) {
      const publicRead = await fetch(`${setup.getBaseUrl()}${path}`, {
        headers: { Cookie: user.cookie },
      })
      expect(publicRead.status).toBe(200)
      const serialized = await publicRead.text()
      expect(serialized).not.toContain(reason)
      expect(serialized).not.toContain(user.id)
    }
    expect(attemptedExternalRequests).toEqual([])
  })

  it('denies a banned administrator bootstrap without disclosing moderation state', async () => {
    const administrator = await createUser('banned-administrator')
    await promoteToAdministrator(administrator.id)

    const freshLogin = await setup.signIn(administrator.email, administrator.password)
    await expectSuccessfulResponse(freshLogin)
    const freshCookie = setup.extractSessionCookie(freshLogin)
    expect(freshCookie).toContain('dxrating.session_token=')

    const reason = 'Administrator moderation reason is private'
    await appendBan(administrator.id, reason, null)
    const liveSessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::int AS count
         FROM session
        WHERE user_id = $1 AND expires_at > clock_timestamp()`,
      [administrator.id],
    )
    expect(liveSessions.rows[0]?.count).toBe(0)

    const response = await fetch(`${setup.getBaseUrl()}/api/admin/bootstrap`, {
      headers: {
        Cookie: freshCookie,
        Origin: ADMIN_ORIGIN,
        [ADMIN_ACCESS_TEST_BYPASS_HEADER]: ADMIN_ACCESS_TEST_BYPASS_SECRET,
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await responseBody(response)
    expect(body).toMatchObject({
      defined: true,
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('ACCOUNT_BANNED')
    expect(serialized).not.toContain(reason)
    expect(serialized).not.toContain(administrator.id)

    const publicSessionProbe = await fetch(`${setup.getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: freshCookie, Origin: PUBLIC_ORIGIN },
    })
    expect(publicSessionProbe.status).toBe(200)
    expect(await publicSessionProbe.json()).toBeNull()
  })
})