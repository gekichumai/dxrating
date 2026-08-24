import { MutationCache, QueryCache, type QueryClient } from '@tanstack/react-query'
import { createAdminDataClient, type CreateAdminDataClientOptions } from './admin-client'
import {
  createAdminCompatibilityController,
  type AdminCompatibilityController,
  type AdminCompatibilityStorage,
} from './compatibility'
import { createAdminQueryClient } from './query-client'

type AdminQueryClientFactory = (config: {
  readonly mutationCache: MutationCache
  readonly queryCache: QueryCache
}) => QueryClient

export type CreateAdminRuntimeOptions = {
  readonly dataClient?: Omit<CreateAdminDataClientOptions, 'onClientCompatible' | 'onClientIncompatible'>
  readonly queryClientFactory?: AdminQueryClientFactory
  readonly reload?: () => void
  readonly storage?: AdminCompatibilityStorage | null
}

export type AdminRuntime = {
  readonly compatibility: AdminCompatibilityController
  readonly data: ReturnType<typeof createAdminDataClient>
  readonly queryClient: QueryClient
}

const reloadPage = () => globalThis.location.reload()

export const createAdminRuntime = ({
  dataClient,
  queryClientFactory = createAdminQueryClient,
  reload = reloadPage,
  storage,
}: CreateAdminRuntimeOptions = {}): AdminRuntime => {
  let compatibility: AdminCompatibilityController | undefined
  const handleCompatibilityError = (error: unknown) => {
    void compatibility?.handleError(error)
  }
  const queryClient = queryClientFactory({
    queryCache: new QueryCache({ onError: handleCompatibilityError }),
    mutationCache: new MutationCache({ onError: handleCompatibilityError }),
  })

  compatibility = createAdminCompatibilityController({
    cancelAndClear: async () => {
      try {
        await queryClient.cancelQueries()
      } finally {
        queryClient.clear()
      }
    },
    reload,
    ...(storage === undefined ? {} : { storage }),
  })

  const data = createAdminDataClient({
    ...dataClient,
    onClientCompatible: compatibility.markCompatible,
    onClientIncompatible: handleCompatibilityError,
  })

  return { compatibility, data, queryClient }
}