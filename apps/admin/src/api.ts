import { adminApiContract } from '@gekichumai/admin-api/contract'
import { createORPCClient } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

// Same origin: admin.dxrating.net serves this app and forwards /api to the admin API, so Cloudflare Access covers
// both and no cookie or CORS setup is needed.
const link = new OpenAPILink(adminApiContract, {
  origin: window.location.origin,
  url: '/api',
})

export const adminClient: JsonifiedClient<RouterContractClient<typeof adminApiContract>> = createORPCClient(link)
export const adminOrpc = createTanstackQueryUtils(adminClient)