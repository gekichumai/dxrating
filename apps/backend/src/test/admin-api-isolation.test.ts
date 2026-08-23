import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { generateAdminOpenApiDocument } from '@gekichumai/admin-contract/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { createAdminRouter } from '../admin/router.js'

const requestAdminBootstrap = (compatibilityId?: string) =>
  app.request('/api/admin/bootstrap', {
    headers: compatibilityId ? { [ADMIN_CONTRACT_HEADER]: compatibilityId } : undefined,
  })

describe('private administrator API isolation', () => {
  it('mounts the administrator handler only at the unversioned admin prefix and fails closed', async () => {
    const response = await requestAdminBootstrap(ADMIN_CONTRACT_COMPATIBILITY_ID)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      defined: true,
      code: 'UNAUTHORIZED',
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

  it('returns the shared compatibility identifier when the authorization seam permits bootstrap', async () => {
    const authorizedHandler = new OpenAPIHandler(createAdminRouter(() => true))
    const { response } = await authorizedHandler.handle(
      new Request('http://localhost/api/admin/bootstrap', {
        headers: { [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID },
      }),
      { prefix: '/api/admin', context: {} },
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ready: true,
    })
  })

  it('rejects a missing or stale compatibility identifier before feature decoding', async () => {
    for (const compatibilityId of [undefined, `sha256:${'f'.repeat(64)}`]) {
      const response = await requestAdminBootstrap(compatibilityId)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        defined: true,
        code: 'ADMIN_CLIENT_INCOMPATIBLE',
        data: {
          expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
          received: compatibilityId ?? null,
        },
      })
    }
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