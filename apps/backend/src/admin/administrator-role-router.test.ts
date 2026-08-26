import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
import {
  AdministratorRoleServiceFailure,
  type AdministratorRoleChange,
  type AdministratorRoleService,
} from './administrator-role-service.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import { createAdminRouter, type AdminRequestContext } from './router.js'

const REQUEST_ID = '18d7118c-ec70-4603-9176-cffea8a6cd8f'

const authentication = (
  role: 'admin' | 'super_admin',
  recentPrimaryAuthSatisfied = role === 'super_admin',
): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser: {
    id: role === 'super_admin' ? 'super-id' : 'admin-id',
    role: role === 'super_admin' ? 'user' : 'admin',
  },
  principal: {
    userId: role === 'super_admin' ? 'super-id' : 'admin-id',
    effectiveRole: role,
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: role === 'super_admin',
      canManageAdministrators: role === 'super_admin',
    },
  },
  session: {
    id: `${role}-session-id`,
    authorizationIssuedAt: new Date('2026-08-23T00:00:00.000Z'),
  },
  assurance: { recentPrimaryAuthSatisfied, freshLoginSatisfied: true },
})

const grantChange = {
  id: '41',
  subjectUserId: 'target-id',
  actorUserId: 'super-id',
  previousRole: 'user',
  newRole: 'admin',
  reason: 'Operational coverage',
  changedAt: '2026-08-24T10:00:00.000Z',
} as const satisfies AdministratorRoleChange

const revokeChange = {
  id: '42',
  subjectUserId: 'target-id',
  actorUserId: 'super-id',
  previousRole: 'admin',
  newRole: 'user',
  reason: 'Rotation completed',
  changedAt: '2026-08-24T11:00:00.000Z',
} as const satisfies AdministratorRoleChange

const createRoleService = (overrides: Partial<AdministratorRoleService> = {}): AdministratorRoleService => ({
  listAdministrators: vi.fn(async () => ({ items: [] })),
  listRoleHistory: vi.fn(async () => ({ items: [], nextCursor: null })),
  grantAdministrator: vi.fn(async () => ({ change: grantChange })),
  revokeAdministrator: vi.fn(async () => ({ change: revokeChange })),
  ...overrides,
})

const createRoleHandler = (administratorRoles: AdministratorRoleService) =>
  new OpenAPIHandler(createAdminRouter({ administratorRoles }))

const invoke = (
  administratorRoles: AdministratorRoleService,
  path: string,
  {
    method = 'GET',
    body,
    requestAuthentication = authentication('admin'),
    recordAuthorizationResult = vi.fn(),
  }: {
    readonly method?: 'GET' | 'POST'
    readonly body?: Record<string, unknown>
    readonly requestAuthentication?: AdminRequestAuthentication
    readonly recordAuthorizationResult?: NonNullable<AdminRequestContext['recordAuthorizationResult']>
  } = {},
) =>
  createRoleHandler(administratorRoles).handle(
    new Request(`http://localhost${path}`, {
      method,
      ...(body
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    }),
    {
      context: {
        authentication: requestAuthentication,
        requestId: REQUEST_ID,
        recordAuthorizationResult,
      },
    },
  )

describe('administrator role router', () => {
  it('serves the administrator roster and subject-scoped immutable role history', async () => {
    const listAdministrators = vi.fn(async () => ({
      items: [
        {
          userId: 'admin-id',
          displayName: 'Current Administrator',
          email: 'admin@example.test',
          emailVerified: true,
          effectiveRole: 'admin' as const,
          roleSource: 'database' as const,
          accountStatus: { status: 'active' as const },
        },
      ],
    }))
    const listRoleHistory = vi.fn(async () => ({ items: [revokeChange, grantChange], nextCursor: 'next-page' }))
    const administratorRoles = createRoleService({ listAdministrators, listRoleHistory })

    const roster = await invoke(administratorRoles, '/administrators')
    expect(roster.response?.status).toBe(200)
    await expect(roster.response?.json()).resolves.toEqual({
      items: [
        {
          userId: 'admin-id',
          displayName: 'Current Administrator',
          email: 'admin@example.test',
          emailVerified: true,
          effectiveRole: 'admin',
          roleSource: 'database',
          accountStatus: { status: 'active' },
        },
      ],
    })

    const history = await invoke(
      administratorRoles,
      '/administrators/target-id/role-history?cursor=previous-page&limit=2',
    )
    expect(history.response?.status).toBe(200)
    await expect(history.response?.json()).resolves.toEqual({
      items: [revokeChange, grantChange],
      nextCursor: 'next-page',
    })
    expect(listAdministrators).toHaveBeenCalledOnce()
    expect(listRoleHistory).toHaveBeenCalledWith({
      subjectUserId: 'target-id',
      cursor: 'previous-page',
      limit: 2,
    })
  })

  it('passes super-administrator grant and revoke requests into the transaction-owning service', async () => {
    const grantAdministrator = vi.fn(async () => ({ change: grantChange }))
    const revokeAdministrator = vi.fn(async () => ({ change: revokeChange }))
    const administratorRoles = createRoleService({ grantAdministrator, revokeAdministrator })
    const superAuthentication = authentication('super_admin')

    const grant = await invoke(administratorRoles, '/administrators/target-id/grant', {
      method: 'POST',
      body: { reason: 'Operational coverage' },
      requestAuthentication: superAuthentication,
    })
    expect(grant.response?.status).toBe(200)
    await expect(grant.response?.json()).resolves.toEqual({ change: grantChange })
    expect(grantAdministrator).toHaveBeenCalledWith({
      context: { authentication: superAuthentication },
      targetUserId: 'target-id',
      reason: 'Operational coverage',
    })

    const revoke = await invoke(administratorRoles, '/administrators/target-id/revoke', {
      method: 'POST',
      body: { reason: 'Rotation completed' },
      requestAuthentication: superAuthentication,
    })
    expect(revoke.response?.status).toBe(200)
    await expect(revoke.response?.json()).resolves.toEqual({ change: revokeChange })
    expect(revokeAdministrator).toHaveBeenCalledWith({
      context: { authentication: superAuthentication },
      targetUserId: 'target-id',
      reason: 'Rotation completed',
    })
  })

  it('denies ordinary and non-recent administrators before invoking the mutation service', async () => {
    const grantAdministrator = vi.fn(async () => ({ change: grantChange }))
    const administratorRoles = createRoleService({ grantAdministrator })

    const ordinary = await invoke(administratorRoles, '/administrators/target-id/grant', {
      method: 'POST',
      body: { reason: 'Must not reach the service' },
      requestAuthentication: authentication('admin'),
    })
    expect(ordinary.response?.status).toBe(403)
    await expect(ordinary.response?.json()).resolves.toMatchObject({ defined: true, code: 'FORBIDDEN' })

    const stale = await invoke(administratorRoles, '/administrators/target-id/grant', {
      method: 'POST',
      body: { reason: 'Must not reach the service either' },
      requestAuthentication: authentication('super_admin', false),
    })
    expect(stale.response?.status).toBe(401)
    await expect(stale.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'RECENT_AUTH_REQUIRED',
    })
    expect(grantAdministrator).not.toHaveBeenCalled()
  })

  it.each([{}, { reason: '   ' }])(
    'returns a typed validation error for a missing or blank reason without invoking the service',
    async (body) => {
      const grantAdministrator = vi.fn(async () => ({ change: grantChange }))
      const administratorRoles = createRoleService({ grantAdministrator })

      const result = await invoke(administratorRoles, '/administrators/target-id/grant', {
        method: 'POST',
        body,
        requestAuthentication: authentication('super_admin'),
      })

      expect(result.response?.status).toBe(400)
      await expect(result.response?.json()).resolves.toMatchObject({
        defined: true,
        code: 'VALIDATION_FAILED',
        data: { requestId: REQUEST_ID },
      })
      expect(grantAdministrator).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['VALIDATION_FAILED', 400],
    ['CONFLICT', 409],
  ] as const)('maps %s service failures to the private typed error', async (code, status) => {
    const reason = 'sensitive internal staffing reason'
    const grantAdministrator = vi.fn(async () => {
      throw new AdministratorRoleServiceFailure(code)
    })
    const administratorRoles = createRoleService({ grantAdministrator })
    const recordAuthorizationResult = vi.fn()

    const result = await invoke(administratorRoles, '/administrators/target-id/grant', {
      method: 'POST',
      body: { reason },
      requestAuthentication: authentication('super_admin'),
      recordAuthorizationResult,
    })
    expect(result.response?.status).toBe(status)
    const responseBody = await result.response?.json()
    expect(responseBody).toMatchObject({
      defined: true,
      code,
      data: { requestId: REQUEST_ID },
    })
    expect(JSON.stringify(responseBody)).not.toContain(reason)
    expect(recordAuthorizationResult).toHaveBeenCalledWith('grantAdministrator', code)
    expect(JSON.stringify(recordAuthorizationResult.mock.calls)).not.toContain(reason)
  })

  it('sanitizes unexpected role-service failures without putting the reason into telemetry', async () => {
    const reason = 'private reason: credential-like-value'
    const grantAdministrator = vi.fn(async () => {
      throw new Error(reason)
    })
    const administratorRoles = createRoleService({ grantAdministrator })
    const recordAuthorizationResult = vi.fn()

    const result = await invoke(administratorRoles, '/administrators/target-id/grant', {
      method: 'POST',
      body: { reason },
      requestAuthentication: authentication('super_admin'),
      recordAuthorizationResult,
    })
    expect(result.response?.status).toBe(500)
    const responseBody = await result.response?.json()
    expect(responseBody).toMatchObject({ defined: true, code: 'INTERNAL_SERVER_ERROR' })
    expect(JSON.stringify(responseBody)).not.toContain(reason)
    expect(recordAuthorizationResult).toHaveBeenCalledWith('grantAdministrator', 'INTERNAL_SERVER_ERROR')
    expect(JSON.stringify(recordAuthorizationResult.mock.calls)).not.toContain(reason)
  })
})