import useSWR from 'swr'
import { z } from 'zod'
import type { TagsListResponseSchema } from '../lib/contract'
import { orpc } from '../lib/orpc'

export type CombinedTags = z.infer<typeof TagsListResponseSchema>
export type Tag = CombinedTags['tags'][number]
export type TagGroup = CombinedTags['tagGroups'][number]
export type TagSong = CombinedTags['tagSongs'][number]

export const useCombinedTags = () => {
  return useSWR(
    'tags.list',
    async () => {
      return await orpc.tags.list() as CombinedTags
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
