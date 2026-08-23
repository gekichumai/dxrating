import { describe, expect, it } from 'vitest'
import { ADMIN_CONTRACT_COMPATIBILITY_ID } from './compatibility.js'
import { adminContract } from './contract.js'
import { computeAdminContractCompatibilityId, generateAdminOpenApiDocument } from './openapi.js'

describe('private administrator contract', () => {
  it('contains only the fail-closed bootstrap seam initially', () => {
    expect(Object.keys(adminContract)).toEqual(['bootstrap'])
    expect(adminContract.bootstrap['~orpc'].route).toMatchObject({
      method: 'GET',
      path: '/bootstrap',
      operationId: 'getAdminBootstrap',
    })
    expect(Object.keys(adminContract.bootstrap['~orpc'].errorMap)).toEqual([
      'ADMIN_CLIENT_INCOMPATIBLE',
      'UNAUTHORIZED',
    ])
  })

  it('generates a deterministic private OpenAPI document and identifier', async () => {
    const document = await generateAdminOpenApiDocument()
    expect(document.servers).toEqual([{ url: '/api/admin' }])
    expect(Object.keys(document.paths ?? {})).toEqual(['/bootstrap'])
    expect(await computeAdminContractCompatibilityId()).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })
})