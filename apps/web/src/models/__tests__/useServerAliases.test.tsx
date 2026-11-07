import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoadedCatalogDocumentForTests } from '../../catalog/clientCatalog'
import { resetCommunityListsForTests } from '../../catalog/communityOverlay'
import { useServerAliases } from '../useServerAliases'

const [first, ...rest] = catalogSnapshot.songs
const newSong = { ...first!, id: 'dsng_newsong000' }
const overlay = toV2Community({ tagGroups: [], tags: [], tagSongs: [] }, [{ song_id: newSong.id, name: 'new alias' }])

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)

describe('useServerAliases', () => {
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

  it('picks up the aliases of songs a refreshed catalog adds', async () => {
    const { result } = renderHook(() => useServerAliases(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))

    act(() => {
      setLoadedCatalogDocumentForTests({
        ...catalogSnapshot,
        updatedAt: '2099-01-01T00:00:00Z',
        songs: [first!, newSong, ...rest],
      })
    })
    await waitFor(() => expect(result.current.data).toEqual([{ song_id: newSong.id, name: 'new alias' }]))
  })
})