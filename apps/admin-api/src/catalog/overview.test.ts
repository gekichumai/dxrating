import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDiffCache } from './publication-diff'
import { clearCatalogFixture, createCatalogFixtureSchema, observeSourceFixture, publishFixture } from './test-fixture'
import { ANNOUNCEMENT_READER, CATALOG_READER, makeCatalogTestApp } from './test-harness'

// Integration: a real Postgres (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL). Synthetic catalog data only.
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const catalog = (level: number) => ({
  schemaVersion: 1,
  updatedAt: 't',
  songs: [
    {
      id: 'dsng_synthetic1',
      title: 'S',
      sheets: [{ id: 'dsht_synthetic1', type: 'dx', difficulty: 'master', internalLevelValue: level }],
    },
  ],
})

suite('catalog overview (admin API)', () => {
  const t = makeCatalogTestApp(url!)
  const json = async (p: string, headers?: Record<string, string>) => {
    const res = await t.get(p, headers)
    return { status: res.status, body: (await res.json()) as any }
  }

  beforeAll(() => createCatalogFixtureSchema(t.pool))
  beforeEach(async () => {
    clearDiffCache()
    await clearCatalogFixture(t.pool)
  })
  afterAll(() => t.close())

  it('shows the current publication with its age, source freshness and the latest change', async () => {
    const day = 86_400_000
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()
    await publishFixture(t.pool, { revision: 1, body: catalog(13.5), publishedAt: at(3) })
    await publishFixture(t.pool, {
      revision: 2,
      body: catalog(13.7),
      publishedAt: at(1),
      manifest: { schemaVersion: 1 },
    })
    await observeSourceFixture(
      t.pool,
      { id: 'sega_official_jp', name: 'SEGA JP', kind: 'catalog', authoritative: true },
      [
        { at: at(5), items: 1790 },
        { at: at(1), items: 1803 },
        { at: at(0.5), items: 0, status: 'failed' },
      ],
    )
    await observeSourceFixture(t.pool, { id: 'never_seen', name: 'Never', kind: 'alias' }, [])

    const { status, body } = await json('/catalog/overview')
    expect(status).toBe(200)
    expect(body.current).toMatchObject({ revision: 2, hasProvenanceManifest: true, publicationCount: 2, songCount: 1 })
    expect(Math.round(body.current.ageSeconds / 86_400)).toBe(1)
    expect(body.latestChange).toMatchObject({
      from: 1,
      to: 2,
      summary: { sheetsChanged: 1 },
      pathCounts: [{ path: 'sheets[].internalLevelValue', count: 1 }],
    })
    // The latest *succeeded* observation counts; a failed row is not one
    const sega = body.sources.find((s: any) => s.id === 'sega_official_jp')
    expect(sega).toMatchObject({ authoritative: true, itemCount: 1803, observations: 2, scope: 'catalog' })
    expect(Math.round(sega.ageSeconds / 86_400)).toBe(1)
    expect(body.sources.find((s: any) => s.id === 'never_seen')).toMatchObject({
      lastObservedAt: null,
      observations: 0,
    })
    expect(body.failures.recorded).toBe(false)
  })

  it('is empty, not an error, before anything is published, and still lists sources; needs catalog:read', async () => {
    await observeSourceFixture(t.pool, { id: 'sega_official_jp', name: 'SEGA JP', kind: 'catalog' }, [
      { at: new Date().toISOString(), items: 10 },
    ])
    const { status, body } = await json('/catalog/overview')
    expect(status).toBe(200)
    expect([body.current, body.latestChange]).toEqual([null, null])
    expect(body.sources.map((s: any) => [s.id, s.itemCount])).toEqual([['sega_official_jp', 10]])
    expect((await t.get('/catalog/overview', t.agent(CATALOG_READER))).status).toBe(200)
    expect((await t.get('/catalog/overview', t.agent(ANNOUNCEMENT_READER))).status).toBe(403)
  })
})