import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
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

const SONG_A = 'dsng_23456789ab'
const SONG_B = 'dsng_23456789ac'
const SHEET_A = 'dsht_23456789ab'
const SHEET_B = 'dsht_23456789ac'

let publicationRevision = 0

const createCatalogSchema = async (pool: pg.Pool, revision: number) => {
  await pool.query(`
    CREATE SCHEMA dxdata;
    CREATE TABLE dxdata.catalog_build_runs (
      id BIGINT PRIMARY KEY,
      status TEXT NOT NULL,
      api_schema_version INTEGER NOT NULL
    );
    CREATE TABLE dxdata.catalog_publications (
      channel TEXT PRIMARY KEY,
      catalog_run_id BIGINT NOT NULL,
      revision BIGINT NOT NULL
    );
    CREATE TABLE dxdata.catalog_snapshots (
      catalog_run_id BIGINT PRIMARY KEY,
      api_schema_version INTEGER NOT NULL
    );
    CREATE TABLE dxdata.canonical_songs (
      id TEXT PRIMARY KEY,
      legacy_song_id TEXT
    );
    CREATE TABLE dxdata.song_source_mappings (
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      active BOOLEAN NOT NULL,
      PRIMARY KEY (source_id, external_id)
    );
    CREATE TABLE dxdata.catalog_run_songs (
      catalog_run_id BIGINT NOT NULL,
      song_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL
    );
    CREATE TABLE dxdata.canonical_sheets (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      difficulty TEXT NOT NULL
    );
    CREATE TABLE dxdata.catalog_run_sheets (
      catalog_run_id BIGINT NOT NULL,
      song_id TEXT NOT NULL,
      sheet_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL
    );
  `)
  await pool.query(`INSERT INTO dxdata.catalog_build_runs (id, status, api_schema_version) VALUES (1, 'published', 1)`)
  await pool.query(
    `INSERT INTO dxdata.catalog_publications (channel, catalog_run_id, revision) VALUES ('production-v1', 1, $1)`,
    [revision],
  )
  await pool.query(`INSERT INTO dxdata.catalog_snapshots (catalog_run_id, api_schema_version) VALUES (1, 1)`)
  await pool.query(
    `INSERT INTO dxdata.canonical_songs (id, legacy_song_id) VALUES ($1, 'legacy-song-a'), ($2, 'legacy-song-b')`,
    [SONG_A, SONG_B],
  )
  await pool.query(
    `
      INSERT INTO dxdata.song_source_mappings (source_id, external_id, song_id, active)
      VALUES ('legacy_dxdata', 'legacy-song-a', $1, true), ('legacy_dxdata', 'legacy-song-b', $2, true)
    `,
    [SONG_A, SONG_B],
  )
  await pool.query(
    `INSERT INTO dxdata.catalog_run_songs (catalog_run_id, song_id, ordinal) VALUES (1, $1, 0), (1, $2, 1)`,
    [SONG_A, SONG_B],
  )
  await pool.query(
    `
      INSERT INTO dxdata.canonical_sheets (id, song_id, chart_type, difficulty)
      VALUES ($1, $2, 'dx', 'master'), ($3, $4, 'dx', 'master')
    `,
    [SHEET_A, SONG_A, SHEET_B, SONG_B],
  )
  await pool.query(
    `
      INSERT INTO dxdata.catalog_run_sheets (catalog_run_id, song_id, sheet_id, ordinal)
      VALUES (1, $1, $2, 0), (1, $3, $4, 0)
    `,
    [SONG_A, SHEET_A, SONG_B, SHEET_B],
  )
}

/** Republishes the catalog with SONG_A's legacy ID renamed, keeping the old ID as an alias. */
const renameLegacySongA = async (pool: pg.Pool) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE dxdata.canonical_songs SET legacy_song_id = 'legacy-song-a-renamed' WHERE id = $1`, [
      SONG_A,
    ])
    await client.query(
      `UPDATE dxdata.song_source_mappings SET active = false WHERE source_id = 'legacy_dxdata' AND external_id = 'legacy-song-a'`,
    )
    await client.query(
      `
        INSERT INTO dxdata.song_source_mappings (source_id, external_id, song_id, active)
        VALUES ('legacy_dxdata', 'legacy-song-a-renamed', $1, true)
      `,
      [SONG_A],
    )
    publicationRevision += 1
    await client.query(`UPDATE dxdata.catalog_publications SET revision = $1 WHERE channel = 'production-v1'`, [
      publicationRevision,
    ])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

describe('Public catalog identity API boundary', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('DROP SCHEMA IF EXISTS dxdata CASCADE')
    publicationRevision += 10
    await createCatalogSchema(pool, publicationRevision)
    await pool.end()
  })

  it('translates public write inputs to legacy storage and public list outputs back to stable IDs', async () => {
    await signUp('public-ids@example.com', 'password123', 'Public IDs')
    const loginRes = await signIn('public-ids@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    })
    const session = await sessionRes.json()

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const group = await pool.query(
      `INSERT INTO tag_groups (localized_name, color) VALUES ($1, '#123456') RETURNING id`,
      [JSON.stringify({ en: 'Group' })],
    )
    const tag = await pool.query(
      `
        INSERT INTO tags (created_by, localized_name, localized_description, group_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [session.user.id, JSON.stringify({ en: 'Tag' }), JSON.stringify({ en: 'Description' }), group.rows[0].id],
    )
    const tagId = Number(tag.rows[0].id)

    const attachRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId,
      }),
    })
    expect(attachRes.status).toBe(200)
    await pool.query(
      `
        INSERT INTO tag_songs (tag_id, song_id, sheet_type, sheet_difficulty, created_by)
        VALUES ($1, 'retired-legacy-song', 'dx', 'master', $2)
      `,
      [tagId, session.user.id],
    )

    const aliasRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: SONG_A, name: 'stable alias' }),
    })
    expect(aliasRes.status).toBe(200)
    await pool.query(
      `INSERT INTO song_aliases (song_id, name, created_by) VALUES ('retired-legacy-song', 'orphan', $1)`,
      [session.user.id],
    )

    const commentRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Stored against the compatibility identity',
      }),
    })
    expect(commentRes.status).toBe(200)

    const storedTag = await pool.query(
      `SELECT song_id, sheet_type, sheet_difficulty FROM tag_songs ORDER BY id LIMIT 1`,
    )
    const storedAlias = await pool.query(`SELECT song_id FROM song_aliases WHERE name = 'stable alias'`)
    const storedComment = await pool.query(`SELECT song_id, sheet_type, sheet_difficulty FROM comments`)
    expect(storedTag.rows[0]).toMatchObject({
      song_id: 'legacy-song-a',
      sheet_type: 'dx',
      sheet_difficulty: 'master',
    })
    expect(storedAlias.rows[0].song_id).toBe('legacy-song-a')
    expect(storedComment.rows[0]).toMatchObject({
      song_id: 'legacy-song-a',
      sheet_type: 'dx',
      sheet_difficulty: 'master',
    })
    await pool.end()

    const tagsRes = await fetch(`${getBaseUrl()}/api/v1/tags?idScheme=public`)
    expect(tagsRes.status).toBe(200)
    const tags = await tagsRes.json()
    expect(tags.tagSongs).toEqual([
      {
        song_id: SONG_A,
        sheet_id: SHEET_A,
        sheet_type: 'dx',
        sheet_difficulty: 'master',
        tag_id: tagId,
        // Attaching a tag records an implicit upvote from its creator.
        score: 1,
      },
    ])

    const aliasesRes = await fetch(`${getBaseUrl()}/api/v1/aliases?idScheme=public`)
    expect(aliasesRes.status).toBe(200)
    expect(await aliasesRes.json()).toEqual([{ song_id: SONG_A, name: 'stable alias' }])

    const commentsRes = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=${SONG_A}&sheetId=${SHEET_A}&sheetType=dx&sheetDifficulty=master`,
    )
    expect(commentsRes.status).toBe(200)
    expect((await commentsRes.json()).map((comment: { content: string }) => comment.content)).toEqual([
      'Stored against the compatibility identity',
    ])

    const trendingRes = await fetch(`${getBaseUrl()}/api/v1/analytics/trending?idScheme=public`)
    expect(trendingRes.status).toBe(200)
    expect((await trendingRes.json()).results).toEqual([])
  })

  it('keeps historical community data readable across a legacy ID rename without duplicating tags', async () => {
    await signUp('renamed-public-id@example.com', 'password123', 'Renamed Public ID')
    const loginRes = await signIn('renamed-public-id@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)
    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
    const session = await sessionRes.json()

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const group = await pool.query(
      `INSERT INTO tag_groups (localized_name, color) VALUES ($1, '#123456') RETURNING id`,
      [JSON.stringify({ en: 'Group' })],
    )
    const tag = await pool.query(
      `
        INSERT INTO tags (created_by, localized_name, localized_description, group_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [session.user.id, JSON.stringify({ en: 'Tag' }), JSON.stringify({ en: 'Description' }), group.rows[0].id],
    )
    const tagId = Number(tag.rows[0].id)

    const firstAttach = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId,
      }),
    })
    expect(firstAttach.status).toBe(200)
    const firstTag = await firstAttach.json()

    const oldAlias = await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: SONG_A, name: 'alias before rename' }),
    })
    expect(oldAlias.status).toBe(200)

    const parentRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'comment before rename',
      }),
    })
    expect(parentRes.status).toBe(200)
    const parent = await parentRes.json()

    await renameLegacySongA(pool)

    const duplicateAttach = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'legacy-song-a-renamed',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId,
      }),
    })
    expect(duplicateAttach.status).toBe(200)
    expect((await duplicateAttach.json()).id).toBe(firstTag.id)

    const oldIdDuplicateAttach = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/attach`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'legacy-song-a',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        tagId,
      }),
    })
    expect(oldIdDuplicateAttach.status).toBe(200)
    expect((await oldIdDuplicateAttach.json()).id).toBe(firstTag.id)

    const tagsBeforeHistoricalDuplicate = await pool.query(`SELECT song_id FROM tag_songs WHERE tag_id = $1`, [tagId])
    expect(tagsBeforeHistoricalDuplicate.rows).toEqual([{ song_id: 'legacy-song-a' }])

    await pool.query(
      `
        INSERT INTO tag_songs (tag_id, song_id, sheet_type, sheet_difficulty, created_by)
        VALUES ($1, 'legacy-song-a-renamed', 'dx', 'master', $2)
      `,
      [tagId, session.user.id],
    )

    const replyRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'legacy-song-a-renamed',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'reply after rename',
        parentId: parent.id,
      }),
    })
    expect(replyRes.status).toBe(200)

    const newAlias = await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: 'legacy-song-a', name: 'alias after rename' }),
    })
    expect(newAlias.status).toBe(200)

    const [tagsRes, aliasesRes, publicCommentsRes, currentLegacyCommentsRes, oldLegacyCommentsRes] = await Promise.all([
      fetch(`${getBaseUrl()}/api/v1/tags?idScheme=public`),
      fetch(`${getBaseUrl()}/api/v1/aliases?idScheme=public`),
      fetch(`${getBaseUrl()}/api/v1/comments?songId=${SONG_A}&sheetId=${SHEET_A}&sheetType=dx&sheetDifficulty=master`),
      fetch(`${getBaseUrl()}/api/v1/comments?songId=legacy-song-a-renamed&sheetType=dx&sheetDifficulty=master`),
      fetch(`${getBaseUrl()}/api/v1/comments?songId=legacy-song-a&sheetType=dx&sheetDifficulty=master`),
    ])
    expect(tagsRes.status).toBe(200)
    expect(aliasesRes.status).toBe(200)
    expect(publicCommentsRes.status).toBe(200)
    expect(currentLegacyCommentsRes.status).toBe(200)
    expect(oldLegacyCommentsRes.status).toBe(200)

    const publicTags = await tagsRes.json()
    expect(publicTags.tagSongs).toEqual([
      {
        song_id: SONG_A,
        sheet_id: SHEET_A,
        sheet_type: 'dx',
        sheet_difficulty: 'master',
        tag_id: tagId,
        // Attaching a tag records an implicit upvote from its creator.
        score: 1,
      },
    ])
    expect(await aliasesRes.json()).toEqual([
      { song_id: SONG_A, name: 'alias before rename' },
      { song_id: SONG_A, name: 'alias after rename' },
    ])
    for (const response of [publicCommentsRes, currentLegacyCommentsRes, oldLegacyCommentsRes]) {
      expect((await response.json()).map((comment: { content: string }) => comment.content).sort()).toEqual([
        'comment before rename',
        'reply after rename',
      ])
    }

    const storedTags = await pool.query(`SELECT song_id FROM tag_songs WHERE tag_id = $1 ORDER BY id`, [tagId])
    expect(storedTags.rows).toEqual([{ song_id: 'legacy-song-a' }, { song_id: 'legacy-song-a-renamed' }])
    const storedComments = await pool.query(`SELECT song_id, parent_id FROM comments ORDER BY id`)
    expect(storedComments.rows).toEqual([
      { song_id: 'legacy-song-a', parent_id: null },
      { song_id: 'legacy-song-a-renamed', parent_id: String(parent.id) },
    ])
    const storedAliases = await pool.query(`SELECT song_id, name FROM song_aliases ORDER BY id`)
    expect(storedAliases.rows).toEqual([
      { song_id: 'legacy-song-a', name: 'alias before rename' },
      { song_id: 'legacy-song-a-renamed', name: 'alias after rename' },
    ])
    await pool.end()
  })

  it('fails closed for malformed, unpublished, and mismatched public identities', async () => {
    const malformed = await fetch(`${getBaseUrl()}/api/v1/comments?songId=dsng_bad&sheetType=dx&sheetDifficulty=master`)
    expect(malformed.status).toBe(400)

    const unpublished = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=dsng_23456789ad&sheetType=dx&sheetDifficulty=master`,
    )
    expect(unpublished.status).toBe(404)

    const mismatch = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=${SONG_A}&sheetId=${SHEET_B}&sheetType=dx&sheetDifficulty=master`,
    )
    expect(mismatch.status).toBe(404)
  })

  it('keeps default legacy routes available when the dynamic catalog schema is unavailable', async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('DROP SCHEMA dxdata CASCADE')
    await pool.end()

    const legacyComments = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=legacy-song-a&sheetType=dx&sheetDifficulty=master`,
    )
    expect(legacyComments.status).toBe(200)
    expect(await legacyComments.json()).toEqual([])

    const legacyTags = await fetch(`${getBaseUrl()}/api/v1/tags`)
    expect(legacyTags.status).toBe(200)

    const publicTags = await fetch(`${getBaseUrl()}/api/v1/tags?idScheme=public`)
    expect(publicTags.status).toBe(503)
  })

  describe('tag associations split across legacy IDs by a rename', () => {
    const LEGACY_SHEET = { sheetType: 'dx', sheetDifficulty: 'master' }

    const signUpCaller = async (email: string) => {
      await signUp(email, 'password123', 'Caller')
      const cookie = extractSessionCookie(await signIn(email, 'password123'))
      const session = await (
        await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
      ).json()
      return { cookie, id: session.user.id as string }
    }

    /**
     * Seeds one tag whose association is split across the pre- and post-rename
     * legacy IDs. Rows are inserted directly because the API itself never
     * creates a second row for an association it already knows about.
     */
    const seedSplitAssociation = async (
      pool: pg.Pool,
      creators: { original: string; renamed: string },
      votes: { original: number[]; renamed: number[] },
    ) => {
      const group = await pool.query(
        `INSERT INTO tag_groups (localized_name, color) VALUES ($1, '#123456') RETURNING id`,
        [JSON.stringify({ en: 'Group' })],
      )
      const tag = await pool.query(
        `INSERT INTO tags (created_by, localized_name, localized_description, group_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [creators.original, JSON.stringify({ en: 'Tag' }), JSON.stringify({ en: 'Description' }), group.rows[0].id],
      )
      const tagId = Number(tag.rows[0].id)
      const insertRow = async (songId: string, createdBy: string, values: number[]) => {
        const row = await pool.query(
          `INSERT INTO tag_songs (tag_id, song_id, sheet_type, sheet_difficulty, created_by)
           VALUES ($1, $2, 'dx', 'master', $3) RETURNING id`,
          [tagId, songId, createdBy],
        )
        const id = Number(row.rows[0].id)
        for (const [index, value] of values.entries()) {
          const voterId = `split-voter-${id}-${index}`
          await pool.query(`INSERT INTO "user" (id, name, email) VALUES ($1, 'Voter', $2)`, [
            voterId,
            `${voterId}@example.com`,
          ])
          await pool.query(`INSERT INTO tag_song_votes (tag_song_id, user_id, value) VALUES ($1, $2, $3)`, [
            id,
            voterId,
            value,
          ])
        }
        return id
      }
      // The original row is inserted first, so it is the canonical (oldest) one.
      const originalId = await insertRow('legacy-song-a', creators.original, votes.original)
      const renamedId = await insertRow('legacy-song-a-renamed', creators.renamed, votes.renamed)
      return { tagId, originalId, renamedId }
    }

    const vote = (cookie: string, tagSongId: number, value: number) =>
      authenticatedFetch(`${getBaseUrl()}/api/v1/tags/vote`, cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagSongId, value }),
      })

    it('collapses the association in the global list and gates on its combined score', async () => {
      const caller = await signUpCaller('split-list@example.com')
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      await renameLegacySongA(pool)
      // Buried on its own (-4) but its sibling is +2: combined -2, still visible.
      const live = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: caller.id },
        { original: [-1, -1, -1, -1], renamed: [1, 1] },
      )
      // Healthy on its own (+1) but its sibling is -4: combined -3, buried.
      const buried = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: caller.id },
        { original: [1], renamed: [-1, -1, -1, -1] },
      )
      await pool.end()

      // Voting through the API also invalidates the cached global list.
      const voteRes = await vote(caller.cookie, live.renamedId, -1)
      expect(await voteRes.json()).toMatchObject({ tagSongId: live.originalId, score: -3, userVote: -1 })
      const undoRes = await vote(caller.cookie, live.originalId, 1)
      expect(await undoRes.json()).toMatchObject({ tagSongId: live.originalId, score: -1, userVote: 1 })

      const legacyTags = await (await fetch(`${getBaseUrl()}/api/v1/tags`)).json()
      expect(legacyTags.tagSongs).toEqual([
        {
          song_id: 'legacy-song-a-renamed',
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: live.tagId,
          score: -1,
        },
      ])

      const publicTags = await (await fetch(`${getBaseUrl()}/api/v1/tags?idScheme=public`)).json()
      expect(publicTags.tagSongs).toEqual([
        {
          song_id: SONG_A,
          sheet_id: SHEET_A,
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: live.tagId,
          score: -1,
        },
      ])
      expect(publicTags.tagSongs.map((tagSong: { tag_id: number }) => tagSong.tag_id)).not.toContain(buried.tagId)
    })

    it('reports the association once on the sheet endpoint, under its canonical row', async () => {
      const caller = await signUpCaller('split-sheet@example.com')
      const other = await signUpCaller('split-sheet-other@example.com')
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      await renameLegacySongA(pool)
      const split = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: other.id },
        { original: [1, -1], renamed: [1, 1, -1] },
      )
      await pool.end()

      for (const songId of ['legacy-song-a', 'legacy-song-a-renamed']) {
        const res = await fetch(`${getBaseUrl()}/api/v1/tags/sheet?${new URLSearchParams({ songId, ...LEGACY_SHEET })}`)
        expect(res.status).toBe(200)
        const entries = await res.json()
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
          id: split.originalId,
          tag_id: split.tagId,
          created_by: caller.id,
          upvotes: 3,
          downvotes: 2,
          score: 1,
        })
        // The canonical row's own timestamp, serialized as an absolute instant.
        expect(entries[0].created_at).toMatch(/Z$/)
      }
    })

    it("folds a user's sibling-row vote into the canonical row", async () => {
      const caller = await signUpCaller('split-vote@example.com')
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      await renameLegacySongA(pool)
      const split = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: caller.id },
        { original: [], renamed: [] },
      )
      // A vote the caller left on the non-canonical row before the rename merged them.
      await pool.query(`INSERT INTO tag_song_votes (tag_song_id, user_id, value) VALUES ($1, $2, -1)`, [
        split.renamedId,
        caller.id,
      ])

      const res = await vote(caller.cookie, split.renamedId, 1)
      expect(await res.json()).toEqual({ tagSongId: split.originalId, upvotes: 1, downvotes: 0, score: 1, userVote: 1 })

      const stored = await pool.query(`SELECT tag_song_id, value FROM tag_song_votes WHERE user_id = $1`, [caller.id])
      expect(stored.rows.map((row) => ({ tag_song_id: Number(row.tag_song_id), value: row.value }))).toEqual([
        { tag_song_id: split.originalId, value: 1 },
      ])
      await pool.end()

      const query = new URLSearchParams()
      query.append('tagSongIds[]', String(split.originalId))
      query.append('tagSongIds[]', String(split.renamedId))
      const userVotes = await authenticatedFetch(`${getBaseUrl()}/api/v1/tags/user-votes?${query}`, caller.cookie)
      expect(await userVotes.json()).toEqual({ [String(split.originalId)]: 1, [String(split.renamedId)]: 1 })
    })

    it('removes every row of an association, but only when the caller created all of them', async () => {
      const caller = await signUpCaller('split-detach@example.com')
      const other = await signUpCaller('split-detach-other@example.com')
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      await renameLegacySongA(pool)
      const mixed = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: other.id },
        { original: [], renamed: [] },
      )
      const owned = await seedSplitAssociation(
        pool,
        { original: caller.id, renamed: caller.id },
        { original: [], renamed: [] },
      )

      const detach = (tagSongId: number) =>
        authenticatedFetch(`${getBaseUrl()}/api/v1/tags/detach`, caller.cookie, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagSongId }),
        })

      expect((await detach(mixed.originalId)).status).toBe(403)
      expect((await detach(owned.renamedId)).status).toBe(200)

      const remaining = await pool.query(`SELECT id FROM tag_songs ORDER BY id`)
      expect(remaining.rows.map((row) => Number(row.id))).toEqual([mixed.originalId, mixed.renamedId])
      await pool.end()
    })
  })
})