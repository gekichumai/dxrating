import {
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TEST_ADMIN_ACCESS_HEADERS } from './admin-access.js'
import { promoteFixtureUserToAdministrator } from './admin-role-fixtures.js'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'

const PASSWORD = 'password123'
const PUBLIC_ORIGIN = 'http://localhost:5173'
const ADMIN_ORIGIN = 'http://localhost:5174'

type TestUser = {
  readonly id: string
  readonly email: string
  readonly cookie: string
}

type BanMutationResponse = AdminContractOutputs['banUser']

type StoredBanHistoryRow = {
  readonly id: string
  readonly subject_user_id: string
  readonly actor_user_id: string
  readonly previous_event_id: string | null
  readonly action: 'ban' | 'unban'
  readonly reason: string | null
  readonly ban_started_at: Date | null
  readonly expires_at: Date | null
  readonly request_correlation_id: string | null
  readonly created_at: Date
}

let database: pg.Pool

const responseBody = async <Body>(response: Response): Promise<Body> => (await response.json()) as Body

const adminRequest = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...TEST_ADMIN_ACCESS_HEADERS,
      Cookie: cookie,
      Origin: ADMIN_ORIGIN,
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ...init.headers,
    },
  })

const createUser = async (email: string, name: string): Promise<TestUser> => {
  const response = await signUp(email, PASSWORD, name)
  const body = await response.clone().text()
  expect(response.status, body).toBe(200)
  const cookie = extractSessionCookie(response)
  expect(cookie).toContain('dxrating.session_token=')

  const user = await database.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  expect(user.rows).toHaveLength(1)
  return { id: user.rows[0]!.id, email, cookie }
}

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

const sessionCount = async (userId: string): Promise<number> => {
  const result = await database.query<{ readonly count: number }>(
    `SELECT count(*)::int AS count FROM session WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]!.count
}

const loadBanHistory = async (userId: string): Promise<readonly StoredBanHistoryRow[]> => {
  const result = await database.query<StoredBanHistoryRow>(
    `SELECT
       id::text,
       subject_user_id,
       actor_user_id,
       previous_event_id::text,
       action,
       reason,
       ban_started_at,
       expires_at,
       request_correlation_id::text,
       created_at
     FROM admin_user_ban_history
     WHERE subject_user_id = $1
     ORDER BY id`,
    [userId],
  )
  return result.rows
}

describe('administrator user-moderation HTTP flow', () => {
  beforeAll(async () => {
    await setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await database?.end()
    await teardownTestServer()
  })

  beforeEach(cleanDatabase)

  it('searches, inspects, bans, and unbans an account through the private administrator API', async () => {
    const administrator = await createUser('moderation-admin@example.com', 'Moderation Administrator')
    await promoteToAdministrator(administrator.id)
    const administratorSignIn = await signIn(administrator.email, PASSWORD)
    expect(administratorSignIn.status).toBe(200)
    const administratorCookie = extractSessionCookie(administratorSignIn)

    const target = await createUser('moderation-target@example.com', 'Moderation Target')
    const targetSecondSignIn = await signIn(target.email, PASSWORD)
    expect(targetSecondSignIn.status).toBe(200)
    const targetSecondCookie = extractSessionCookie(targetSecondSignIn)
    expect(targetSecondCookie).not.toBe(target.cookie)
    expect(await sessionCount(target.id)).toBe(2)

    const searchResponse = await adminRequest('/api/admin/users/search', administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target.email, limit: 10 }),
    })
    expect(searchResponse.status).toBe(200)
    const search = await responseBody<AdminContractOutputs['searchUsers']>(searchResponse)
    expect(search.nextCursor).toBeNull()
    expect(search.items).toEqual([
      {
        userId: target.id,
        displayName: 'Moderation Target',
        email: target.email,
        emailVerified: false,
        effectiveRole: 'user',
        accountStatus: { status: 'active' },
      },
    ])
    expect(Object.keys(search.items[0]!).sort()).toEqual([
      'accountStatus',
      'displayName',
      'effectiveRole',
      'email',
      'emailVerified',
      'userId',
    ])

    const targetPath = `/api/admin/users/${encodeURIComponent(target.id)}`
    const detailResponse = await adminRequest(targetPath, administratorCookie)
    expect(detailResponse.status).toBe(200)
    const detail = await responseBody<Record<string, unknown>>(detailResponse)
    expect(detail).toEqual({
      userId: target.id,
      displayName: 'Moderation Target',
      email: target.email,
      emailVerified: false,
      effectiveRole: 'user',
      banState: {
        status: 'unbanned',
        stateVersion: null,
        reason: null,
        actorUserId: null,
        banStartedAt: null,
        expiresAt: null,
        evaluatedAt: expect.any(String),
      },
    })

    const missingDetail = await adminRequest('/api/admin/users/missing-user-id', administratorCookie)
    expect(missingDetail.status).toBe(404)
    await expect(missingDetail.json()).resolves.toMatchObject({
      defined: true,
      code: 'NOT_FOUND',
      status: 404,
    })

    const privateReason = 'Repeated abusive comments in chart discussions'
    const banInput = {
      kind: 'permanent',
      expectedStateVersion: null,
      reason: privateReason,
    }
    const withoutRecentAuthentication = await adminRequest(`${targetPath}/ban`, administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banInput),
    })
    expect(withoutRecentAuthentication.status).toBe(401)
    await expect(withoutRecentAuthentication.json()).resolves.toMatchObject({
      defined: true,
      code: 'RECENT_AUTH_REQUIRED',
      status: 401,
    })
    expect(await loadBanHistory(target.id)).toEqual([])
    expect(await sessionCount(target.id)).toBe(2)

    const primaryAuthentication = await adminRequest('/api/admin/primary-auth/password', administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    })
    expect(primaryAuthentication.status).toBe(200)
    await expect(primaryAuthentication.json()).resolves.toMatchObject({
      completed: true,
    })

    const banResponse = await adminRequest(`${targetPath}/ban`, administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banInput),
    })
    const banResponseText = await banResponse.clone().text()
    expect(banResponse.status, banResponseText).toBe(200)
    const ban = await responseBody<BanMutationResponse>(banResponse)
    expect(ban).toEqual({
      state: {
        status: 'permanent',
        stateVersion: expect.stringMatching(/^[1-9]\d*$/),
        reason: privateReason,
        actorUserId: administrator.id,
        banStartedAt: expect.any(String),
        expiresAt: null,
        evaluatedAt: expect.any(String),
      },
      event: {
        id: expect.stringMatching(/^[1-9]\d*$/),
        subjectUserId: target.id,
        actorUserId: administrator.id,
        previousEventId: null,
        action: 'ban',
        kind: 'permanent',
        reason: privateReason,
        banStartedAt: expect.any(String),
        expiresAt: null,
        createdAt: expect.any(String),
      },
    })
    expect(ban.state.stateVersion).toBe(ban.event.id)
    expect(ban.state.banStartedAt).toBe(ban.event.banStartedAt)
    const requestId = banResponse.headers.get('X-DXRating-Request-ID')
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(banResponseText).not.toContain('revokedSessionCount')
    expect(banResponseText).not.toContain('requestCorrelationId')
    expect(banResponseText).not.toContain(requestId!)

    const historyAfterBan = await loadBanHistory(target.id)
    expect(historyAfterBan).toHaveLength(1)
    const originalBanEvent = historyAfterBan[0]!
    expect(originalBanEvent).toMatchObject({
      id: ban.event.id,
      subject_user_id: target.id,
      actor_user_id: administrator.id,
      previous_event_id: null,
      action: 'ban',
      reason: privateReason,
      expires_at: null,
      request_correlation_id: requestId,
    })
    expect(originalBanEvent.ban_started_at?.toISOString()).toBe(ban.event.banStartedAt)

    const committedState = await database.query<{
      readonly established_action: string
      readonly established_by_event_id: string
      readonly ban_reason: string | null
      readonly actor_user_id: string
      readonly sessions: number
    }>(
      `SELECT
         state.established_action,
         state.established_by_event_id::text,
         state.ban_reason,
         state.actor_user_id,
         (SELECT count(*)::int FROM session WHERE user_id = state.subject_user_id) AS sessions
       FROM admin_user_ban_state state
       WHERE state.subject_user_id = $1`,
      [target.id],
    )
    expect(committedState.rows).toEqual([
      {
        established_action: 'ban',
        established_by_event_id: ban.event.id,
        ban_reason: privateReason,
        actor_user_id: administrator.id,
        sessions: 0,
      },
    ])

    const staleCookieWrite = await fetch(`${getBaseUrl()}/api/v1/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: target.cookie,
        Origin: PUBLIC_ORIGIN,
      },
      body: JSON.stringify({
        songId: 'admin-moderation-http-song',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'This stale session must not write',
      }),
    })
    expect(staleCookieWrite.status).toBe(401)
    const staleCookieBody = await responseBody<Record<string, unknown>>(staleCookieWrite)
    expect(staleCookieBody).toMatchObject({
      defined: true,
      code: 'UNAUTHORIZED',
      status: 401,
    })
    const serializedStaleFailure = JSON.stringify(staleCookieBody)
    expect(serializedStaleFailure).not.toContain('ACCOUNT_BANNED')
    expect(serializedStaleFailure).not.toContain(privateReason)
    expect(serializedStaleFailure).not.toContain(target.id)
    await expect(database.query(`SELECT id FROM comments WHERE created_by = $1`, [target.id])).resolves.toMatchObject({
      rows: [],
    })

    const unbanResponse = await adminRequest(`${targetPath}/unban`, administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStateVersion: ban.event.id }),
    })
    const unbanResponseText = await unbanResponse.clone().text()
    expect(unbanResponse.status, unbanResponseText).toBe(200)
    const unban = await responseBody<BanMutationResponse>(unbanResponse)
    expect(unban).toEqual({
      state: {
        status: 'unbanned',
        stateVersion: expect.stringMatching(/^[1-9]\d*$/),
        reason: null,
        actorUserId: administrator.id,
        banStartedAt: null,
        expiresAt: null,
        evaluatedAt: expect.any(String),
      },
      event: {
        id: expect.stringMatching(/^[1-9]\d*$/),
        subjectUserId: target.id,
        actorUserId: administrator.id,
        previousEventId: ban.event.id,
        action: 'unban',
        kind: null,
        reason: null,
        banStartedAt: null,
        expiresAt: null,
        createdAt: expect.any(String),
      },
    })
    expect(unban.state.stateVersion).toBe(unban.event.id)
    expect(unbanResponseText).not.toContain('revokedSessionCount')
    expect(unbanResponseText).not.toContain('requestCorrelationId')

    const historyAfterUnban = await loadBanHistory(target.id)
    expect(historyAfterUnban).toHaveLength(2)
    expect(historyAfterUnban[0]).toEqual(originalBanEvent)
    expect(historyAfterUnban[1]).toMatchObject({
      id: unban.event.id,
      subject_user_id: target.id,
      actor_user_id: administrator.id,
      previous_event_id: ban.event.id,
      action: 'unban',
      reason: null,
      ban_started_at: null,
      expires_at: null,
      request_correlation_id: unbanResponse.headers.get('X-DXRating-Request-ID'),
    })
    expect(await sessionCount(target.id)).toBe(0)

    for (const staleCookie of [target.cookie, targetSecondCookie]) {
      const staleSession = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
        headers: { Cookie: staleCookie, Origin: PUBLIC_ORIGIN },
      })
      expect(staleSession.status).toBe(200)
      expect(await staleSession.json()).toBeNull()
    }

    const historyResponse = await adminRequest(`${targetPath}/ban-history?limit=10`, administratorCookie)
    expect(historyResponse.status).toBe(200)
    await expect(historyResponse.json()).resolves.toEqual({
      items: [unban.event, ban.event],
      nextCursor: null,
    })

    const repeatedUnban = await adminRequest(`${targetPath}/unban`, administratorCookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStateVersion: unban.event.id }),
    })
    expect(repeatedUnban.status).toBe(409)
    await expect(repeatedUnban.json()).resolves.toMatchObject({
      defined: true,
      code: 'CONFLICT',
      status: 409,
    })
    expect(await loadBanHistory(target.id)).toEqual(historyAfterUnban)
    expect(await sessionCount(target.id)).toBe(0)
  })
})