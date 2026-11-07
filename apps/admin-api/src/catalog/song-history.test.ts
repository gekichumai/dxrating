import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearSongHistoryCache, fillSongHistoryCache } from './song-history'
import { clearCatalogFixture, createCatalogFixtureSchema, publishFixture } from './test-fixture'
import { ANNOUNCEMENT_READER, CATALOG_READER, makeCatalogTestApp } from './test-harness'

// Integration: a real Postgres (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL). Synthetic catalog data only.
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const song = (level: number, version = 'PRiSM') => ({
  id: 'dsng_synthetic1',
  title: 'Synthetic One',
  sheets: [
    { id: 'dsht_synthetic1', type: 'dx', difficulty: 'master', level: '13', internalLevelValue: level, version },
  ],
})
const catalog = (songs: unknown[]) => ({ schemaVersion: 1, updatedAt: 't', songs })

suite('song history (admin API)', () => {
  const t = makeCatalogTestApp(url!)
  const json = async (p: string, headers?: Record<string, string>) => {
    const res = await t.get(p, headers)
    return { status: res.status, body: (await res.json()) as any }
  }

  beforeAll(() => createCatalogFixtureSchema(t.pool))
  beforeEach(async () => {
    clearSongHistoryCache()
    await clearCatalogFixture(t.pool)
    // r1: absent · r2: added · r3: level change · r4: no change · r5: version change
    await publishFixture(t.pool, { revision: 1, body: catalog([]), publishedAt: '2026-11-01T00:00:00Z' })
    await publishFixture(t.pool, { revision: 2, body: catalog([song(13.5)]), publishedAt: '2026-11-02T00:00:00Z' })
    await publishFixture(t.pool, { revision: 3, body: catalog([song(13.7)]), publishedAt: '2026-11-03T00:00:00Z' })
    await publishFixture(t.pool, {
      revision: 4,
      body: { ...catalog([song(13.7)]), updatedAt: 'later' },
      publishedAt: '2026-11-04T00:00:00Z',
    })
    await publishFixture(t.pool, {
      revision: 5,
      body: catalog([song(13.7, 'CiRCLE')]),
      publishedAt: '2026-11-05T00:00:00Z',
    })
  })
  afterAll(() => t.close())

  it('lists what each publication changed in the song, newest first', async () => {
    const { status, body } = await json('/catalog/song/history?songId=dsng_synthetic1')
    expect(status).toBe(200)
    expect(body.title).toBe('Synthetic One')
    expect(body.entries.map((e: any) => [e.revision, e.present, e.change?.kind ?? null])).toEqual([
      [5, true, 'changed'],
      [4, true, null],
      [3, true, 'changed'],
      [2, true, 'added'],
      [1, false, null],
    ])
    expect(body.entries[0].change.sheets[0].fields).toEqual([{ path: 'version', before: 'PRiSM', after: 'CiRCLE' }])
    expect(body.entries[2].change.sheets[0]).toMatchObject({
      id: 'dsht_synthetic1',
      fields: [{ path: 'internalLevelValue', before: 13.5, after: 13.7 }],
    })
  })

  it('limits the window and gives the same answer from the cache', async () => {
    const first = await json('/catalog/song/history?songId=dsng_synthetic1&limit=2')
    expect(first.body.entries.map((e: any) => [e.revision, e.change?.kind ?? null])).toEqual([
      [5, 'changed'],
      [4, null],
    ])
    const again = await json('/catalog/song/history?songId=dsng_synthetic1&limit=2')
    expect(again.body).toEqual(first.body)
  })

  it('never reads an eviction as absence when the cache is full and partly warm', async () => {
    const full = await json('/catalog/song/history?songId=dsng_synthetic1')
    clearSongHistoryCache()
    // Warm only the newest two (now the oldest cache entries), then fill the cache to the brim: storing the other
    // three evicts those two hits mid-request
    await json('/catalog/song/history?songId=dsng_synthetic1&limit=2')
    fillSongHistoryCache(0)
    expect((await json('/catalog/song/history?songId=dsng_synthetic1')).body).toEqual(full.body)
  })

  it('reports an unknown song as absent everywhere, and needs catalog:read', async () => {
    const { body } = await json('/catalog/song/history?songId=dsng_nope')
    expect(body.title).toBeNull()
    expect(body.entries.every((e: any) => !e.present && e.change === null)).toBe(true)
    expect((await t.get('/catalog/song/history?songId=x', t.agent(CATALOG_READER))).status).toBe(200)
    expect((await t.get('/catalog/song/history?songId=x', t.agent(ANNOUNCEMENT_READER))).status).toBe(403)
  })
})