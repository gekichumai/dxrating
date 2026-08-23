import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { generateAdminOpenApiDocument } from '@gekichumai/admin-contract/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'
import { resolveAdministratorPrincipal } from '../admin/role-policy.js'
import { parseSuperAdministratorAllowlist } from '../admin/super-administrator-allowlist.js'
import { createAdminRouter } from '../admin/router.js'
import type { AdminRequestAuthentication } from '../admin/principal-loader.js'

const requestAdminBootstrap = (compatibilityId?: string) =>
  app.request('/api/admin/bootstrap', {
    headers: compatibilityId ? { [ADMIN_CONTRACT_HEADER]: compatibilityId } : undefined,
  })

const requestAuthentication = (
  authorizationUser: { id: string; role: 'user' | 'admin' },
  superAdministrators = parseSuperAdministratorAllowlist(undefined),
): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser,
  principal: resolveAdministratorPrincipal(authorizationUser, superAdministrators),
  session: {
    id: 'session-id',
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
  },
})

describe('private administrator API isolation', () => {
  it('mounts the administrator handler only at the unversioned admin prefix and fails closed', async () => {
    const response = await requestAdminBootstrap(ADMIN_CONTRACT_COMPATIBILITY_ID)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      defined: true,
      code: 'UNAUTHENTICATED',
      data: { requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) },
    })

    expect((await app.request('/api/v1/bootstrap')).status).toBe(404)
    expect(
      (
        await app.request('/api/admin/tags', {
          headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
        })
      ).status,
    ).toBe(404)
  })

  it('returns forbidden for an ordinary user and bootstrap data for a current persisted admin', async () => {
    const authorizedHandler = new OpenAPIHandler(createAdminRouter())
    const recordAuthorizationResult = vi.fn()
    const ordinaryUser = {
      id: 'ordinary-user-id',
      role: 'user' as const,
    }
    const ordinaryResult = await authorizedHandler.handle(
      new Request('http://localhost/api/admin/bootstrap', {
        headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
      }),
      {
        prefix: '/api/admin',
        context: {
          authentication: requestAuthentication(ordinaryUser),
          recordAuthorizationResult,
        },
      },
    )
    expect(ordinaryResult.response?.status).toBe(403)
    await expect(ordinaryResult.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
    })

    const administrator = {
      id: 'administrator-id',
      role: 'admin' as const,
    }
    const { response } = await authorizedHandler.handle(
      new Request('http://localhost/api/admin/bootstrap', {
        headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
      }),
      {
        prefix: '/api/admin',
        context: {
          authentication: requestAuthentication(administrator),
          recordAuthorizationResult,
        },
      },
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ready: true,
      principal: {
        userId: 'administrator-id',
        effectiveRole: 'admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: false,
          canManageAdministrators: false,
        },
      },
    })
    expect(recordAuthorizationResult.mock.calls).toEqual([
      ['bootstrap', 'FORBIDDEN'],
      ['bootstrap', 'SUCCESS'],
    ])
  })

  it('returns allowlist-derived super-administrator authority without exposing the allowlist', async () => {
    const serializedAllowlist = '["configured-super-id","second-secret-id"]'
    const superAdministrators = parseSuperAdministratorAllowlist(serializedAllowlist)
    const authorizedHandler = new OpenAPIHandler(createAdminRouter())
    const allowlistedUser = {
      id: 'configured-super-id',
      role: 'user' as const,
    }
    const { response } = await authorizedHandler.handle(
      new Request('http://localhost/api/admin/bootstrap', {
        headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
      }),
      {
        prefix: '/api/admin',
        context: { authentication: requestAuthentication(allowlistedUser, superAdministrators) },
      },
    )

    expect(response?.status).toBe(200)
    const body = await response?.json()
    expect(body).toMatchObject({
      principal: {
        userId: 'configured-super-id',
        effectiveRole: 'super_admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: true,
          canManageAdministrators: true,
        },
      },
    })
    const serializedBody = JSON.stringify(body)
    expect(serializedBody).not.toContain('SUPER_ADMIN_USER_IDS')
    expect(serializedBody).not.toContain('second-secret-id')
    expect(serializedBody).not.toContain(serializedAllowlist)
  })

  it('rejects a missing or stale compatibility identifier before feature decoding', async () => {
    for (const compatibilityId of [undefined, `sha256:${'f'.repeat(64)}`, 'credential=do-not-echo']) {
      const response = await requestAdminBootstrap(compatibilityId)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        defined: true,
        code: 'ADMIN_CLIENT_INCOMPATIBLE',
        data: {
          expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
          received: compatibilityId?.startsWith('sha256:') ? compatibilityId : null,
        },
      })
    }
  })

  it('replaces an unsafe client request identifier before logging or returning it', async () => {
    const response = await app.request('/api/admin/bootstrap', {
      headers: {
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
        'x-request-id': 'credential=do-not-echo',
      },
    })

    expect(response.status).toBe(401)
    const responseRequestId = response.headers.get('X-DXRating-Request-ID')
    expect(responseRequestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(responseRequestId).not.toBe('credential=do-not-echo')
    await expect(response.json()).resolves.toMatchObject({
      data: { requestId: responseRequestId },
    })
  })

  it('keeps administrator routes and schemas out of public discovery and documentation', async () => {
    const privateSpec = await generateAdminOpenApiDocument()
    const specResponse = await app.request('/spec.json')
    expect(specResponse.status).toBe(200)
    const spec = (await specResponse.json()) as {
      paths: Record<string, unknown>
      components?: { schemas?: Record<string, unknown> }
    }
    expect(Object.keys(spec.paths).some((path) => path.includes('/admin'))).toBe(false)
    expect(JSON.stringify(spec.components?.schemas ?? {})).not.toContain('AdminBootstrap')

    const publicSpecJson = JSON.stringify(spec)
    const privateOperationIds = Object.values(privateSpec.paths ?? {}).flatMap((pathItem) =>
      Object.values(pathItem ?? {}).flatMap((operation) => {
        if (!operation || typeof operation !== 'object' || !('operationId' in operation)) return []
        return typeof operation.operationId === 'string' ? [operation.operationId] : []
      }),
    )
    expect(privateOperationIds.length).toBeGreaterThan(0)
    for (const operationId of privateOperationIds) expect(publicSpecJson).not.toContain(operationId)

    const catalog = await (await app.request('/.well-known/api-catalog')).text()
    expect(catalog).not.toContain('/api/admin')

    const docs = await (await app.request('/docs')).text()
    expect(docs).not.toContain('/api/admin')

    expect((await app.request('/admin-spec.json')).status).toBe(404)
    expect(
      (
        await app.request('/api/admin/spec.json', {
          headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
        })
      ).status,
    ).toBe(404)
  })

  it('checks compatibility at the boundary before routing every administrator request', async () => {
    const response = await app.request('/api/admin/not-a-procedure')
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      defined: true,
      code: 'ADMIN_CLIENT_INCOMPATIBLE',
      data: { expected: ADMIN_CONTRACT_COMPATIBILITY_ID, received: null },
    })
  })
})