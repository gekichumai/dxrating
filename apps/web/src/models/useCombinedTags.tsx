import useSWR from 'swr'
import type { z } from 'zod'
import type { TagsListResponseSchema } from '../lib/contract'
import { loadCommunityLists } from '../catalog/communityOverlay'

export type CombinedTags = z.infer<typeof TagsListResponseSchema>
export type Tag = CombinedTags['tags'][number]
export type TagGroup = CombinedTags['tagGroups'][number]
export type TagSong = CombinedTags['tagSongs'][number]

export const useCombinedTags = () => {
  return useSWR(
    'tags.list',
    async () => {
      // From the v2 community overlay: the tag-sheet associations it keeps visible, resolved against the catalog
      const { tags, tagGroups, tagSongs } = await loadCommunityLists()
      return { tags, tagGroups, tagSongs } as CombinedTags
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
      revalidateOnFocus: false, // Disable revalidation on window focus
      revalidateOnReconnect: false, // Disable revalidation on network reconnection
      revalidateIfStale: false, // Don't revalidate if data exists but is stale
      dedupingInterval: 1000 * 60 * 60, // Dedupe requests within 1 hour
      suspense: false,
    },
  )
}

/**
 * The list with an association the viewer just attached. The shared list comes through the edge cache, which can
 * take a few minutes to include a new attachment, so the viewer's own write is added locally instead of refetched.
 */
export const withAttachedTag = (current: CombinedTags | undefined, tagSong: TagSong): CombinedTags | undefined => {
  if (!current) return current
  const exists = current.tagSongs.some(
    (existing) =>
      existing.tag_id === tagSong.tag_id &&
      existing.song_id === tagSong.song_id &&
      existing.sheet_type === tagSong.sheet_type &&
      existing.sheet_difficulty === tagSong.sheet_difficulty,
  )
  return exists ? current : { ...current, tagSongs: [...current.tagSongs, tagSong] }
}