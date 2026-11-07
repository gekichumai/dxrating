import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { fromV2Catalog, fromV2Community, toV2Catalog, toV2Community, type CatalogV1 } from '@gekichumai/dxdata/v2'
import { describe, expect, it } from 'vitest'

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