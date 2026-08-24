import { describe, expect, it } from 'vitest'
import { ADMIN_CONTRACT_COMPATIBILITY_ID } from './compatibility.js'
import {
  ADMIN_BOOTSTRAP_AUTHORIZATION,
  ADMIN_DEFAULT_AUTHORIZATION,
  ADMIN_ERROR_MESSAGES,
  ADMIN_PRIMARY_AUTH_ACTION_POLICY,
  ADMIN_PRIMARY_AUTH_ACTIONS,
  AdminBootstrapOutputSchema,
  AdminPrimaryAuthActionSchema,
  AdminPrimaryAuthOauthInitiateInputSchema,
  AdminPrimaryAuthPasswordInputSchema,
  AdminPrimaryAuthProviderSchema,
  AdminProcedureAuthorizationPolicySchema,
  adminActionRequiresRecentPrimaryAuth,
  adminAuthorizationForAction,
  adminContract,
  adminErrors,
} from './contract.js'
import { computeAdminContractCompatibilityId, generateAdminOpenApiDocument } from './openapi.js'

describe('private administrator contract', () => {
  it('exposes the bootstrap and primary-authentication routes without an OAuth completion procedure', () => {
    expect(Object.keys(adminContract)).toEqual([
      'bootstrap',
      'primaryAuthStatus',
      'completePrimaryAuthPassword',
      'initiatePrimaryAuthOauth',
    ])

    expect(
      Object.fromEntries(Object.entries(adminContract).map(([name, procedure]) => [name, procedure['~orpc'].route])),
    ).toMatchObject({
      bootstrap: {
        method: 'GET',
        path: '/bootstrap',
        operationId: 'getAdminBootstrap',
      },
      primaryAuthStatus: {
        method: 'GET',
        path: '/primary-auth/status',
        operationId: 'getAdminPrimaryAuthStatus',
      },
      completePrimaryAuthPassword: {
        method: 'POST',
        path: '/primary-auth/password',
        operationId: 'completeAdminPrimaryAuthPassword',
      },
      initiatePrimaryAuthOauth: {
        method: 'POST',
        path: '/primary-auth/oauth/initiate',
        operationId: 'initiateAdminPrimaryAuthOauth',
      },
    })

    expect('completePrimaryAuthOauth' in adminContract).toBe(false)
    expect(AdminPrimaryAuthProviderSchema.options).toEqual(['google'])
    expect(
      AdminPrimaryAuthOauthInitiateInputSchema.safeParse({
        headers: {},
        body: { provider: 'github' },
      }).success,
    ).toBe(false)
    expect(
      AdminPrimaryAuthPasswordInputSchema.safeParse({
        headers: {},
        body: { password: '' },
      }).success,
    ).toBe(false)
    expect(
      AdminPrimaryAuthOauthInitiateInputSchema.safeParse({
        headers: {},
        body: { provider: 'unlinked-provider' },
      }).success,
    ).toBe(false)
  })

  it('applies fail-closed metadata and the complete sanitized error map to every procedure', () => {
    const expectedErrors = [
      'ADMIN_CLIENT_INCOMPATIBLE',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'RECENT_AUTH_REQUIRED',
      'FRESH_LOGIN_REQUIRED',
      'STEP_UP_FAILED',
      'STEP_UP_RATE_LIMITED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ]

    for (const procedure of Object.values(adminContract)) {
      expect(Object.keys(procedure['~orpc'].errorMap)).toEqual(expectedErrors)
      expect(procedure['~orpc'].meta.authorization).toEqual(ADMIN_DEFAULT_AUTHORIZATION)
    }

    expect(Object.keys(adminContract.bootstrap['~orpc'].errorMap)).toEqual([
      'ADMIN_CLIENT_INCOMPATIBLE',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'RECENT_AUTH_REQUIRED',
      'FRESH_LOGIN_REQUIRED',
      'STEP_UP_FAILED',
      'STEP_UP_RATE_LIMITED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ])
    expect(adminContract.bootstrap['~orpc'].meta.authorization).toEqual(ADMIN_BOOTSTRAP_AUTHORIZATION)

    expect(adminErrors.STEP_UP_FAILED).toMatchObject({
      status: 401,
      message: ADMIN_ERROR_MESSAGES.STEP_UP_FAILED,
    })
    expect(adminErrors.STEP_UP_RATE_LIMITED).toMatchObject({
      status: 429,
      message: ADMIN_ERROR_MESSAGES.STEP_UP_RATE_LIMITED,
    })
    expect(adminErrors.STEP_UP_FAILED.data.parse({ requestId: null })).toEqual({
      requestId: null,
    })
    expect(adminErrors.STEP_UP_RATE_LIMITED.data.parse({ requestId: null })).toEqual({ requestId: null })
  })

  it('generates a deterministic private OpenAPI document and identifier', async () => {
    const document = await generateAdminOpenApiDocument()
    expect(document.servers).toEqual([{ url: '/api/admin' }])
    expect(Object.keys(document.paths ?? {})).toEqual([
      '/bootstrap',
      '/primary-auth/status',
      '/primary-auth/password',
      '/primary-auth/oauth/initiate',
    ])
    expect(
      Object.fromEntries(Object.entries(document.paths ?? {}).map(([path, item]) => [path, Object.keys(item ?? {})])),
    ).toEqual({
      '/bootstrap': ['get'],
      '/primary-auth/status': ['get'],
      '/primary-auth/password': ['post'],
      '/primary-auth/oauth/initiate': ['post'],
    })

    const serializedDocument = JSON.stringify(document)
    expect(serializedDocument).not.toContain('/primary-auth/oauth/complete')
    expect(serializedDocument).not.toContain('completeAdminPrimaryAuthOauth')
    expect(serializedDocument).toContain('STEP_UP_FAILED')
    expect(serializedDocument).toContain('STEP_UP_RATE_LIMITED')
    expect(await computeAdminContractCompatibilityId()).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })

  it('defines exactly five protected and six unprotected primary-authentication actions', () => {
    expect(ADMIN_PRIMARY_AUTH_ACTIONS).toHaveLength(11)
    expect(ADMIN_PRIMARY_AUTH_ACTION_POLICY).toEqual({
      'administrator.grant': true,
      'administrator.revoke': true,
      'user.ban': true,
      'user.unban': true,
      'comment.delete': true,
      'comment.restore': false,
      'chart_report.close': false,
      'chart_report.submit': false,
      'provenance.read': false,
      'dashboard.read': false,
      'raw_artifact.read': false,
    })

    const protectedActions = ADMIN_PRIMARY_AUTH_ACTIONS.filter(adminActionRequiresRecentPrimaryAuth)
    const unprotectedActions = ADMIN_PRIMARY_AUTH_ACTIONS.filter(
      (action) => !adminActionRequiresRecentPrimaryAuth(action),
    )

    expect(protectedActions).toEqual([
      'administrator.grant',
      'administrator.revoke',
      'user.ban',
      'user.unban',
      'comment.delete',
    ])
    expect(protectedActions).toHaveLength(5)
    expect(unprotectedActions).toEqual([
      'comment.restore',
      'chart_report.close',
      'chart_report.submit',
      'provenance.read',
      'dashboard.read',
      'raw_artifact.read',
    ])
    expect(unprotectedActions).toHaveLength(6)

    for (const action of ADMIN_PRIMARY_AUTH_ACTIONS) {
      expect(AdminPrimaryAuthActionSchema.parse(action)).toBe(action)
      const policy = adminAuthorizationForAction(action)
      expect(policy).toMatchObject({
        primaryAuthAction: action,
        recentPrimaryAuth: ADMIN_PRIMARY_AUTH_ACTION_POLICY[action],
      })
      expect(AdminProcedureAuthorizationPolicySchema.safeParse(policy).success).toBe(true)
    }
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
        ...adminAuthorizationForAction('comment.delete'),
        recentPrimaryAuth: true,
        freshLogin: true,
      }).success,
    ).toBe(false)
  })

  it('rejects procedure metadata that drifts from the central action matrix', () => {
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...adminAuthorizationForAction('comment.delete'),
        recentPrimaryAuth: false,
      }).success,
    ).toBe(false)
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...adminAuthorizationForAction('comment.restore'),
        recentPrimaryAuth: true,
      }).success,
    ).toBe(false)
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...ADMIN_DEFAULT_AUTHORIZATION,
        recentPrimaryAuth: true,
      }).success,
    ).toBe(false)
  })
})