import useSWR from 'swr'
import { loadCommunityLists, useRefreshOnCatalogChange } from '../catalog/communityOverlay'

/** The aliases of every song, by public song ID, from the v2 community overlay */
export const useServerAliases = () => {
  const aliases = useSWR(
    'aliases.list',
    async () => {
      return (await loadCommunityLists('aliases.list')).aliases
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  )
  useRefreshOnCatalogChange('aliases.list', aliases.mutate)
  return aliases
}