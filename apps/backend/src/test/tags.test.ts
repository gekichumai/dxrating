import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestServer,
  teardownTestServer,
  getBaseUrl,
  signUp,
  signIn,
  extractSessionCookie,
  authenticatedFetch,
  cleanDatabase,
} from './setup.js'
import pg from 'pg'

describe('Tags API', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('GET /api/v1/tags returns empty when no data', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/tags`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tags).toEqual([])
    expect(body.tagGroups).toEqual([])
    expect(body.tagSongs).toEqual([])
  })

  it('POST /api/v1/tags/attach requires authentication', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/tags/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId: 1,
      }),
    })
    expect(res.status).not.toBe(200)
  })

  it('POST /api/v1/tags/attach works when authenticated', async () => {
    // Create user
    await signUp('tagger@example.com', 'password123', 'Tagger')
    const loginRes = await signIn('tagger@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    // Get user ID from session
    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    })
    const session = await sessionRes.json()
    const userId = session.user.id

    // Insert tag group and tag directly (no API for creating these)
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`INSERT INTO tag_groups (localized_name, color) VALUES ($1, $2)`, [
      JSON.stringify({ en: 'Test Group' }),
      '#FF0000',
    ])
    const tagGroupRes = await pool.query(`SELECT id FROM tag_groups LIMIT 1`)
    const groupId = tagGroupRes.rows[0].id

    const tagRes = await pool.query(
      `INSERT INTO tags (created_by, localized_name, localized_description, group_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, 'Test Tag', 'A test tag', groupId],
    )
    const tagId = Number(tagRes.rows[0].id)
    await pool.end()

    // Attach tag to a song
    const attachRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song-id',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId,
      }),
    })
    expect(attachRes.status).toBe(200)
    const attachBody = await attachRes.json()
    expect(attachBody.id).toBeDefined()

    // Verify it appears in the list
    const listRes = await fetch(`${getBaseUrl()}/api/v1/tags`)
    const listBody = await listRes.json()
    expect(listBody.tagSongs.length).toBe(1)
    expect(listBody.tagSongs[0].song_id).toBe('test-song-id')
    expect(listBody.tags.length).toBe(1)
    expect(listBody.tagGroups.length).toBe(1)
  })

  it('attaching same tag twice returns existing record', async () => {
    await signUp('tagger2@example.com', 'password123', 'Tagger2')
    const loginRes = await signIn('tagger2@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    })
    const session = await sessionRes.json()

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`INSERT INTO tag_groups (localized_name, color) VALUES ($1, $2)`, [
      JSON.stringify({ en: 'Group' }),
      '#00FF00',
    ])
    const groupRes = await pool.query(`SELECT id FROM tag_groups LIMIT 1`)
    const tagRes = await pool.query(
      `INSERT INTO tags (created_by, localized_name, localized_description, group_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [session.user.id, 'Tag', 'Desc', groupRes.rows[0].id],
    )
    await pool.end()

    const payload = {
      songId: 'song-1',
      sheetType: 'dx',
      sheetDifficulty: 'master',
      tagId: tagRes.rows[0].id,
    }

    const res1 = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body1 = await res1.json()

    const res2 = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body2 = await res2.json()

    expect(body1.id).toBe(body2.id)
  })
})