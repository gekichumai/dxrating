import { createORPCClient } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeLegacyErrorResponse, publicAppContract } from '@gekichumai/api-contract'
import { getBaseUrl, setupTestServer, teardownTestServer } from './setup'

describe('oRPC transport compatibility', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)

  it('keeps the v1 JSON status field on validation failures', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/comments/-1/report`, { method: 'POST' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      defined: false,
      code: 'BAD_REQUEST',
      status: 400,
      message: expect.any(String),
    })
  })

  it('preserves Effect failures and accepts path-only POST requests without a body', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/comments/1/report`, { method: 'POST' })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      defined: false,
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Unauthorized',
    })
  })

  it('keeps unexpected failures private and compatible with v1 clients', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/io/import/lxns/status`)

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      defined: false,
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      message: 'Internal Server Error',
    })
  })

  it('serves success responses and typed failures to the v2 OpenAPI client', async () => {
    const link = new OpenAPILink(publicAppContract, {
      origin: getBaseUrl(),
      url: '/api/v1',
      customErrorResponseBodyDecoder: decodeLegacyErrorResponse,
    })
    const client: JsonifiedClient<RouterContractClient<typeof publicAppContract>> = createORPCClient(link)

    expect(await client.aliases.list()).toEqual(expect.any(Array))
    await expect(client.comments.report({ commentId: 1 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})