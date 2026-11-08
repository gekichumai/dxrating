import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoadedCatalogDocumentForTests } from '../../catalog/clientCatalog'
import { rememberAttachedTag, resetCommunityListsForTests } from '../../catalog/communityOverlay'
import { useCombinedTags, withAttachedTag } from '../useCombinedTags'

const [first, ...rest] = catalogSnapshot.songs
const newSheet = { ...first!.sheets[0]!, id: 'dsht_newsheet00' }
const overlay = toV2Community(
  {
    tagGroups: [{ id: 1, localized_name: { en: 'Patterns' }, color: '#7dd3fc' }],
    tags: [{ id: 3, localized_name: { en: 'Spinning' }, localized_description: { en: '…' }, group_id: 1 }],
    tagSongs: [{ tag_id: 3, sheet_id: newSheet.id }],
  },
  [],
)

describe('useCombinedTags', () => {
  beforeEach(() => {
    resetCommunityListsForTests()
    setLoadedCatalogDocumentForTests(catalogSnapshot)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(overlay)),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  afterAll(() => {
    resetCommunityListsForTests()
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('re-resolves on mount after a catalog was published while nothing was mounted', async () => {
    // One SWR cache for both mounts, as navigating between pages keeps it; the hook's own options otherwise
    const cache = new Map()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
    )
    const firstMount = renderHook(() => useCombinedTags(), { wrapper })
    await waitFor(() => expect(firstMount.result.current.data?.tagSongs).toEqual([]))
    firstMount.unmount()

    setLoadedCatalogDocumentForTests({
      ...catalogSnapshot,
      updatedAt: '2099-01-02T00:00:00Z',
      songs: [{ ...first!, sheets: [...first!.sheets, newSheet] }, ...rest],
    })

    const secondMount = renderHook(() => useCombinedTags(), { wrapper })
    await waitFor(() =>
      expect(secondMount.result.current.data?.tagSongs.map((tagSong) => tagSong.sheet_id)).toEqual([newSheet.id]),
    )
  })

  it('recovers a catalog refresh that a local attachment overlapped, keeping the attachment', async () => {
    const cache = new Map()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
    )
    let respond!: (response: Response) => void
    const fetchMock = vi.fn(async () => Response.json(overlay))
    vi.stubGlobal('fetch', fetchMock)
    const realNow = Date.now.bind(Date)
    let offset = 0
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset)

    const firstMount = renderHook(() => useCombinedTags(), { wrapper })
    await waitFor(() => expect(firstMount.result.current.data?.tagSongs).toEqual([]))

    // Past the overlay-sharing window, a catalog with the new sheet is published; its refresh is held back
    offset += 60_000
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (respond = resolve)))
    act(() => {
      setLoadedCatalogDocumentForTests({
        ...catalogSnapshot,
        updatedAt: '2099-01-04T00:00:00Z',
        songs: [{ ...first!, sheets: [...first!.sheets, newSheet] }, ...rest],
      })
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    // The viewer attaches a tag meanwhile, as SheetTagsAddButton does; SWR discards the overlapping refresh
    const sheet = first!.sheets.find((candidate) => candidate.difficulty !== newSheet.difficulty)!
    const attached = {
      song_id: first!.id,
      sheet_id: sheet.id,
      sheet_type: sheet.type,
      sheet_difficulty: sheet.difficulty,
      tag_id: 3,
    }
    rememberAttachedTag(attached)
    await act(() =>
      firstMount.result.current.mutate((current) => withAttachedTag(current, attached), { revalidate: false }),
    )
    respond(Response.json(overlay))

    const expected = [newSheet.id, sheet.id].sort()
    await waitFor(() =>
      expect(firstMount.result.current.data?.tagSongs.map((tagSong) => tagSong.sheet_id).sort()).toEqual(expected),
    )
    firstMount.unmount()

    const secondMount = renderHook(() => useCombinedTags(), { wrapper })
    await waitFor(() =>
      expect(secondMount.result.current.data?.tagSongs.map((tagSong) => tagSong.sheet_id).sort()).toEqual(expected),
    )
  })
})