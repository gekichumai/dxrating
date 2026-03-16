import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import type { TagsListResponseSchema } from '../lib/contract'
import { apiClient as client } from '../lib/orpc'

export type CombinedTags = z.infer<typeof TagsListResponseSchema>
export type Tag = CombinedTags['tags'][number]
export type TagGroup = CombinedTags['tagGroups'][number]
export type TagSong = CombinedTags['tagSongs'][number]

export const useCombinedTags = () => {
  return useQuery({
    queryKey: ['tags.list'],
    queryFn: async () => {
      return (await client.tags.list()) as CombinedTags
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}