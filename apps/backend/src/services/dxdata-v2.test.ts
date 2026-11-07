import { createHash } from 'node:crypto'
import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { fromV2Catalog, fromV2Community, toV2Catalog, toV2Community, type CatalogV1 } from '@gekichumai/dxdata/v2'
import { Effect } from 'effect'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it } from 'vitest'
import { createDxdataEffect, DXDATA_CORS_OPTIONS } from './dxdata'
import { createDxdataV2Store, DXDATA_V2_CACHE_TAG, DXDATA_V2_PATH } from './dxdata-v2'

const { tagGroups, tags, tagSongs, aliases, ...v1Catalog } = catalogSnapshot

const hasNull = (value: unknown): boolean =>
  value === null || (typeof value === 'object' && Object.values(value as object).some(hasNull))

describe('dxdata v2 catalog', () => {
  const v2 = toV2Catalog(catalogSnapshot)

  it('rebuilds the v1 catalog exactly, without its community data', () => {
    expect(fromV2Catalog(v2)).toEqual(v1Catalog)
  })

  it('is smaller than the v1 catalog part and has no community data or nulls', () => {
    const v1Bytes = Buffer.byteLength(JSON.stringify(v1Catalog))
    const v2Bytes = Buffer.byteLength(JSON.stringify(v2))
    expect(v2Bytes / v1Bytes).toBeLessThan(0.9)
    expect(v2.schemaVersion).toBe(2)
    expect(Object.keys(v2)).not.toEqual(expect.arrayContaining(['tagGroups', 'tags', 'tagSongs', 'aliases']))
    expect(hasNull(v2)).toBe(false)
  })

  it('leaves out only defaults and passes unknown fields through', () => {
    const song = catalogSnapshot.songs.find((candidate) => candidate.sheets.length > 1)!
    const source: CatalogV1 = {
      ...v1Catalog,
      songs: [
        {
          ...song,
          isNew: false,
          isLocked: true,
          searchAcronyms: [],
          reading: 'よみ',
          sheets: [
            { ...song.sheets[0]!, serverIds: catalogSnapshot.servers.map((server) => server.id), isSpecial: false },
            { ...song.sheets[1]!, serverIds: [], isSpecial: true, version: 'BUDDiES' },
          ],
        } as SongCatalogDocument['songs'][number],
      ],
    }
    const [v2Song] = toV2Catalog(source).songs
    expect(v2Song).not.toHaveProperty('isNew')
    expect(v2Song).not.toHaveProperty('searchAcronyms')
    expect(v2Song).toMatchObject({ isLocked: true, reading: 'よみ' })
    expect(v2Song!.sheets[0]).not.toHaveProperty('serverIds')
    expect(v2Song!.sheets[0]).not.toHaveProperty('isSpecial')
    expect(v2Song!.sheets[1]).toMatchObject({ serverIds: [], isSpecial: true, version: 'BUDDiES' })
    expect(fromV2Catalog(toV2Catalog(source))).toEqual(source)
  })
})

describe('dxdata v2 community overlay', () => {
  const overlay = toV2Community({ tagGroups, tags, tagSongs }, aliases)
  const key = (tagSong: { tag_id: number; sheet_id: string }) => `${tagSong.tag_id}:${tagSong.sheet_id}`

  it('rebuilds the v1 tag and alias lists, each association and alias once', () => {
    const rebuilt = fromV2Community(overlay, v1Catalog)
    expect(rebuilt.tagGroups).toEqual(tagGroups)
    expect(rebuilt.tags).toEqual(tags)
    expect(new Set(rebuilt.tagSongs.map(key))).toEqual(new Set(tagSongs.map(key)))
    expect(rebuilt.tagSongs).toHaveLength(new Set(tagSongs.map(key)).size)
    for (const tagSong of rebuilt.tagSongs) expect(tagSongs).toContainEqual(tagSong)
    const aliasKey = (alias: { song_id: string; name: string }) => `${alias.song_id}\u0000${alias.name}`
    expect(new Set(rebuilt.aliases.map(aliasKey))).toEqual(new Set(aliases.map(aliasKey)))
    expect(rebuilt.aliases).toHaveLength(new Set(aliases.map(aliasKey)).size)
  })

  it('is a fraction of the v1 tag and alias lists', () => {
    const v1Bytes = Buffer.byteLength(JSON.stringify({ tagGroups, tags, tagSongs, aliases }))
    expect(Buffer.byteLength(JSON.stringify(overlay)) / v1Bytes).toBeLessThan(0.4)
    expect(hasNull(overlay)).toBe(false)
  })

  it('leaves out sheets and songs the catalog does not have', () => {
    const sheet = catalogSnapshot.songs[0]!.sheets[0]!
    const skewed = {
      ...overlay,
      sheetTags: { '1': [sheet.id, 'dsht_unknown000'] },
      aliases: { [catalogSnapshot.songs[0]!.id]: ['known'], dsng_unknown000: ['gone'] },
    }
    const rebuilt = fromV2Community(skewed, v1Catalog)
    expect(rebuilt.tagSongs.map((tagSong) => tagSong.sheet_id)).toEqual([sheet.id])
    expect(rebuilt.aliases).toEqual([{ song_id: catalogSnapshot.songs[0]!.id, name: 'known' }])
  })

  it('skips associations without a public sheet ID', () => {
    const legacy = toV2Community({ tagGroups, tags, tagSongs: [{ tag_id: 1 }] }, [])
    expect(legacy.sheetTags).toEqual({})
  })
})
describe('dxdata v2 endpoint', () => {
  const v1Body = JSON.stringify(catalogSnapshot)
  const v1Metadata = {
    catalogRunId: '7',
    bodySha256: 'a'.repeat(64),
    byteLength: Buffer.byteLength(v1Body).toString(),
    contentType: 'application/json; charset=utf-8',
  }

  const createApp = (body: string = v1Body) => {
    const calls: string[] = []
    let metadata: typeof v1Metadata | undefined = v1Metadata
    let current: string | undefined = body
    const errors: unknown[] = []
    const store = createDxdataV2Store({
      getPublishedMetadata: () => Effect.sync(() => (calls.push('metadata'), metadata)),
      getSnapshotBody: () => Effect.sync(() => (calls.push('body'), current)),
    })
    const handler = createDxdataEffect(store, (error) => void errors.push(error), undefined, DXDATA_V2_CACHE_TAG)
    const app = new Hono()
    app.use('*', cors(DXDATA_CORS_OPTIONS))
    app.on(['GET', 'HEAD'], DXDATA_V2_PATH, (context) => Effect.runPromise(handler(context)))
    const publish = (next: { metadata?: typeof v1Metadata; body?: string }) => {
      metadata = next.metadata
      current = next.body
    }
    return { app, calls, errors, publish }
  }

  it('serves the published catalog as v2 under the sha256 of the v2 body', async () => {
    const { app } = createApp()
    const response = await app.request(DXDATA_V2_PATH, { headers: { Origin: 'https://example.app' } })

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual(toV2Catalog(catalogSnapshot))
    expect(response.headers.get('etag')).toBe(`"${createHash('sha256').update(text).digest('hex')}"`)
    expect(response.headers.get('content-length')).toBe(Buffer.byteLength(text).toString())
    expect(response.headers.get('cache-tag')).toBe(DXDATA_V2_CACHE_TAG)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('builds v2 once per published body, so revalidations cost only the metadata query', async () => {
    const { app, calls } = createApp()
    const first = await app.request(DXDATA_V2_PATH)
    const etag = first.headers.get('etag')!
    await first.arrayBuffer()

    const revalidated = await app.request(DXDATA_V2_PATH, { headers: { 'If-None-Match': etag } })
    expect(revalidated.status).toBe(304)
    await (await app.request(DXDATA_V2_PATH)).arrayBuffer()
    expect(calls.filter((call) => call === 'body')).toHaveLength(1)
  })

  it('builds again when a new catalog is published', async () => {
    const { app, publish } = createApp()
    const before = (await app.request(DXDATA_V2_PATH)).headers.get('etag')
    const next = { ...catalogSnapshot, updatedAt: '2030-01-01T00:00:00Z' }
    publish({ metadata: { ...v1Metadata, bodySha256: 'b'.repeat(64) }, body: JSON.stringify(next) })

    const response = await app.request(DXDATA_V2_PATH)
    expect(response.headers.get('etag')).not.toBe(before)
    expect((await response.json()).updatedAt).toBe('2030-01-01T00:00:00Z')
  })

  it('answers an uncached 503 without a publication or its body, and an uncached 500 for a body it cannot read', async () => {
    const missing = createApp()
    missing.publish({ metadata: undefined })
    expect((await missing.app.request(DXDATA_V2_PATH)).status).toBe(503)

    const noBody = createApp()
    noBody.publish({ metadata: v1Metadata, body: undefined })
    const unavailable = await noBody.app.request(DXDATA_V2_PATH)
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('cache-control')).toBe('no-store')

    const broken = createApp('{not json')
    const failed = await broken.app.request(DXDATA_V2_PATH)
    expect(failed.status).toBe(500)
    expect(failed.headers.get('cache-control')).toBe('no-store')
    expect(broken.errors).toHaveLength(1)
  })
})