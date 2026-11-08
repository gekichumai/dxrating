import useSWR from 'swr'
import { loadCommunityLists, resolvedAgainst, useRefreshOnCatalogChange } from '../catalog/communityOverlay'

/** The aliases of every song, by public song ID, from the v2 community overlay */
export const useServerAliases = () => {
  const aliases = useSWR(
    'aliases.list',
    async () => {
      const { aliases, catalogUpdatedAt } = await loadCommunityLists()
      return resolvedAgainst(aliases, catalogUpdatedAt)
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  )
  useRefreshOnCatalogChange(aliases.data, aliases.mutate)
  return aliases
}