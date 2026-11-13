import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoadedCatalogDocumentForTests } from '../../../../catalog/clientCatalog'
import { resetCommunityListsForTests } from '../../../../catalog/communityOverlay'
import type { FlattenedSheet } from '../../../../songs'

type Association = { id: number; tag_id: number; score: number }

const song = catalogSnapshot.songs[0]!
const [chart, otherChart] = song.sheets as [(typeof song.sheets)[number], (typeof song.sheets)[number]]
const sheet = { id: chart.id, songId: song.id, type: chart.type, difficulty: chart.difficulty } as FlattenedSheet

const state = vi.hoisted(() => ({ sheetTags: [] as Association[] }))

vi.mock('../../../../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}))

vi.mock('../../../../lib/orpc', () => ({
  apiClient: {
    tags: {
      sheetTags: vi.fn(async () =>
        state.sheetTags.map((association) => ({
          ...association,
          song_id: song.id,
          sheet_type: chart.type,
          sheet_difficulty: chart.difficulty,
          created_at: '2026-11-08T00:00:00Z',
          created_by: 'user',
          upvotes: Math.max(association.score, 0),
          downvotes: Math.max(-association.score, 0),
        })),
      ),
    },
  },
}))

// The edge-cached overlay: it keeps answering with the copy from before any write
const overlay = toV2Community(
  {
    tagGroups: [],
    tags: [
      { id: 1, localized_name: { en: 'Stamina' }, localized_description: { en: '' } },
      { id: 2, localized_name: { en: 'Trill' }, localized_description: { en: '' } },
    ],
    tagSongs: [
      { tag_id: 1, sheet_id: chart.id },
      { tag_id: 2, sheet_id: chart.id },
      { tag_id: 1, sheet_id: otherChart.id },
    ],
  },
  [],
)

const { useSheetTagsDetailed } = await import('../useSheetTagsDetailed')
const { useCombinedTags } = await import('../../../../models/useCombinedTags')

const fetchMock = vi.fn(async () => Response.json(overlay))

const render = async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
  const hook = renderHook(() => ({ detailed: useSheetTagsDetailed(sheet), combined: useCombinedTags() }), { wrapper })
  await waitFor(() => expect(hook.result.current.detailed.data).toHaveLength(state.sheetTags.length))
  return hook
}

const tagIdsOn = (tagSongs: readonly { sheet_id?: string; tag_id: number }[] | undefined, sheetId: string) =>
  (tagSongs ?? [])
    .filter((tagSong) => tagSong.sheet_id === sheetId)
    .map((tagSong) => tagSong.tag_id)
    .sort()

beforeEach(() => {
  resetCommunityListsForTests()
  setLoadedCatalogDocumentForTests(catalogSnapshot)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
afterAll(() => {
  resetCommunityListsForTests()
  setLoadedCatalogDocumentForTests(catalogSnapshot)
})

describe('useSheetTagsDetailed refresh', () => {
  it('drops a removed association from the shared tag list, also after it reloads', async () => {
    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    const { result } = await render()
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([1, 2])

    state.sheetTags = [{ id: 11, tag_id: 2, score: -2 }]
    await act(() => result.current.detailed.mutate())
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([2])

    // A reload of the shared list (here, a forced one) gets the stale edge copy again; the removal stays
    await act(() => result.current.combined.mutate())
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([2])
    expect(tagIdsOn(result.current.combined.data?.tagSongs, otherChart.id)).toEqual([1])
  })

  it('drops an association a vote buries, and brings it back when a vote lifts it', async () => {
    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    const { result } = await render()

    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -3 },
    ]
    await act(() => result.current.detailed.mutate())
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([1])
    await act(() => result.current.combined.mutate())
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([1])

    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    await act(() => result.current.detailed.mutate())
    expect(tagIdsOn(result.current.combined.data?.tagSongs, chart.id)).toEqual([1, 2])
  })
})