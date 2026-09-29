import { createORPCClient, type InferClientOutputs } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { decodeLegacyErrorResponse } from '@gekichumai/api-contract'
import { appContract } from './contract'

const link = new OpenAPILink(appContract, {
  origin: import.meta.env.VITE_BACKEND_URL,
  url: '/api/v1',
  customErrorResponseBodyDecoder: decodeLegacyErrorResponse,
  fetch: (r, i) => fetch(r, { ...i, credentials: 'include' }),
})

export const apiClient: JsonifiedClient<RouterContractClient<typeof appContract>> = createORPCClient(link)

export const orpc = createTanstackQueryUtils(apiClient)

export type RouterOutputs = InferClientOutputs<typeof apiClient>