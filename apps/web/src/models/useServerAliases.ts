import { useQuery } from '@tanstack/react-query'
import { apiClient as client } from '../lib/orpc'

export const useServerAliases = () => {
  return useQuery({
    queryKey: ['aliases.list'],
    queryFn: async () => {
      return await client.aliases.list()
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  })
}