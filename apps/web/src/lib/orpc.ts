import { createORPCClient, type InferClientOutputs } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { decodeLegacyErrorResponse } from '@gekichumai/api-contract'
import { appContract } from './contract'

// The tag and alias lists are public and shared through the edge cache, which answers them with
// `Access-Control-Allow-Origin: *`; a credentialed request would fail CORS against that, so these reads omit cookies
const PUBLIC_LIST_PATHS = new Set(['/api/v1/tags', '/api/v1/aliases'])
export const credentialsFor = (url: string | URL | Request, method = 'GET'): RequestCredentials => {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
  const verb = method.toUpperCase()
  return (verb === 'GET' || verb === 'HEAD') && PUBLIC_LIST_PATHS.has(new URL(href, 'http://localhost').pathname)
    ? 'omit'
    : 'include'
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