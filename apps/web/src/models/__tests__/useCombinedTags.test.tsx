import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoadedCatalogDocumentForTests } from '../../catalog/clientCatalog'
import { resetCommunityListsForTests } from '../../catalog/communityOverlay'
import { useCombinedTags } from '../useCombinedTags'

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
  afterEach(() => vi.unstubAllGlobals())
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
})