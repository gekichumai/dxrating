import { useCommunityLists, type CommunityLists } from '../catalog/communityOverlay'

const aliasesOf = (lists: CommunityLists) => lists.aliases

/** The aliases of every song, by public song ID, from the v2 community overlay */
export const useServerAliases = () => useCommunityLists(aliasesOf)