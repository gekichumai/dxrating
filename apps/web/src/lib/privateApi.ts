import { createORPCClient } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { decodeLegacyErrorResponse } from '@gekichumai/api-contract'
import { privateAppContract } from './privateContract'

const link = new OpenAPILink(privateAppContract, {
  origin: import.meta.env.VITE_BACKEND_URL,
  url: '/api/v1',
  customErrorResponseBodyDecoder: decodeLegacyErrorResponse,
  // Every private route needs the session cookie
  fetch: (r, i) => fetch(r, { ...i, credentials: 'include' }),
})

/** Client of the private routes; load it with a dynamic import, only for signed-in users */
export const privateApiClient: JsonifiedClient<RouterContractClient<typeof privateAppContract>> = createORPCClient(link)

export type PrivateApiClient = typeof privateApiClient