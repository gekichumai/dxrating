import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlattenedSheet } from '../../../../songs'

type Association = { id: number; tag_id: number; score: number }

const state = vi.hoisted(() => ({
  sheetTags: [] as Association[],
  listCalls: 0,
}))

const sheet = { songId: 'dsng_a', type: 'dx', difficulty: 'master' } as unknown as FlattenedSheet
const otherSheet = { song_id: 'dsng_b', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 1, score: 1 }
const onSheet = (association: Association) => ({
  ...association,
  song_id: 'dsng_a',
  sheet_type: 'dx',
  sheet_difficulty: 'master',
  created_at: '2026-11-08T00:00:00Z',
  created_by: 'user',
  upvotes: Math.max(association.score, 0),
  downvotes: Math.max(-association.score, 0),
})

vi.mock('../../../../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}))

vi.mock('../../../../lib/orpc', () => ({
  apiClient: {
    tags: {
      // The edge-cached shared list: it keeps answering with the copy from before any write.
      list: vi.fn(async () => {
        state.listCalls++
        return {
          tags: [
            { id: 1, localized_name: { en: 'Stamina' }, localized_description: { en: '' }, group_id: null },
            { id: 2, localized_name: { en: 'Trill' }, localized_description: { en: '' }, group_id: null },
          ],
          tagGroups: [],
          tagSongs: [
            otherSheet,
            { song_id: 'dsng_a', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 1, score: 1 },
            { song_id: 'dsng_a', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 2, score: -2 },
          ],
        }
      }),
      sheetTags: vi.fn(async () => state.sheetTags.map(onSheet)),
    },
  },
}))

const { useSheetTagsDetailed } = await import('../useSheetTagsDetailed')
const { useCombinedTags } = await import('../../../../models/useCombinedTags')

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)

const render = async () => {
  const hook = renderHook(() => ({ detailed: useSheetTagsDetailed(sheet), combined: useCombinedTags() }), { wrapper })
  await waitFor(() => expect(hook.result.current.detailed.data).toHaveLength(state.sheetTags.length))
  return hook
}

const sheetTagIds = (tagSongs: readonly { song_id: string; tag_id: number }[] | undefined) =>
  (tagSongs ?? []).filter((tagSong) => tagSong.song_id === 'dsng_a').map((tagSong) => tagSong.tag_id)

afterEach(cleanup)

describe('useSheetTagsDetailed refresh', () => {
  it('drops a removed association from the shared tag list', async () => {
    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    const { result } = await render()
    expect(sheetTagIds(result.current.combined.data?.tagSongs)).toEqual([1, 2])

    state.sheetTags = [{ id: 11, tag_id: 2, score: -2 }]
    await act(() => result.current.detailed.mutate())

    expect(sheetTagIds(result.current.combined.data?.tagSongs)).toEqual([2])
    expect(result.current.combined.data?.tagSongs).toContainEqual(otherSheet)
  })

  it('drops an association a vote buries, and brings it back when a vote lifts it', async () => {
    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    const { result } = await render()
    const listCalls = state.listCalls

    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -3 },
    ]
    await act(() => result.current.detailed.mutate())
    expect(sheetTagIds(result.current.combined.data?.tagSongs)).toEqual([1])

    state.sheetTags = [
      { id: 10, tag_id: 1, score: 1 },
      { id: 11, tag_id: 2, score: -2 },
    ]
    await act(() => result.current.detailed.mutate())
    expect(sheetTagIds(result.current.combined.data?.tagSongs)).toEqual([1, 2])
    // Reconciled locally: the edge-cached copy is not refetched
    expect(state.listCalls).toBe(listCalls)
  })
})