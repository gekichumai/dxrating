import { createORPCClient } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { CLOUD_SAVE_EXPECTED_USER_HEADER, decodeLegacyErrorResponse } from '@gekichumai/api-contract'
import { privateAppContract } from './privateContract'

type Client = JsonifiedClient<RouterContractClient<typeof privateAppContract>>

const createLink = (headers: Record<string, string>) =>
  new OpenAPILink(privateAppContract, {
    origin: import.meta.env.VITE_BACKEND_URL,
    url: '/api/v1',
    headers,
    customErrorResponseBodyDecoder: decodeLegacyErrorResponse,
    // Every private route needs the session cookie
    fetch: (r, i) => fetch(r, { ...i, credentials: 'include' }),
  })

/** Client of the private routes; load it with a dynamic import, only for signed-in users */
export const privateApiClient: Client = createORPCClient(createLink({}))

export type PrivateApiClient = typeof privateApiClient

const boundClients = new Map<string, Client>()

/**
 * A client whose every request names `userId` as the account it is for (`X-DXRating-Expected-User`): the server
 * answers 409 `ACCOUNT_MISMATCH` instead of acting when the session became another account (§10). Cloud save writes
 * and the beta opt-in go through one; the server refuses them without the header.
 */
export function privateApiClientFor(userId: string): Client {
  const known = boundClients.get(userId)
  if (known) return known
  const client: Client = createORPCClient(createLink({ [CLOUD_SAVE_EXPECTED_USER_HEADER]: userId }))
  boundClients.set(userId, client)
  return client
}