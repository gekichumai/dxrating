import useSWR from 'swr'
import type { z } from 'zod'
import type { TagsListResponseSchema } from '../lib/contract'
import { loadCommunityLists, resolvedAgainst, useRefreshOnCatalogChange } from '../catalog/communityOverlay'

export type CombinedTags = z.infer<typeof TagsListResponseSchema>
export type Tag = CombinedTags['tags'][number]
export type TagGroup = CombinedTags['tagGroups'][number]
export type TagSong = CombinedTags['tagSongs'][number]

export const useCombinedTags = () => {
  const combinedTags = useSWR(
    'tags.list',
    async () => {
      // From the v2 community overlay: the tag-sheet associations it keeps visible, resolved against the catalog
      const { tags, tagGroups, tagSongs, catalogUpdatedAt } = await loadCommunityLists()
      return resolvedAgainst({ tags, tagGroups, tagSongs } as CombinedTags, catalogUpdatedAt)
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
  // The dedupe window above does not hold back this revalidation
  useRefreshOnCatalogChange(combinedTags.data, combinedTags.mutate)
  return combinedTags
}

/**
 * The list with an association the viewer just attached, shown at once. The shared list comes through the edge cache,
 * which can take a few minutes to include a new attachment; {@link rememberAttachedTag} keeps it in later loads too.
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
type SheetRef = { song_id: string; sheet_type: string; sheet_difficulty: string }

/**
 * The list with one sheet's associations replaced by a fresh per-sheet read, shown at once. Votes and removals change
 * which associations the shared list shows (it leaves out buried ones), and the shared list comes through the edge
 * cache, which can take a few minutes to catch up; `rememberSheetTagSongs` (catalog/communityOverlay) keeps the result in later loads too.
 */
export const withSheetTagSongs = (
  current: CombinedTags | undefined,
  sheet: SheetRef,
  associations: readonly TagSong[],
  hiddenScoreThreshold: number,
): CombinedTags | undefined => {
  if (!current) return current
  const onSheet = (tagSong: SheetRef) =>
    tagSong.song_id === sheet.song_id &&
    tagSong.sheet_type === sheet.sheet_type &&
    tagSong.sheet_difficulty === sheet.sheet_difficulty
  const visible = associations
    .filter((tagSong) => tagSong.score > hiddenScoreThreshold)
    .map(({ song_id, sheet_id, sheet_type, sheet_difficulty, tag_id, score }) => ({
      song_id,
      ...(sheet_id === undefined ? {} : { sheet_id }),
      sheet_type,
      sheet_difficulty,
      tag_id,
      score,
    }))
  return { ...current, tagSongs: [...current.tagSongs.filter((tagSong) => !onSheet(tagSong)), ...visible] }
}