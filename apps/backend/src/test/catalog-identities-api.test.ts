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

const SONG_A = 'sng_23456789ab'
const SONG_B = 'sng_23456789ac'
const SHEET_A = 'sht_23456789ab'
const SHEET_B = 'sht_23456789ac'

let publicationRevision = 0

const createCatalogSchema = async (pool: pg.Pool, revision: number) => {
  await pool.query(`
    CREATE SCHEMA dxdata;
    CREATE TABLE dxdata.dcat_runs (
      id BIGINT PRIMARY KEY,
      status TEXT NOT NULL,
      api_schema_version INTEGER NOT NULL
    );
    CREATE TABLE dxdata.dcat_publications (
      channel TEXT PRIMARY KEY,
      catalog_run_id BIGINT NOT NULL,
      revision BIGINT NOT NULL
    );
    CREATE TABLE dxdata.dcat_snapshots (
      catalog_run_id BIGINT PRIMARY KEY,
      api_schema_version INTEGER NOT NULL
    );
    CREATE TABLE dxdata.dsng_songs (
      id TEXT PRIMARY KEY,
      legacy_song_id TEXT
    );
    CREATE TABLE dxdata.dsng_source_mappings (
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      active BOOLEAN NOT NULL,
      PRIMARY KEY (source_id, external_id)
    );
    CREATE TABLE dxdata.dcat_songs (
      catalog_run_id BIGINT NOT NULL,
      song_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL
    );
    CREATE TABLE dxdata.dsht_sheets (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      difficulty TEXT NOT NULL
    );
    CREATE TABLE dxdata.dcat_sheets (
      catalog_run_id BIGINT NOT NULL,
      song_id TEXT NOT NULL,
      sheet_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL
    );
  `)
  await pool.query(`INSERT INTO dxdata.dcat_runs (id, status, api_schema_version) VALUES (1, 'published', 1)`)
  await pool.query(
    `INSERT INTO dxdata.dcat_publications (channel, catalog_run_id, revision) VALUES ('production-v1', 1, $1)`,
    [revision],
  )
  await pool.query(`INSERT INTO dxdata.dcat_snapshots (catalog_run_id, api_schema_version) VALUES (1, 1)`)
  await pool.query(
    `INSERT INTO dxdata.dsng_songs (id, legacy_song_id) VALUES ($1, 'legacy-song-a'), ($2, 'legacy-song-b')`,
    [SONG_A, SONG_B],
  )
  await pool.query(
    `
      INSERT INTO dxdata.dsng_source_mappings (source_id, external_id, song_id, active)
      VALUES ('legacy_dxdata', 'legacy-song-a', $1, true), ('legacy_dxdata', 'legacy-song-b', $2, true)
    `,
    [SONG_A, SONG_B],
  )
  await pool.query(`INSERT INTO dxdata.dcat_songs (catalog_run_id, song_id, ordinal) VALUES (1, $1, 0), (1, $2, 1)`, [
    SONG_A,
    SONG_B,
  ])
  await pool.query(
    `
      INSERT INTO dxdata.dsht_sheets (id, song_id, chart_type, difficulty)
      VALUES ($1, $2, 'dx', 'master'), ($3, $4, 'dx', 'master')
    `,
    [SHEET_A, SONG_A, SHEET_B, SONG_B],
  )
  await pool.query(
    `
      INSERT INTO dxdata.dcat_sheets (catalog_run_id, song_id, sheet_id, ordinal)
      VALUES (1, $1, $2, 0), (1, $3, $4, 0)
    `,
    [SONG_A, SHEET_A, SONG_B, SHEET_B],
  )
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

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE dxdata.dsng_songs SET legacy_song_id = 'legacy-song-a-renamed' WHERE id = $1`, [
        SONG_A,
      ])
      await client.query(
        `UPDATE dxdata.dsng_source_mappings SET active = false WHERE source_id = 'legacy_dxdata' AND external_id = 'legacy-song-a'`,
      )
      await client.query(
        `
          INSERT INTO dxdata.dsng_source_mappings (source_id, external_id, song_id, active)
          VALUES ('legacy_dxdata', 'legacy-song-a-renamed', $1, true)
        `,
        [SONG_A],
      )
      publicationRevision += 1
      await client.query(`UPDATE dxdata.dcat_publications SET revision = $1 WHERE channel = 'production-v1'`, [
        publicationRevision,
      ])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

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
    const malformed = await fetch(`${getBaseUrl()}/api/v1/comments?songId=sng_bad&sheetType=dx&sheetDifficulty=master`)
    expect(malformed.status).toBe(400)

    const unpublished = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=sng_23456789ad&sheetType=dx&sheetDifficulty=master`,
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
})