import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const ORIGIN = 'http://localhost:5173'

const signUp = async () => {
  const email = `${randomUUID()}@example.invalid`
  const response = await fetch(`${getBaseUrl()}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password: 'password123', name: 'Device list fixture' }),
  })
  expect(response.status).toBe(200)
  const { user } = await response.json()
  return { id: user.id as string, email, cookie: extractSessionCookie(response) }
}

const signIn = async (email: string) => {
  const response = await fetch(`${getBaseUrl()}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'User-Agent': 'Second device' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  expect(response.status).toBe(200)
  return extractSessionCookie(response)
}

/** Makes every session of the user older than Better Auth's default `freshAge` (one day). */
const makeSessionsStale = (userId: string) =>
  pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [userId])

const listSessions = (cookie: string) =>
  fetch(`${getBaseUrl()}/api/v1/me/sessions`, { headers: { Cookie: cookie, Origin: ORIGIN } })

const revokeSession = (cookie: string, id: string) =>
  fetch(`${getBaseUrl()}/api/v1/me/sessions/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: ORIGIN },
    body: '{}',
  })

const sessionIdFor = async (userId: string, userAgent: string) => {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM session WHERE user_id = $1 AND user_agent = $2', [
    userId,
    userAgent,
  ])
  expect(rows).toHaveLength(1)
  return rows[0]!.id
}

const sessionIds = async (userId: string) =>
  (await pool.query<{ id: string }>('SELECT id FROM session WHERE user_id = $1 ORDER BY id', [userId])).rows.map(
    (row) => row.id,
  )

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

describe('device sessions', () => {
  it('lists sessions to a session that is no longer fresh, which Better Auth refuses', async () => {
    const user = await signUp()
    await signIn(user.email)
    await makeSessionsStale(user.id)

    const betterAuth = await fetch(`${getBaseUrl()}/api/auth/list-sessions`, {
      headers: { Cookie: user.cookie, Origin: ORIGIN },
    })
    expect(betterAuth.status).toBe(403)
    expect(await betterAuth.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })

    const response = await listSessions(user.cookie)
    expect(response.status).toBe(200)
    const { sessions } = await response.json()
    expect(sessions).toHaveLength(2)
    expect(sessions.map((session: { id: string }) => session.id).sort()).toEqual(await sessionIds(user.id))
    expect(sessions.some((session: { userAgent: string | null }) => session.userAgent === 'Second device')).toBe(true)
  })

  it('never returns session tokens', async () => {
    const user = await signUp()
    const response = await listSessions(user.cookie)
    const body = await response.text()
    const { rows } = await pool.query<{ token: string }>('SELECT token FROM session WHERE user_id = $1', [user.id])
    expect(rows).toHaveLength(1)
    expect(body).not.toContain(rows[0]!.token)
    expect(Object.keys(JSON.parse(body).sessions[0]).sort()).toEqual(
      ['createdAt', 'expiresAt', 'id', 'ipAddress', 'updatedAt', 'userAgent'].sort(),
    )
  })

  it("lists only the caller's unexpired sessions", async () => {
    const user = await signUp()
    const other = await signUp()
    await pool.query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [other.id])
    const second = await signIn(user.email)
    await pool.query(
      "UPDATE session SET expires_at = now() - interval '1 minute' WHERE user_id = $1 AND user_agent = 'Second device'",
      [user.id],
    )
    expect(second).toBeTruthy()

    const { sessions } = await (await listSessions(user.cookie)).json()
    expect(sessions).toHaveLength(1)
  })

  it('rejects requests without a session', async () => {
    expect((await listSessions('')).status).toBe(401)
    expect((await revokeSession('', 'anything')).status).toBe(401)
  })

  it('revokes one of the caller’s sessions by id from a fresh session', async () => {
    const user = await signUp()
    const second = await signIn(user.email)
    const secondId = await sessionIdFor(user.id, 'Second device')

    const response = await revokeSession(user.cookie, secondId)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ revoked: true })
    expect(await sessionIds(user.id)).toHaveLength(1)
    // The revoked device is signed out.
    expect((await listSessions(second)).status).toBe(401)
  })

  it('refuses to revoke from a session that is no longer fresh', async () => {
    const user = await signUp()
    await signIn(user.email)
    const secondId = await sessionIdFor(user.id, 'Second device')
    // Only the caller's session is stale; the device it targets was signed in just now.
    await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE id <> $1 AND user_id = $2", [
      secondId,
      user.id,
    ])

    const response = await revokeSession(user.cookie, secondId)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Session is not fresh',
      data: { reason: 'SESSION_NOT_FRESH' },
    })
    expect(await sessionIds(user.id)).toContain(secondId)
  })

  it("does not revoke another user's session", async () => {
    const user = await signUp()
    const other = await signUp()
    const [otherSessionId] = await sessionIds(other.id)

    const response = await revokeSession(user.cookie, otherSessionId!)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ revoked: false })
    expect(await sessionIds(other.id)).toEqual([otherSessionId])
  })
})