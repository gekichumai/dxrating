import { hashKey, MutationCache, QueryCache, type QueryClient } from '@tanstack/react-query'
import { createAdminAuthController, type AdminAuthController } from '../auth/admin-auth-controller'
import { createAdminDataClient, type CreateAdminDataClientOptions } from './admin-client'
import {
  createAdminCompatibilityController,
  type AdminCompatibilityController,
  type AdminCompatibilityStorage,
} from './compatibility'
import { createAdminQueryClient } from './query-client'
import { adminQueryKeys } from './query-keys'

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
  readonly auth: AdminAuthController
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
  let auth: AdminAuthController | undefined
  let compatibility: AdminCompatibilityController | undefined
  const handleCompatibilityError = (error: unknown) => {
    void compatibility?.handleError(error)
  }
  const handleQueryError: NonNullable<ConstructorParameters<typeof QueryCache>[0]>['onError'] = (error, query) => {
    handleCompatibilityError(error)
    if (hashKey(query.queryKey) === hashKey(adminQueryKeys.bootstrap())) {
      auth?.handleBootstrapError(error)
      return
    }
    auth?.handleFeatureError(error)
  }
  const handleMutationError: NonNullable<ConstructorParameters<typeof MutationCache>[0]>['onError'] = (error) => {
    handleCompatibilityError(error)
    auth?.handleFeatureError(error)
  }
  const queryClient = queryClientFactory({
    queryCache: new QueryCache({ onError: handleQueryError }),
    mutationCache: new MutationCache({ onError: handleMutationError }),
  })

  let activeProtectedStateClear: Promise<void> | undefined
  const clearProtectedState = (): Promise<void> => {
    if (activeProtectedStateClear) return activeProtectedStateClear

    const operation = (async () => {
      try {
        await queryClient.cancelQueries()
      } finally {
        queryClient.clear()
      }
    })()
    activeProtectedStateClear = operation.finally(() => {
      activeProtectedStateClear = undefined
    })
    return activeProtectedStateClear
  }

  compatibility = createAdminCompatibilityController({
    cancelAndClear: clearProtectedState,
    reload,
    ...(storage === undefined ? {} : { storage }),
  })
  auth = createAdminAuthController({ clearProtectedState })

  const data = createAdminDataClient({
    ...dataClient,
    onClientCompatible: compatibility.markCompatible,
    onClientIncompatible: handleCompatibilityError,
  })

  return { auth, compatibility, data, queryClient }
}