import { useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import type { z } from 'zod'
import { authClient } from '../../../lib/auth-client'
import { TAG_SONG_HIDDEN_SCORE_THRESHOLD, type SheetTagSongSchema } from '../../../lib/contract'
import { apiClient as client } from '../../../lib/orpc'
import { type CombinedTags, useCombinedTags, withSheetTagSongs } from '../../../models/useCombinedTags'
import type { FlattenedSheet } from '../../../songs'

export type SheetTagSong = z.infer<typeof SheetTagSongSchema>

export const sheetTagsDetailedKey = (sheet: Pick<FlattenedSheet, 'songId' | 'type' | 'difficulty'>) =>
  ['tags.sheetTags', sheet.songId, sheet.type, sheet.difficulty] as const

/** Scoped to the signed-in account, so switching accounts never shows another user's votes. */
export const userTagVotesKey = (userId: string | undefined, tagSongIds: readonly number[]) =>
  !userId || tagSongIds.length === 0 ? null : (['tags.userVotes', userId, tagSongIds.join(',')] as const)

/**
 * Per-sheet tag associations with their full vote breakdown, including the ones
 * buried below {@link TAG_SONG_HIDDEN_SCORE_THRESHOLD} that the global tag list
 * filters out. Tag and group metadata is joined in from the cached global list.
 */
export const useSheetTagsDetailed = (sheet: FlattenedSheet) => {
  const { data: combinedTags } = useCombinedTags()
  const { mutate: globalMutate } = useSWRConfig()

  const { data, isLoading, error, mutate } = useSWR(sheetTagsDetailedKey(sheet), async () =>
    client.tags.sheetTags({
      songId: sheet.songId,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
    }),
  )

  const groupOrder = combinedTags?.tagGroups.map((g) => g.id) ?? []

  const entries = (data ?? [])
    .flatMap((association) => {
      const tag = combinedTags?.tags.find((t) => t.id === association.tag_id)
      if (!tag) return []
      return [
        {
          ...association,
          tag,
          group: combinedTags?.tagGroups.find((group) => group.id === tag.group_id),
          hidden: association.score <= TAG_SONG_HIDDEN_SCORE_THRESHOLD,
        },
      ]
    })
    .sort((a, b) => groupOrder.indexOf(a.tag.group_id ?? -1) - groupOrder.indexOf(b.tag.group_id ?? -1))

  // Attaching, detaching and voting change which associations the global list shows. Its copy comes through the edge
  // cache, so refetching it right after a write would bring back the copy from before the write; this sheet's part of
  // it is rebuilt from the fresh per-sheet read instead.
  const refresh = useCallback(async () => {
    const fresh = await mutate()
    if (!fresh) return
    await globalMutate(
      'tags.list',
      (current: CombinedTags | undefined) =>
        withSheetTagSongs(
          current,
          { song_id: sheet.songId, sheet_type: sheet.type, sheet_difficulty: sheet.difficulty },
          fresh,
          TAG_SONG_HIDDEN_SCORE_THRESHOLD,
        ),
      { revalidate: false },
    )
  }, [mutate, globalMutate, sheet.songId, sheet.type, sheet.difficulty])

  return {
    data: entries,
    // Tag metadata is required before an entry can be rendered at all.
    isLoading: isLoading || !combinedTags,
    error,
    mutate: refresh,
  }
}

export type SheetTagEntry = ReturnType<typeof useSheetTagsDetailed>['data'][number]

/** The signed-in user's own votes for the given associations, keyed by id. */
export const useUserTagVotes = (tagSongIds: readonly number[]) => {
  const { data: sessionData } = authClient.useSession()

  const { data, mutate } = useSWR(
    userTagVotesKey(sessionData?.user?.id, tagSongIds),
    async () => client.tags.userVotes({ tagSongIds: [...tagSongIds] }),
    { revalidateOnFocus: false },
  )

  return { data: data ?? {}, mutate }
}