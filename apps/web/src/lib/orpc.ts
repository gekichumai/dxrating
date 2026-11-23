import { createORPCClient, type InferClientOutputs } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { CORS_POLICIES, corsGroupFor, decodeLegacyErrorResponse } from '@gekichumai/api-contract'
import { appContract } from './contract'

export const credentialsFor = (url: string | URL | Request, method = 'GET'): RequestCredentials => {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
  const group = corsGroupFor(new URL(href, 'http://localhost').pathname, method.toUpperCase())
  return CORS_POLICIES[group].credentials ? 'include' : 'omit'
}

const link = new OpenAPILink(appContract, {
  origin: import.meta.env.VITE_BACKEND_URL,
  url: '/api/v1',
  customErrorResponseBodyDecoder: decodeLegacyErrorResponse,
  fetch: (r, i) => fetch(r, { ...i, credentials: credentialsFor(r, i?.method) }),
})

export const apiClient: JsonifiedClient<RouterContractClient<typeof appContract>> = createORPCClient(link)

export const orpc = createTanstackQueryUtils(apiClient)

export type RouterOutputs = InferClientOutputs<typeof apiClient>