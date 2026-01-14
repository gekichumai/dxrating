import useSWR from 'swr'
import { orpc } from '../lib/orpc'

export const useServerAliases = () => {
  return useSWR(
    'aliases.list',
    async () => {
      return await orpc.aliases.list()
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  )
}
