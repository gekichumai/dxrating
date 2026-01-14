import { createORPCClient, type InferClientOutputs } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { appContract } from './contract'

const link = new OpenAPILink(appContract, {
  url: `${import.meta.env.VITE_BACKEND_URL}/api`,
  fetch: (r, i) => fetch(r, { ...i, credentials: 'include' }),
})

export const apiClient: JsonifiedClient<ContractRouterClient<typeof appContract>> = createORPCClient(link)

export const orpc = createTanstackQueryUtils(apiClient)

export type RouterOutputs = InferClientOutputs<typeof apiClient>
