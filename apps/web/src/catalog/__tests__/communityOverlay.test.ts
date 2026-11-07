import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoadedCatalogDocumentForTests } from '../clientCatalog'
import { COMMUNITY_URL, loadCommunityLists, resetCommunityListsForTests } from '../communityOverlay'

const song = catalogSnapshot.songs[0]!
const sheet = song.sheets[0]!
const overlay = toV2Community(
  {
    tagGroups: [{ id: 1, localized_name: { en: 'Patterns' }, color: '#7dd3fc' }],
    tags: [{ id: 3, localized_name: { en: 'Spinning' }, localized_description: { en: '…' }, group_id: 1 }],
    tagSongs: [
      { tag_id: 3, sheet_id: sheet.id },
      { tag_id: 3, sheet_id: 'dsht_notincatalog' },
    ],
  },
  [
    { song_id: song.id, name: 'alias' },
    { song_id: 'dsng_notincatalog', name: 'gone' },
  ],
)

describe('community overlay loading', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    resetCommunityListsForTests()
    setLoadedCatalogDocumentForTests(catalogSnapshot)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => vi.unstubAllGlobals())
  afterAll(() => resetCommunityListsForTests())

  it('rebuilds the tag and alias lists against the catalog, leaving out what it does not have', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(overlay))

    const lists = await loadCommunityLists()

    expect(fetchMock).toHaveBeenCalledWith(COMMUNITY_URL)
    expect(lists.tagSongs).toEqual([
      { song_id: song.id, sheet_id: sheet.id, sheet_type: sheet.type, sheet_difficulty: sheet.difficulty, tag_id: 3 },
    ])
    expect(lists.aliases).toEqual([{ song_id: song.id, name: 'alias' }])
    expect(lists.tags).toEqual(overlay.tags)
    expect(lists.tagGroups).toEqual(overlay.tagGroups)
  })

  it('shares one request between the tag and alias hooks', async () => {
    fetchMock.mockResolvedValue(Response.json(overlay))

    await Promise.all([loadCommunityLists(), loadCommunityLists()])
    await loadCommunityLists()

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('resolves against the catalog current at each call, so a catalog refresh brings in new songs', async () => {
    const newSheet = { ...sheet, id: 'dsht_newsheet00' }
    const withNewSheet = toV2Community(
      { tagGroups: overlay.tagGroups, tags: overlay.tags, tagSongs: [{ tag_id: 3, sheet_id: newSheet.id }] },
      [],
    )
    fetchMock.mockResolvedValue(Response.json(withNewSheet))
    expect((await loadCommunityLists()).tagSongs).toEqual([])

    // A background revalidation publishes a catalog with the new sheet; the overlay request is still shared
    setLoadedCatalogDocumentForTests({
      ...catalogSnapshot,
      updatedAt: '2099-01-01T00:00:00Z',
      songs: [{ ...song, sheets: [...song.sheets, newSheet] }, ...catalogSnapshot.songs.slice(1)],
    })
    expect((await loadCommunityLists()).tagSongs.map((tagSong) => tagSong.sheet_id)).toEqual([newSheet.id])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('tries again after a failed load, and refuses a document of another schema', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(loadCommunityLists()).rejects.toThrow('HTTP 503')

    fetchMock.mockResolvedValueOnce(Response.json({ schemaVersion: 1, tags: [] }))
    await expect(loadCommunityLists()).rejects.toThrow('not a v2 community document')

    fetchMock.mockResolvedValueOnce(Response.json(overlay))
    await expect(loadCommunityLists()).resolves.toMatchObject({ aliases: [{ song_id: song.id, name: 'alias' }] })
  })
})