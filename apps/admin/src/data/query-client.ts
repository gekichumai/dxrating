import { QueryClient, type QueryClientConfig } from '@tanstack/react-query'
import { adminReadRetryDelay, shouldRetryAdminRead } from './admin-errors'

export const ADMIN_QUERY_DEFAULTS = {
  refetchInterval: false,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
  retry: shouldRetryAdminRead,
  retryDelay: adminReadRetryDelay,
} as const

export const ADMIN_MUTATION_DEFAULTS = {
  retry: false,
} as const

type AdminQueryClientConfig = Pick<QueryClientConfig, 'queryCache' | 'mutationCache'>

export const createAdminQueryClient = (config: AdminQueryClientConfig = {}): QueryClient =>
  new QueryClient({
    ...config,
    defaultOptions: {
      queries: ADMIN_QUERY_DEFAULTS,
      mutations: ADMIN_MUTATION_DEFAULTS,
    },
  })

export const createAdminTestQueryClient = (config: AdminQueryClientConfig = {}): QueryClient =>
  new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        ...ADMIN_QUERY_DEFAULTS,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
      },
      mutations: {
        ...ADMIN_MUTATION_DEFAULTS,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  })