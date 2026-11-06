import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'

/**
 * Whether SEGA has each maimai NET region in maintenance, as the backend last saw it (checked at most every 5 minutes).
 * Only fetched while an import entry point is open; any failure reads as "not known to be in maintenance".
 */
export const useMaimaiNetStatus = (enabled: boolean) => {
  const { data } = useQuery(
    orpc.maimaiNet.status.queryOptions({
      enabled: enabled && !import.meta.env.SSR,
      staleTime: 5 * 60 * 1000,
      retry: false,
    }),
  )
  return {
    intl: data?.intl.status === 'maintenance',
    jp: data?.jp.status === 'maintenance',
  }
}