import useSWR from 'swr'
import { apiClient as client } from '../lib/orpc'

export const useServerAliases = () => {
  return useSWR(
    'aliases.list',
    async () => {
      return await client.aliases.list()
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  )
}
