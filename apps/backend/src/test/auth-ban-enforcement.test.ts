import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadPostgresUserBanState } from '../admin/user-ban-store.js'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'

const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const establishBan = async ({
  email,
  reason,
  expiresAt = null,
}: {
  readonly email: string
  readonly reason: string
  readonly expiresAt?: Date | null
}): Promise<string> => {
  const user = await database.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  const userId = user.rows[0]!.id
  const history = await database.query<{
    readonly id: string
    readonly ban_started_at: Date
    readonly expires_at: Date | null
  }>(
    `
      INSERT INTO admin_user_ban_history (
        subject_user_id,
        actor_user_id,
        action,
        reason,
        ban_started_at,
        expires_at
      )
      VALUES ($1, $1, 'ban', $2, NULL, $3)
      RETURNING id::text, ban_started_at, expires_at
    `,
    [userId, reason, expiresAt],
  )
  const event = history.rows[0]!
  await database.query(
    `
      INSERT INTO admin_user_ban_state (
        subject_user_id,
        established_action,
        ban_started_at,
        ban_expires_at,
        ban_reason,
        actor_user_id,
        established_by_event_id
      )
      VALUES ($1, 'ban', $2, $3, $4, $1, $5::bigint)
    `,
    [userId, event.ban_started_at, event.expires_at, reason, event.id],
  )
  return userId
}

const waitForDatabaseExpiry = async (userId: string): Promise<void> => {
  const deadline = Date.now() + 5_000
  while ((await loadPostgresUserBanState(database, userId)).active) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for temporary ban expiry')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('Better Auth active-ban enforcement', () => {
  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(cleanDatabase)

  it('returns the typed current ban only after password proof succeeds', async () => {
    const email = 'password-banned@example.com'
    const password = 'password123'
    await signUp(email, password, 'Password Banned')
    await establishBan({ email, reason: 'Repeated abusive comments' })

    const wrongPassword = await signIn(email, 'wrong-password')
    expect(wrongPassword.status).toBe(401)
    const wrongBody = await wrongPassword.json()
    expect(wrongBody).not.toHaveProperty('reason')
    expect(JSON.stringify(wrongBody)).not.toContain('ACCOUNT_BANNED')
    expect(JSON.stringify(wrongBody)).not.toContain('Repeated abusive comments')

    const proven = await signIn(email, password)
    expect(proven.status).toBe(403)
    await expect(proven.json()).resolves.toEqual({
      code: 'ACCOUNT_BANNED',
      message: 'This account is currently unavailable',
      reason: 'Repeated abusive comments',
      expiresAt: null,
    })
    expect(extractSessionCookie(proven)).toBe('')
  })

  it('degrades a revoked banned cookie to anonymous while blocking mutations and preserving safe sign-out', async () => {
    const email = 'stale-session-banned@example.com'
    const password = 'password123'
    const cookie = extractSessionCookie(await signUp(email, password, 'Original Name'))
    await establishBan({ email, reason: 'Moderation safety restriction' })

    const session = await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
    expect(session.status).toBe(200)
    await expect(session.json()).resolves.toBeNull()

    const update = await fetch(`${getBaseUrl()}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:5173' },
      body: JSON.stringify({ name: 'Forbidden Name' }),
    })
    expect(update.status).toBe(401)
    const updateBody = await update.json()
    expect(updateBody).not.toHaveProperty('reason')
    expect(JSON.stringify(updateBody)).not.toContain('ACCOUNT_BANNED')
    expect(JSON.stringify(updateBody)).not.toContain('Moderation safety restriction')
    const unchanged = await database.query<{ readonly name: string }>(`SELECT name FROM "user" WHERE email = $1`, [
      email,
    ])
    expect(unchanged.rows).toEqual([{ name: 'Original Name' }])

    const signOut = await fetch(`${getBaseUrl()}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:5173' },
      body: '{}',
    })
    expect(signOut.status).toBe(200)
    await expect(signOut.json()).resolves.toEqual({ success: true })
  })

  it('does not disclose ban details to an expired session cookie', async () => {
    const email = 'expired-session-banned@example.com'
    const cookie = extractSessionCookie(await signUp(email, 'password123', 'Expired Session'))
    await database.query(
      `
        UPDATE session
        SET expires_at = clock_timestamp() - interval '1 second'
        WHERE user_id = (SELECT id FROM "user" WHERE email = $1)
      `,
      [email],
    )
    await establishBan({ email, reason: 'Private moderation reason' })

    const update = await fetch(`${getBaseUrl()}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:5173' },
      body: JSON.stringify({ name: 'Forbidden Name' }),
    })
    expect(update.status).toBe(401)
    const body = await update.json()
    expect(body).not.toHaveProperty('reason')
    expect(JSON.stringify(body)).not.toContain('ACCOUNT_BANNED')
    expect(JSON.stringify(body)).not.toContain('Private moderation reason')
  })

  it('permits a new session after PostgreSQL determines a temporary ban has expired', async () => {
    const email = 'temporarily-banned@example.com'
    const password = 'password123'
    await signUp(email, password, 'Temporary Ban')
    const expiry = await database.query<{ readonly expires_at: Date }>(
      `SELECT clock_timestamp() + interval '300 milliseconds' AS expires_at`,
    )
    const userId = await establishBan({
      email,
      reason: 'Short cooling-off period',
      expiresAt: expiry.rows[0]!.expires_at,
    })

    const stillBanned = await signIn(email, password)
    expect(stillBanned.status).toBe(403)
    await expect(stillBanned.json()).resolves.toMatchObject({
      code: 'ACCOUNT_BANNED',
      reason: 'Short cooling-off period',
      expiresAt: expiry.rows[0]!.expires_at.toISOString(),
    })

    await waitForDatabaseExpiry(userId)
    const permitted = await signIn(email, password)
    expect(permitted.status).toBe(200)
    expect(extractSessionCookie(permitted)).toContain('dxrating')

    const history = await database.query<{ readonly count: number }>(
      `SELECT count(*)::integer AS count FROM admin_user_ban_history WHERE subject_user_id = $1`,
      [userId],
    )
    expect(history.rows).toEqual([{ count: 1 }])
  })
})