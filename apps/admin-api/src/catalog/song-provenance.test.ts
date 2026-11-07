import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearSnapshotCache } from './provenance'
import {
  clearCatalogFixture,
  createCatalogFixtureSchema,
  mapSongFixture,
  publishFixture,
  renameLegacySongFixture,
} from './test-fixture'
import { ANNOUNCEMENT_READER, CATALOG_READER, makeCatalogTestApp } from './test-harness'

// Integration: a real Postgres (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL). Synthetic catalog data only.
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const fieldRules = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/producer-field-rules.json'), 'utf8'),
)

// The published song-catalog v1 shape; the manifest (like the producer's) is keyed by legacy song IDs
const catalog = (level: number) => ({
  schemaVersion: 1,
  updatedAt: 't',
  songs: [
    {
      id: 'dsng_synthetic1',
      title: 'Synthetic One',
      artist: 'Demo Artist',
      reading: 'しんせてぃっく',
      readingSource: 'title_readings',
      searchAcronyms: ['so'],
      sheets: [
        {
          id: 'dsht_synthetic1',
          type: 'dx',
          difficulty: 'master',
          level: '13',
          internalLevelValue: level,
          serverIds: ['jp', 'intl'],
          serverOverrides: { intl: { level: '13+' } },
        },
      ],
    },
    { id: 'dsng_synthetic2', title: 'Another Tune', artist: 'Someone', searchAcronyms: ['xyz'], sheets: [] },
  ],
})
const manifest = {
  schemaVersion: 1,
  coverage: { leafFields: 10, tracedLeafFields: 10, percent: 100, unmatchedPaths: [] },
  fieldRules,
  sources: {
    assembly: {
      sources: { sega_official_jp: { path: 'official/jp.json', sha256: 'e'.repeat(64), recordCount: 2 } },
      songs: {
        'synthetic-one': { catalog: 'sega_official_jp', enrichment: 'otoge_db', regions: ['sega_official_jp'] },
      },
    },
    runtime: { files: { 'MusicSort.xml': 'f'.repeat(64) } },
  },
}

suite('song provenance (admin API)', () => {
  const t = makeCatalogTestApp(url!)
  const json = async (p: string, headers?: Record<string, string>) => {
    const res = await t.get(p, headers)
    return { status: res.status, body: (await res.json()) as any }
  }

  beforeAll(() => createCatalogFixtureSchema(t.pool))
  beforeEach(async () => {
    clearSnapshotCache()
    await clearCatalogFixture(t.pool)
    await mapSongFixture(t.pool, 'dsng_synthetic1', 'synthetic-one')
    await publishFixture(t.pool, { revision: 1, body: catalog(13.2), publishedAt: '2026-11-01T00:00:00Z' })
    await publishFixture(t.pool, { revision: 2, body: catalog(13.4), publishedAt: '2026-11-02T00:00:00Z', manifest })
  })
  afterAll(() => t.close())

  it('searches a publication by id, title, artist or acronym', async () => {
    const byTitle = await json('/catalog/songs?q=synthetic%20one')
    expect(byTitle.body.publication.revision).toBe(2)
    expect(byTitle.body.songs).toEqual([
      { songId: 'dsng_synthetic1', title: 'Synthetic One', artist: 'Demo Artist', sheetCount: 1 },
    ])
    expect((await json('/catalog/songs?q=XYZ')).body.songs.map((s: any) => s.songId)).toEqual(['dsng_synthetic2'])
    expect((await json(`/catalog/songs?q=${encodeURIComponent('しんせ')}`)).body.total).toBe(1)
    const all = await json('/catalog/songs?limit=1')
    expect([all.body.total, all.body.songs.length]).toEqual([2, 1])
  })

  it('returns each value with its rule and the source this song came from', async () => {
    const { status, body } = await json('/catalog/song?songId=dsng_synthetic1')
    expect(status).toBe(200)
    expect(body.song).toEqual({
      songId: 'dsng_synthetic1',
      legacySongId: 'synthetic-one',
      title: 'Synthetic One',
      artist: 'Demo Artist',
    })
    expect(body.lineage).toEqual(manifest.sources.assembly.songs['synthetic-one'])
    expect(body.manifest.sources.sega_official_jp.recordCount).toBe(2)
    const title = body.fields.find((f: any) => f.path === 'title')
    expect(title.value).toBe('Synthetic One')
    expect(title.rule.sources).toContainEqual({ source: 'assembly.songs.*.catalog', resolved: ['sega_official_jp'] })
    const acronyms = body.fields.find((f: any) => f.path === 'searchAcronyms')
    expect(acronyms.outputPath).toBe('songs[].searchAcronyms[]')
    expect(acronyms.rule).not.toBeNull()
    const sheet = body.sheets[0]
    expect(sheet.id).toBe('dsht_synthetic1')
    const level = sheet.fields.find((f: any) => f.path === 'internalLevelValue')
    expect(level).toMatchObject({ value: 13.4, rule: { outputPath: 'songs[].sheets[].internalLevelValue' } })
    // Published paths map to the legacy rules that cover them
    expect(sheet.fields.find((f: any) => f.path === 'serverIds').rule.outputPath).toBe('songs[].sheets[].regions.jp')
    expect(sheet.fields.find((f: any) => f.path === 'serverOverrides.intl.level').rule.outputPath).toBe(
      'songs[].sheets[].regionOverrides.intl.*',
    )
    // A public ID is not the legacy songId, so it does not borrow that rule
    expect(body.fields.find((f: any) => f.path === 'id')).toMatchObject({
      rule: null,
      note: expect.stringContaining('Public song ID'),
    })
    expect(sheet.fields.find((f: any) => f.path === 'id')).toMatchObject({
      rule: null,
      note: expect.stringContaining('Public sheet ID'),
    })
    expect(body.fields.find((f: any) => f.path === 'reading').rule.sources).toEqual([
      { source: 'readingSource', resolved: ['title_readings'] },
    ])
  })

  it('keeps a publication’s lineage after the song’s legacy ID is renamed', async () => {
    await renameLegacySongFixture(t.pool, 'dsng_synthetic1', 'synthetic-one-renamed')
    const { body } = await json('/catalog/song?songId=dsng_synthetic1&revision=2')
    expect(body.song.legacySongId).toBe('synthetic-one')
    expect(body.lineage).toEqual(manifest.sources.assembly.songs['synthetic-one'])
  })

  it('shows an older revision’s values, with no rules when it has no manifest', async () => {
    const { body } = await json('/catalog/song?songId=dsng_synthetic1&revision=1')
    expect(body.publication.revision).toBe(1)
    expect(body.manifest).toBeNull()
    expect(body.lineage).toBeNull()
    expect(body.sheets[0].fields.find((f: any) => f.path === 'internalLevelValue')).toMatchObject({
      value: 13.2,
      rule: null,
    })
  })

  it('answers 404 for an unknown song or revision, and needs catalog:read', async () => {
    expect((await json('/catalog/song?songId=nope')).status).toBe(404)
    expect((await json('/catalog/song?songId=dsng_synthetic2&revision=9')).status).toBe(404)
    expect((await t.get('/catalog/song?songId=dsng_synthetic2', t.agent(CATALOG_READER))).status).toBe(200)
    expect((await t.get('/catalog/songs', t.agent(ANNOUNCEMENT_READER))).status).toBe(403)
  })
})