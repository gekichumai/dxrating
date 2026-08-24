import {
  ADMIN_DEFAULT_AUTHORIZATION,
  adminErrors,
  type AdminProcedureAuthorizationPolicy,
  type AdminProcedureMetadata,
} from '@gekichumai/admin-contract'
import { oc } from '@orpc/contract'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { implement } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createNormalizeAdminDecodeErrors } from './handler.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import type { AdminRequestContext } from './router.js'

const decodeProcedure = oc
  .$meta<AdminProcedureMetadata>({ authorization: ADMIN_DEFAULT_AUTHORIZATION })
  .errors(adminErrors)
  .input(z.object({ value: z.string() }))
  .output(z.object({ accepted: z.literal(true) }))

const policy = (changes: Partial<AdminProcedureAuthorizationPolicy>): AdminProcedureAuthorizationPolicy => ({
  ...ADMIN_DEFAULT_AUTHORIZATION,
  ...changes,
})

const decodeContract = {
  decode: decodeProcedure.route({ method: 'POST', path: '/decode' }),
  superDecode: decodeProcedure
    .meta({ authorization: policy({ minimumRole: 'super_admin' }) })
    .route({ method: 'POST', path: '/super-decode' }),
  recentDecode: decodeProcedure
    .meta({
      authorization: policy({
        recentPrimaryAuth: true,
        primaryAuthAction: 'comment.delete',
      }),
    })
    .route({ method: 'POST', path: '/recent-decode' }),
  freshDecode: decodeProcedure
    .meta({ authorization: policy({ freshLogin: true }) })
    .route({ method: 'POST', path: '/fresh-decode' }),
}
const decodeOs = implement(decodeContract).$context<AdminRequestContext>()
const accepted = () => ({ accepted: true as const })
const decodeRouter = decodeOs.router({
  decode: decodeOs.decode.handler(accepted),
  superDecode: decodeOs.superDecode.handler(accepted),
  recentDecode: decodeOs.recentDecode.handler(accepted),
  freshDecode: decodeOs.freshDecode.handler(accepted),
})
const decodeHandler = new OpenAPIHandler(decodeRouter, {
  rootInterceptors: [createNormalizeAdminDecodeErrors(decodeRouter)],
})

const authentication = (
  role: 'admin' | 'super_admin',
  assurance?: { recentPrimaryAuthSatisfied?: boolean; freshLoginSatisfied?: boolean },
): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser: {
    id: role === 'super_admin' ? 'super-id' : 'admin-id',
    role: role === 'admin' ? 'admin' : 'user',
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
  session: { id: 'session-id', authorizationIssuedAt: new Date('2026-08-23T00:00:00.000Z') },
  assurance: {
    recentPrimaryAuthSatisfied: assurance?.recentPrimaryAuthSatisfied ?? false,
    freshLoginSatisfied: assurance?.freshLoginSatisfied ?? true,
  },
})

const malformedRequest = (path: string) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })

const invokeMalformed = (
  path: string,
  requestAuthentication?: AdminRequestAuthentication,
  recordAuthorizationResult = vi.fn(),
) =>
  decodeHandler.handle(malformedRequest(path), {
    context: {
      authentication: requestAuthentication,
      requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
      recordAuthorizationResult,
    },
  })

describe('administrator OpenAPI transport errors', () => {
  it('keeps malformed decoding default-deny, then returns typed validation to an admin', async () => {
    const recordAuthorizationResult = vi.fn()
    const unauthenticated = await invokeMalformed('/decode', undefined, recordAuthorizationResult)
    expect(unauthenticated.response?.status).toBe(401)
    await expect(unauthenticated.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'UNAUTHENTICATED',
    })

    const { response } = await invokeMalformed('/decode', authentication('admin'), recordAuthorizationResult)
    expect(response?.status).toBe(400)
    await expect(response?.json()).resolves.toEqual({
      defined: true,
      code: 'VALIDATION_FAILED',
      status: 400,
      message: 'The administrator request is invalid',
      data: { requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' },
    })
    expect(recordAuthorizationResult.mock.calls).toEqual([
      ['decode', 'UNAUTHENTICATED'],
      ['decode', 'VALIDATION_FAILED'],
    ])
  })

  it('enforces the matched procedure policy before returning decode details', async () => {
    const cases = [
      ['/super-decode', authentication('admin'), 403, 'FORBIDDEN'],
      ['/recent-decode', authentication('admin'), 401, 'RECENT_AUTH_REQUIRED'],
      ['/fresh-decode', authentication('admin', { freshLoginSatisfied: false }), 401, 'FRESH_LOGIN_REQUIRED'],
      ['/super-decode', authentication('super_admin'), 400, 'VALIDATION_FAILED'],
      ['/recent-decode', authentication('admin', { recentPrimaryAuthSatisfied: true }), 400, 'VALIDATION_FAILED'],
      ['/fresh-decode', authentication('admin', { freshLoginSatisfied: true }), 400, 'VALIDATION_FAILED'],
    ] as const

    for (const [path, requestAuthentication, status, code] of cases) {
      const result = await invokeMalformed(path, requestAuthentication)
      expect(result.response?.status).toBe(status)
      await expect(result.response?.json()).resolves.toMatchObject({ defined: true, code })
    }
  })
})