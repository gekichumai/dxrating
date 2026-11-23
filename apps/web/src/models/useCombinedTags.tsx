import type { z } from 'zod'
import type { TagsListResponseSchema } from '../lib/contract'
import { useCommunityLists, type CommunityLists } from '../catalog/communityOverlay'

export type CombinedTags = z.infer<typeof TagsListResponseSchema>
export type Tag = CombinedTags['tags'][number]
export type TagGroup = CombinedTags['tagGroups'][number]
export type TagSong = CombinedTags['tagSongs'][number]

const tagsOf = ({ tags, tagGroups, tagSongs }: CommunityLists) => ({ tags, tagGroups, tagSongs }) as CombinedTags

/** The tags, their groups and the tag-sheet associations the v2 community overlay keeps visible */
export const useCombinedTags = () => useCommunityLists(tagsOf)