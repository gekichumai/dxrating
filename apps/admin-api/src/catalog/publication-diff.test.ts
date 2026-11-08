import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDiffCache } from './publication-diff'
import { clearCatalogFixture, createCatalogFixtureSchema, publishFixture } from './test-fixture'
import { ANNOUNCEMENT_READER, CATALOG_READER, makeCatalogTestApp } from './test-harness'

// Integration: a real Postgres (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL). Synthetic catalog data only.
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

// The published song-catalog v1 shape, with public IDs
const catalog = (level: number, songs = 3) => ({
  schemaVersion: 1,
  updatedAt: `t${level}`,
  songs: Array.from({ length: songs }, (_, i) => ({
    id: `dsng_synthetic${i}`,
    title: `Synthetic ${i}`,
    sheets: [
      { id: `dsht_synthetic${i}`, type: 'dx', difficulty: 'master', level: '13', internalLevelValue: level + i / 10 },
    ],
  })),
  versions: [{ version: 'PRiSM' }],
})

suite('catalog diff (admin API)', () => {
  const t = makeCatalogTestApp(url!)
  const json = async (path: string, headers?: Record<string, string>) => {
    const res = await t.get(path, headers)
    return { status: res.status, body: (await res.json()) as any }
  }

  beforeAll(() => createCatalogFixtureSchema(t.pool))
  beforeEach(async () => {
    clearDiffCache()
    await clearCatalogFixture(t.pool)
    await publishFixture(t.pool, { revision: 1, body: catalog(13, 2), publishedAt: '2026-11-01T00:00:00Z' })
    await publishFixture(t.pool, { revision: 2, body: catalog(13, 3), publishedAt: '2026-11-02T00:00:00Z' })
    await publishFixture(t.pool, { revision: 3, body: catalog(14, 3), publishedAt: '2026-11-03T00:00:00Z' })
  })
  afterAll(() => t.close())

  it('defaults to the latest publication against the one before it', async () => {
    const { status, body } = await json('/catalog/diff')
    expect(status).toBe(200)
    expect([body.from.revision, body.to.revision]).toEqual([2, 3])
    expect(body.summary).toMatchObject({ songsChanged: 3, sheetsChanged: 3, fieldChanges: 3 })
    expect(body.pathCounts).toEqual([{ path: 'sheets[].internalLevelValue', count: 3 }])
    expect(body.songs[0]).toEqual({
      songId: 'dsng_synthetic0',
      title: 'Synthetic 0',
      kind: 'changed',
      fields: [],
      sheets: [
        {
          id: 'dsht_synthetic0',
          type: 'dx',
          difficulty: 'master',
          kind: 'changed',
          fields: [{ path: 'internalLevelValue', before: 13, after: 14 }],
        },
      ],
    })
    expect(body.updateTime).toEqual({ before: 't13', after: 't14' })
  })

  it('compares any two revisions, filters by path and pages by song', async () => {
    const all = await json('/catalog/diff?from=1&to=3&limit=2')
    expect(all.body.summary).toMatchObject({ songsAdded: 1, songsChanged: 2 })
    expect(all.body.songsTotal).toBe(3)
    expect(all.body.songs.map((s: any) => s.songId)).toEqual(['dsng_synthetic0', 'dsng_synthetic1'])
    expect(all.body.nextOffset).toBe(2)
    const rest = await json('/catalog/diff?from=1&to=3&limit=2&offset=2')
    expect(rest.body.songs.map((s: any) => [s.songId, s.kind])).toEqual([['dsng_synthetic2', 'added']])
    expect(rest.body.nextOffset).toBeNull()
    const added = await json(`/catalog/diff?from=1&to=3&path=${encodeURIComponent('songs (added)')}`)
    expect(added.body.songs.map((s: any) => s.songId)).toEqual(['dsng_synthetic2'])
    expect(added.body.path).toBe('songs (added)')
  })

  it('answers 404 for a missing revision or when there is nothing before it', async () => {
    expect((await json('/catalog/diff?to=9')).status).toBe(404)
    expect((await json('/catalog/diff?from=9&to=3')).status).toBe(404)
    const first = await json('/catalog/diff?to=1')
    expect(first.status).toBe(404)
    expect(first.body.message).toContain('first publication')
  })

  it('needs catalog:read for agents', async () => {
    expect((await t.get('/catalog/diff', t.agent(CATALOG_READER))).status).toBe(200)
    expect((await t.get('/catalog/diff', t.agent(ANNOUNCEMENT_READER))).status).toBe(403)
  })
})