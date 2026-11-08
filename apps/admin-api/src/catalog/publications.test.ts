import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearCatalogFixture, createCatalogFixtureSchema, publishFixture } from './test-fixture'
import { ANNOUNCEMENT_READER, CATALOG_READER, makeCatalogTestApp } from './test-harness'

// Integration: a real Postgres (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL). Synthetic catalog data only.
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const catalog = (title: string) => ({
  songs: [{ songId: 'synthetic-song', title, sheets: [{ type: 'dx', difficulty: 'master', level: '13' }] }],
  versions: [],
})

suite('catalog publications (admin API)', () => {
  const t = makeCatalogTestApp(url!)

  beforeAll(() => createCatalogFixtureSchema(t.pool))
  beforeEach(async () => {
    await clearCatalogFixture(t.pool)
    await publishFixture(t.pool, {
      revision: 1,
      body: catalog('One'),
      publishedAt: '2026-11-01T00:00:00Z',
      legacyGitCommitSha: 'b'.repeat(40),
    })
    await publishFixture(t.pool, { revision: 2, body: catalog('Two'), publishedAt: '2026-11-02T00:00:00Z' })
    await publishFixture(t.pool, {
      revision: 3,
      body: catalog('Three'),
      publishedAt: '2026-11-03T00:00:00Z',
      manifest: { schemaVersion: 1 },
    })
    await publishFixture(t.pool, {
      channel: 'staging-v1',
      revision: 1,
      body: catalog('Staging'),
      publishedAt: '2026-11-03T00:00:00Z',
    })
  })
  afterAll(() => t.close())

  it('lists the channel’s publications newest first, marking the current one', async () => {
    const res = await t.get('/catalog/publications')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const out = (await res.json()) as any
    expect(out.channel).toBe('production-v1')
    expect(out.channels).toEqual(['production-v1', 'staging-v1'])
    expect(out.publications.map((p: any) => [p.revision, p.current, p.hasProvenanceManifest])).toEqual([
      [3, true, true],
      [2, false, false],
      [1, false, false],
    ])
    expect(out.publications[2]).toMatchObject({
      publishedAt: '2026-11-01T00:00:00.000Z',
      legacyGitCommitSha: 'b'.repeat(40),
      songCount: 1,
      sheetCount: 1,
      apiSchemaVersion: 1,
    })
    expect(out.publications[0].bodySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.nextBefore).toBeNull()
  })

  it('pages with before/nextBefore', async () => {
    const first = (await (await t.get('/catalog/publications?limit=2')).json()) as any
    expect(first.publications.map((p: any) => p.revision)).toEqual([3, 2])
    expect(first.nextBefore).toBe(2)
    const second = (await (await t.get('/catalog/publications?limit=2&before=2')).json()) as any
    expect(second.publications.map((p: any) => p.revision)).toEqual([1])
    expect(second.nextBefore).toBeNull()
  })

  it('reads another channel', async () => {
    const out = (await (await t.get('/catalog/publications?channel=staging-v1')).json()) as any
    expect(out.publications.map((p: any) => [p.revision, p.current])).toEqual([[1, true]])
  })

  it('needs catalog:read for agents', async () => {
    expect((await t.get('/catalog/publications', t.agent(CATALOG_READER))).status).toBe(200)
    expect((await t.get('/catalog/publications', t.agent(ANNOUNCEMENT_READER))).status).toBe(403)
    expect((await t.get('/catalog/publications', {})).status).toBe(401)
  })

  it('rejects a malformed channel or limit', async () => {
    expect((await t.get('/catalog/publications?channel=Bad%20Channel')).status).toBe(400)
    expect((await t.get('/catalog/publications?limit=500')).status).toBe(400)
  })
})