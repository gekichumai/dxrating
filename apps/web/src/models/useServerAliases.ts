import useSWR from 'swr'
import { loadCommunityLists } from '../catalog/communityOverlay'

/** The aliases of every song, by public song ID, from the v2 community overlay */
export const useServerAliases = () => {
  return useSWR(
    'aliases.list',
    async () => {
      return (await loadCommunityLists()).aliases
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  )
}