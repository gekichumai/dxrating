import { describe, expect, it } from 'vitest'
import { ADMIN_CONTRACT_COMPATIBILITY_ID } from './compatibility.js'
import {
  ADMIN_BOOTSTRAP_AUTHORIZATION,
  AdminBootstrapOutputSchema,
  AdminProcedureAuthorizationPolicySchema,
  adminContract,
} from './contract.js'
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
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'RECENT_AUTH_REQUIRED',
      'FRESH_LOGIN_REQUIRED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ])
    expect(adminContract.bootstrap['~orpc'].meta.authorization).toEqual(ADMIN_BOOTSTRAP_AUTHORIZATION)
  })

  it('generates a deterministic private OpenAPI document and identifier', async () => {
    const document = await generateAdminOpenApiDocument()
    expect(document.servers).toEqual([{ url: '/api/admin' }])
    expect(Object.keys(document.paths ?? {})).toEqual(['/bootstrap'])
    expect(await computeAdminContractCompatibilityId()).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })

  it('exposes only effective administrator authority and scoped capabilities', () => {
    const output = AdminBootstrapOutputSchema.parse({
      contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ready: true,
      principal: {
        userId: 'immutable-user-id',
        effectiveRole: 'super_admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: true,
          canManageAdministrators: true,
        },
      },
    })

    expect(output.principal).toEqual({
      userId: 'immutable-user-id',
      effectiveRole: 'super_admin',
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: true,
        canManageAdministrators: true,
      },
    })
    expect(() =>
      AdminBootstrapOutputSchema.parse({
        ...output,
        principal: { ...output.principal, effectiveRole: 'user' },
      }),
    ).toThrow()
  })

  it('keeps recent-authentication and fresh-login recovery policies mutually exclusive', () => {
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...ADMIN_BOOTSTRAP_AUTHORIZATION,
        recentPrimaryAuth: true,
        freshLogin: true,
      }).success,
    ).toBe(false)
  })
})