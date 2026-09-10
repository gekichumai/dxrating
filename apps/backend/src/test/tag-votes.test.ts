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

type TestUser = { cookie: string; id: string }

const withPool = async <T>(operation: (pool: pg.Pool) => Promise<T>): Promise<T> => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    return await operation(pool)
  } finally {
    await pool.end()
  }
}

const createUser = async (email: string, name: string): Promise<TestUser> => {
  await signUp(email, 'password123', name)
  const loginRes = await signIn(email, 'password123')
  const cookie = extractSessionCookie(loginRes)
  const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
  const session = await sessionRes.json()
  return { cookie, id: session.user.id }
}

/** Tags and tag groups have no public write API, so they are seeded directly. */
const createTag = async (ownerId: string, name: string) =>
  withPool(async (pool) => {
    const groupRes = await pool.query(`INSERT INTO tag_groups (localized_name, color) VALUES ($1, $2) RETURNING id`, [
      JSON.stringify({ en: `${name} Group` }),
      '#FF0000',
    ])
    const tagRes = await pool.query(
      `INSERT INTO tags (created_by, localized_name, localized_description, group_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [ownerId, JSON.stringify({ en: name }), JSON.stringify({ en: `${name} description` }), groupRes.rows[0].id],
    )
    return Number(tagRes.rows[0].id)
  })

const SHEET = { songId: 'vote-song', sheetType: 'dx', sheetDifficulty: 'master' }

const attachTag = async (user: TestUser, tagId: number, sheet = SHEET) => {
  const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, user.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sheet, tagId }),
  })
  expect(res.status).toBe(200)
  return Number((await res.json()).id)
}

const vote = (user: TestUser, tagSongId: number, value: number) =>
  authenticatedFetch(`${getBaseUrl()}/api/v1/tags/vote`, user.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagSongId, value }),
  })

const fetchSheetTags = async (sheet = SHEET) => {
  const query = new URLSearchParams({
    songId: sheet.songId,
    sheetType: sheet.sheetType,
    sheetDifficulty: sheet.sheetDifficulty,
  })
  const res = await fetch(`${getBaseUrl()}/api/v1/tags/sheet?${query}`)
  expect(res.status).toBe(200)
  return res.json()
}

const fetchGlobalTagSongs = async () => {
  const res = await fetch(`${getBaseUrl()}/api/v1/tags`)
  expect(res.status).toBe(200)
  return (await res.json()).tagSongs
}

const backdateAttachment = (tagSongId: number, interval: string) =>
  withPool((pool) =>
    pool.query(`UPDATE tag_songs SET created_at = now() - $1::interval WHERE id = $2`, [interval, tagSongId]),
  )

describe('Tag voting and removal', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('auto-upvotes an association on behalf of its creator', async () => {
    const creator = await createUser('vote-creator@example.com', 'Creator')
    const tagId = await createTag(creator.id, 'Auto')
    const tagSongId = await attachTag(creator, tagId)

    const [association] = await fetchSheetTags()
    expect(association.id).toBe(tagSongId)
    expect(association.upvotes).toBe(1)
    expect(association.downvotes).toBe(0)
    expect(association.score).toBe(1)

    const [globalTagSong] = await fetchGlobalTagSongs()
    expect(globalTagSong.score).toBe(1)
  })

  it('rejects unauthenticated votes', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/tags/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagSongId: 1, value: 1 }),
    })
    expect(res.status).not.toBe(200)
  })

  it('rejects vote values other than +1 and -1', async () => {
    const creator = await createUser('vote-invalid@example.com', 'Creator')
    const tagId = await createTag(creator.id, 'Invalid')
    const tagSongId = await attachTag(creator, tagId)

    for (const value of [0, 2, -2, 1.5]) {
      const res = await vote(creator, tagSongId, value)
      expect(res.status).not.toBe(200)
    }

    const [association] = await fetchSheetTags()
    expect(association.score).toBe(1)
  })

  it('counts a second user upvote and reports the breakdown', async () => {
    const creator = await createUser('vote-c2@example.com', 'Creator')
    const voter = await createUser('vote-v2@example.com', 'Voter')
    const tagId = await createTag(creator.id, 'Second')
    const tagSongId = await attachTag(creator, tagId)

    const res = await vote(voter, tagSongId, 1)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ tagSongId, upvotes: 2, downvotes: 0, score: 2, userVote: 1 })
  })

  it('reports downvotes separately from upvotes', async () => {
    const creator = await createUser('vote-c3@example.com', 'Creator')
    const voter = await createUser('vote-v3@example.com', 'Voter')
    const tagId = await createTag(creator.id, 'Down')
    const tagSongId = await attachTag(creator, tagId)

    const res = await vote(voter, tagSongId, -1)
    expect(await res.json()).toMatchObject({ upvotes: 1, downvotes: 1, score: 0, userVote: -1 })
  })

  it('is idempotent when the same vote is cast twice', async () => {
    const creator = await createUser('vote-c4@example.com', 'Creator')
    const voter = await createUser('vote-v4@example.com', 'Voter')
    const tagId = await createTag(creator.id, 'Idempotent')
    const tagSongId = await attachTag(creator, tagId)

    await vote(voter, tagSongId, 1)
    const res = await vote(voter, tagSongId, 1)
    expect(await res.json()).toMatchObject({ upvotes: 2, downvotes: 0, score: 2, userVote: 1 })
  })

  it('replaces an existing vote when the user changes their mind', async () => {
    const creator = await createUser('vote-c5@example.com', 'Creator')
    const voter = await createUser('vote-v5@example.com', 'Voter')
    const tagId = await createTag(creator.id, 'Changed')
    const tagSongId = await attachTag(creator, tagId)

    await vote(voter, tagSongId, 1)
    const res = await vote(voter, tagSongId, -1)
    expect(await res.json()).toMatchObject({ upvotes: 1, downvotes: 1, score: 0, userVote: -1 })
  })

  it('hides buried associations from the global list but not from the sheet endpoint', async () => {
    const creator = await createUser('vote-c6@example.com', 'Creator')
    const tagId = await createTag(creator.id, 'Buried')
    const tagSongId = await attachTag(creator, tagId)

    // Creator's own downvote plus three others takes the score to -3.
    await vote(creator, tagSongId, -1)
    for (const email of ['vote-b1@example.com', 'vote-b2@example.com', 'vote-b3@example.com']) {
      const voter = await createUser(email, 'Voter')
      const res = await vote(voter, tagSongId, -1)
      expect(res.status).toBe(200)
    }

    const [association] = await fetchSheetTags()
    expect(association.score).toBe(-4)
    expect(association.downvotes).toBe(4)

    expect(await fetchGlobalTagSongs()).toEqual([])
  })

  it("returns only the current user's votes from the user-votes endpoint", async () => {
    const creator = await createUser('vote-c7@example.com', 'Creator')
    const voter = await createUser('vote-v7@example.com', 'Voter')
    const tagId = await createTag(creator.id, 'Mine')
    const otherTagId = await createTag(creator.id, 'Other')
    const tagSongId = await attachTag(creator, tagId)
    const otherTagSongId = await attachTag(creator, otherTagId)

    await vote(voter, tagSongId, -1)

    const query = new URLSearchParams()
    query.append('tagSongIds[]', String(tagSongId))
    query.append('tagSongIds[]', String(otherTagSongId))

    const voterRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/user-votes?${query}`, voter.cookie)
    expect(voterRes.status).toBe(200)
    expect(await voterRes.json()).toEqual({ [String(tagSongId)]: -1 })

    const creatorRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/user-votes?${query}`, creator.cookie)
    expect(await creatorRes.json()).toEqual({
      [String(tagSongId)]: 1,
      [String(otherTagSongId)]: 1,
    })

    const anonymousRes = await fetch(`${getBaseUrl()}/api/v1/tags/user-votes?${query}`)
    expect(anonymousRes.status).not.toBe(200)
  })

  it('lets the creator remove an association within an hour', async () => {
    const creator = await createUser('detach-c1@example.com', 'Creator')
    const tagId = await createTag(creator.id, 'Removable')
    const tagSongId = await attachTag(creator, tagId)

    const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/detach`, creator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagSongId }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(await fetchSheetTags()).toEqual([])
    expect(await fetchGlobalTagSongs()).toEqual([])

    const remainingVotes = await withPool((pool) =>
      pool.query(`SELECT id FROM tag_song_votes WHERE tag_song_id = $1`, [tagSongId]),
    )
    expect(remainingVotes.rows).toEqual([])
  })

  it('refuses removal once the one-hour window has passed', async () => {
    const creator = await createUser('detach-c2@example.com', 'Creator')
    const tagId = await createTag(creator.id, 'Expired')
    const tagSongId = await attachTag(creator, tagId)
    await backdateAttachment(tagSongId, '2 hours')

    const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/detach`, creator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagSongId }),
    })
    expect(res.status).toBe(403)
    expect((await fetchSheetTags()).length).toBe(1)
  })

  it('refuses removal by anyone other than the creator', async () => {
    const creator = await createUser('detach-c3@example.com', 'Creator')
    const other = await createUser('detach-o3@example.com', 'Other')
    const tagId = await createTag(creator.id, 'Foreign')
    const tagSongId = await attachTag(creator, tagId)

    const res = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/detach`, other.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagSongId }),
    })
    expect(res.status).toBe(403)
    expect((await fetchSheetTags()).length).toBe(1)
  })

  it('rejects unauthenticated removal', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/tags/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagSongId: 1 }),
    })
    expect(res.status).not.toBe(200)
  })
})