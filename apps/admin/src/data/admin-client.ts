import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER, adminContract } from '@gekichumai/admin-contract'
import { createORPCClient, type Client } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { resolveAdminBackendOrigin, validateAdminBackendOrigin } from '../config/backend-origin'
import { AdminNetworkError, isAdminRequestCancellation } from './admin-errors'
import { rejectAdminClientIncompatibleResponse } from './compatibility'

type FetchImplementation = typeof globalThis.fetch
type RawAdminClient = JsonifiedClient<ContractRouterClient<typeof adminContract>>

type HeaderlessInput<TInput> = TInput extends { headers: unknown }
  ? keyof Omit<TInput, 'headers'> extends never
    ? undefined
    : Omit<TInput, 'headers'>
  : TInput

type HeaderlessClient<TClient> =
  TClient extends Client<infer TContext, infer TInput, infer TOutput, infer TError>
    ? Client<TContext, HeaderlessInput<TInput>, TOutput, TError>
    : { [TKey in keyof TClient]: HeaderlessClient<TClient[TKey]> }

export type AdminClient = HeaderlessClient<RawAdminClient>

const createHeaderlessClient = (rawClient: RawAdminClient, onClientCompatible?: () => void): AdminClient => ({
  bootstrap: async (_input, options) => {
    const output = await rawClient.bootstrap({ headers: {} }, options)
    onClientCompatible?.()
    return output
  },
  primaryAuthStatus: (_input, options) => rawClient.primaryAuthStatus({ headers: {} }, options),
  completePrimaryAuthPassword: (input, options) =>
    rawClient.completePrimaryAuthPassword({ ...input, headers: {} }, options),
  initiatePrimaryAuthOauth: (input, options) => rawClient.initiatePrimaryAuthOauth({ ...input, headers: {} }, options),
})

export type CreateAdminDataClientOptions = {
  readonly backendOrigin?: string
  readonly fetch?: FetchImplementation
  readonly mode?: string
  readonly onClientCompatible?: () => void
  readonly onClientIncompatible?: (error: unknown) => void
}

export const createAdminDataClient = ({
  backendOrigin,
  fetch: fetchImplementation = globalThis.fetch.bind(globalThis),
  mode = import.meta.env.MODE,
  onClientCompatible,
  onClientIncompatible,
}: CreateAdminDataClientOptions = {}) => {
  const origin =
    backendOrigin === undefined
      ? resolveAdminBackendOrigin({ mode, configuredOrigin: import.meta.env.VITE_BACKEND_URL })
      : validateAdminBackendOrigin(backendOrigin, mode)

  const link = new OpenAPILink(adminContract, {
    url: `${origin}/api/admin`,
    headers: {
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
    },
    fetch: async (request, init) => {
      const requestSignal = request.signal
      let response: Response
      try {
        response = await fetchImplementation(request, {
          ...init,
          credentials: 'include',
        })
      } catch (error) {
        if (requestSignal?.aborted) throw requestSignal.reason ?? error
        if (isAdminRequestCancellation(error)) throw error
        throw new AdminNetworkError()
      }

      try {
        return await rejectAdminClientIncompatibleResponse(response)
      } catch (error) {
        onClientIncompatible?.(error)
        throw error
      }
    },
  })
  const rawClient: RawAdminClient = createORPCClient(link)
  const client = createHeaderlessClient(rawClient, onClientCompatible)

  return {
    client,
    orpc: createTanstackQueryUtils(client),
  }
}

export type AdminDataClient = ReturnType<typeof createAdminDataClient>