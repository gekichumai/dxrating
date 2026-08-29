import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'

describe('Account deletion', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  it('permanently deletes the account and permits signing up again', async () => {
    await signUp('delete@example.com', 'password123', 'Delete Me')
    await signUp('survivor@example.com', 'password123', 'Survivor')
    const signInResponse = await signIn('delete@example.com', 'password123')
    const cookie = extractSessionCookie(signInResponse)

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const users = await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM "user" WHERE email IN ('delete@example.com', 'survivor@example.com')`,
      )
      const deletedUserId = users.rows.find((user) => user.email === 'delete@example.com')!.id
      const survivorId = users.rows.find((user) => user.email === 'survivor@example.com')!.id

      await seedUserData(pool, deletedUserId, survivorId)

      const response = await authenticatedFetch(`${getBaseUrl()}/api/auth/delete-user`, cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ success: true, message: 'User deleted' })

      const deletionCounts = await pool.query<{
        users: string
        accounts: string
        sessions: string
        passkeys: string
        profiles: string
        comments: string
        tags: string
        tag_songs: string
        aliases: string
        lxns_states: string
        lxns_tokens: string
        verifications: string
      }>(
        `SELECT
          (SELECT count(*) FROM "user" WHERE id = $1) AS users,
          (SELECT count(*) FROM account WHERE user_id = $1) AS accounts,
          (SELECT count(*) FROM session WHERE user_id = $1) AS sessions,
          (SELECT count(*) FROM passkey WHERE user_id = $1) AS passkeys,
          (SELECT count(*) FROM profiles WHERE id = $1) AS profiles,
          (SELECT count(*) FROM comments WHERE created_by = $1) AS comments,
          (SELECT count(*) FROM tags WHERE created_by = $1) AS tags,
          (SELECT count(*) FROM tag_songs WHERE created_by = $1) AS tag_songs,
          (SELECT count(*) FROM song_aliases WHERE created_by = $1) AS aliases,
          (SELECT count(*) FROM lxns_oauth_states WHERE user_id = $1) AS lxns_states,
          (SELECT count(*) FROM lxns_oauth_tokens WHERE user_id = $1) AS lxns_tokens,
          (SELECT count(*) FROM verification WHERE value = $1) AS verifications`,
        [deletedUserId],
      )
      expect(deletionCounts.rows[0]).toEqual({
        users: '0',
        accounts: '0',
        sessions: '0',
        passkeys: '0',
        profiles: '0',
        comments: '0',
        tags: '0',
        tag_songs: '0',
        aliases: '0',
        lxns_states: '0',
        lxns_tokens: '0',
        verifications: '0',
      })

      const reply = await pool.query<{ parent_id: number | null }>(
        `SELECT parent_id FROM comments WHERE content = 'Surviving reply'`,
      )
      expect(reply.rows).toEqual([{ parent_id: null }])

      const oldSession = await authenticatedFetch(`${getBaseUrl()}/api/auth/get-session`, cookie)
      expect(await oldSession.json()).toBeNull()

      const replacement = await signUp('delete@example.com', 'password123', 'Replacement')
      expect(replacement.status).toBe(200)
    } finally {
      await pool.end()
    }
  })

  it('rejects deletion when the password is incorrect', async () => {
    await signUp('delete@example.com', 'password123', 'Delete Me')
    const signInResponse = await signIn('delete@example.com', 'password123')
    const cookie = extractSessionCookie(signInResponse)

    const response = await authenticatedFetch(`${getBaseUrl()}/api/auth/delete-user`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect-password' }),
    })

    expect(response.status).toBe(400)

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const user = await pool.query(`SELECT id FROM "user" WHERE email = 'delete@example.com'`)
      expect(user.rowCount).toBe(1)
    } finally {
      await pool.end()
    }
  })
})

async function seedUserData(pool: pg.Pool, deletedUserId: string, survivorId: string) {
  await pool.query(`INSERT INTO profiles (id, display_name) VALUES ($1, 'Delete Me')`, [deletedUserId])
  await pool.query(
    `INSERT INTO passkey
      (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, aaguid)
     VALUES ('passkey-delete', 'Delete', 'public-key', $1, 'credential-delete', 0, 'singleDevice', false, '', '')`,
    [deletedUserId],
  )
  await pool.query(`INSERT INTO lxns_oauth_states (state, user_id) VALUES ('delete-state', $1)`, [deletedUserId])
  await pool.query(
    `INSERT INTO lxns_oauth_tokens
      (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, 'lxns-access', 'lxns-refresh', now() + interval '1 hour', 'read')`,
    [deletedUserId],
  )
  await pool.query(
    `INSERT INTO verification (id, identifier, value, expires_at)
     VALUES ('verification-delete', 'reset-password:token', $1, now() + interval '1 hour')`,
    [deletedUserId],
  )

  const tagGroup = await pool.query<{ id: number }>(
    `INSERT INTO tag_groups (localized_name, color) VALUES ('{"en":"Test"}', '#000000') RETURNING id`,
  )
  const tag = await pool.query<{ id: number }>(
    `INSERT INTO tags (created_by, localized_name, localized_description, group_id)
     VALUES ($1, '{"en":"Delete"}', '{"en":"Delete"}', $2) RETURNING id`,
    [deletedUserId, tagGroup.rows[0]!.id],
  )
  await pool.query(
    `INSERT INTO tag_songs (tag_id, song_id, sheet_type, sheet_difficulty, created_by)
     VALUES ($1, 'song', 'dx', 'master', $2)`,
    [tag.rows[0]!.id, deletedUserId],
  )
  await pool.query(`INSERT INTO song_aliases (song_id, name, created_by) VALUES ('song', 'Deleted alias', $1)`, [
    deletedUserId,
  ])

  const parent = await pool.query<{ id: number }>(
    `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
     VALUES ($1, 'song', 'dx', 'master', 'Deleted comment') RETURNING id`,
    [deletedUserId],
  )
  await pool.query(
    `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
     VALUES ($1, 'song', 'dx', 'master', $2, 'Surviving reply')`,
    [survivorId, parent.rows[0]!.id],
  )
}