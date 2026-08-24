import {
  adminErrors,
  type AdminProcedureAuthorizationPolicy,
  type AdminProcedureMetadata,
} from '@gekichumai/admin-contract'
import { oc } from '@orpc/contract'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { implement } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { resolveAdministratorPrincipal } from './role-policy.js'
import type { AdminRequestAuthentication } from './principal-loader.js'
import {
  adminErrorBoundaryMiddleware,
  createAdminTargetAuthorizationMiddleware,
  requireAdminProcedurePolicyMiddleware,
  type AdminMutationAuthorizationTransactionRunner,
  type AdminRequestContext,
} from './router.js'

const defaultPolicy = {
  minimumRole: 'admin',
  recentPrimaryAuth: false,
  freshLogin: false,
  primaryAuthAction: null,
  targetAction: null,
} as const satisfies AdminProcedureAuthorizationPolicy

const authentication = (
  role: 'admin' | 'super_admin',
  assurance?: { recentPrimaryAuthSatisfied?: boolean; freshLoginSatisfied?: boolean },
): AdminRequestAuthentication => {
  const user = {
    id: role === 'super_admin' ? 'super-id' : 'admin-id',
    role: role === 'admin' ? ('admin' as const) : ('user' as const),
  }
  const superAdministrators = parseSuperAdministratorAllowlist('["super-id"]', '2026-01-01T00:00:00.000Z')

  return {
    status: 'authenticated',
    authorizationUser: user,
    principal: resolveAdministratorPrincipal(user, superAdministrators),
    session: { id: 'session-id', authorizationIssuedAt: new Date('2026-08-23T00:00:00.000Z') },
    assurance: {
      recentPrimaryAuthSatisfied: assurance?.recentPrimaryAuthSatisfied ?? false,
      freshLoginSatisfied: assurance?.freshLoginSatisfied ?? true,
    },
  }
}

const guardProcedure = oc
  .$meta<AdminProcedureMetadata>({ authorization: defaultPolicy })
  .errors(adminErrors)
  .input(z.object({}))
  .output(z.object({ effectiveRole: z.enum(['admin', 'super_admin']) }))

const guardContract = {
  superOperation: guardProcedure
    .meta({ authorization: { ...defaultPolicy, minimumRole: 'super_admin' } })
    .route({ method: 'GET', path: '/super' }),
  recentOperation: guardProcedure
    .meta({
      authorization: {
        ...defaultPolicy,
        recentPrimaryAuth: true,
        primaryAuthAction: 'comment.delete',
      },
    })
    .route({ method: 'GET', path: '/recent' }),
  freshOperation: guardProcedure
    .meta({ authorization: { ...defaultPolicy, freshLogin: true } })
    .route({ method: 'GET', path: '/fresh' }),
  driftedOperation: guardProcedure
    .meta({
      authorization: {
        ...defaultPolicy,
        primaryAuthAction: 'comment.delete',
      },
    })
    .route({ method: 'GET', path: '/drifted' }),
  unexpectedOperation: guardProcedure.route({ method: 'GET', path: '/unexpected' }),
}

const guardOs = implement(guardContract).$context<AdminRequestContext>()
const policyGuarded = guardOs.use(adminErrorBoundaryMiddleware).use(requireAdminProcedurePolicyMiddleware)
const guardRouter = policyGuarded.router({
  superOperation: policyGuarded.superOperation.handler(({ context }) => ({
    effectiveRole: context.adminPrincipal.effectiveRole,
  })),
  recentOperation: policyGuarded.recentOperation.handler(({ context }) => ({
    effectiveRole: context.adminPrincipal.effectiveRole,
  })),
  freshOperation: policyGuarded.freshOperation.handler(({ context }) => ({
    effectiveRole: context.adminPrincipal.effectiveRole,
  })),
  driftedOperation: policyGuarded.driftedOperation.handler(({ context }) => ({
    effectiveRole: context.adminPrincipal.effectiveRole,
  })),
  unexpectedOperation: policyGuarded.unexpectedOperation.handler(() => {
    throw new Error('private moderation reason and credential')
  }),
})
const guardHandler = new OpenAPIHandler(guardRouter)

const invokeGuard = (path: string, requestAuthentication: AdminRequestAuthentication) =>
  guardHandler.handle(new Request(`http://localhost${path}`), {
    context: {
      authentication: requestAuthentication,
      requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
    },
  })

describe('administrator oRPC policy guards over HTTP', () => {
  it('enforces procedure super-admin metadata', async () => {
    const denied = await invokeGuard('/super', authentication('admin'))
    expect(denied.response?.status).toBe(403)
    await expect(denied.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
      data: { requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' },
    })

    const permitted = await invokeGuard('/super', authentication('super_admin'))
    expect(permitted.response?.status).toBe(200)
    await expect(permitted.response?.json()).resolves.toEqual({ effectiveRole: 'super_admin' })
  })

  it('keeps recent-primary-auth and fresh-login recovery codes distinct', async () => {
    const recentRequired = await invokeGuard('/recent', authentication('admin'))
    expect(recentRequired.response?.status).toBe(401)
    await expect(recentRequired.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'RECENT_AUTH_REQUIRED',
    })

    const freshRequired = await invokeGuard('/fresh', authentication('admin', { freshLoginSatisfied: false }))
    expect(freshRequired.response?.status).toBe(401)
    await expect(freshRequired.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'FRESH_LOGIN_REQUIRED',
    })

    const recentSatisfied = await invokeGuard('/recent', authentication('admin', { recentPrimaryAuthSatisfied: true }))
    expect(recentSatisfied.response?.status).toBe(200)

    const freshSatisfied = await invokeGuard('/fresh', authentication('admin', { freshLoginSatisfied: true }))
    expect(freshSatisfied.response?.status).toBe(200)
  })

  it('fails closed when procedure metadata drifts from the central primary-auth action matrix', async () => {
    const failed = await invokeGuard('/drifted', authentication('admin', { recentPrimaryAuthSatisfied: true }))
    expect(failed.response?.status).toBe(500)
    await expect(failed.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('replaces unexpected failures with a typed, sanitized server error', async () => {
    const failed = await invokeGuard('/unexpected', authentication('admin'))
    expect(failed.response?.status).toBe(500)
    const body = await failed.response?.json()
    expect(body).toEqual({
      defined: true,
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      message: 'The administrator request could not be completed',
      data: { requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' },
    })
    expect(JSON.stringify(body)).not.toContain('private moderation reason')
    expect(JSON.stringify(body)).not.toContain('credential')
  })
})

const targetPolicy = {
  ...defaultPolicy,
  targetAction: 'moderate',
} as const satisfies AdminProcedureAuthorizationPolicy
const targetProcedure = oc
  .$meta<AdminProcedureMetadata>({ authorization: targetPolicy })
  .errors(adminErrors)
  .route({ method: 'POST', path: '/target' })
  .input(z.object({ targetUserId: z.string().min(1) }))
  .output(z.object({ actorUserId: z.string(), targetUserId: z.string() }))
const targetContract = { target: targetProcedure }

describe('administrator target-aware oRPC guard over HTTP', () => {
  it('keeps the row locks and handler in one transaction and rechecks stale authority', async () => {
    const events: string[] = []
    let lockedActorRole: 'user' | 'admin' = 'admin'
    const adminAuthorizationNotBefore = new Date('2026-08-22T00:00:00.000Z')
    const authorizationIssuedAt = new Date('2026-08-23T00:00:00.000Z')
    const lockUsersByIdForUpdate = vi.fn(async (orderedUserIds: readonly string[]) => {
      events.push(`lock:${orderedUserIds.join(',')}`)
      return new Map([
        ['admin-id', { id: 'admin-id', role: lockedActorRole, adminAuthorizationNotBefore }],
        ['target-id', { id: 'target-id', role: 'user' as const, adminAuthorizationNotBefore }],
      ])
    })
    const lockSessionByIdForUpdate = vi.fn(async () => {
      events.push('lock-session')
      return { id: 'session-id', userId: 'admin-id', authorizationIssuedAt }
    })
    const hasRecentPrimaryAuthForUpdate = vi.fn(async () => {
      events.push('lock-primary-auth')
      return false
    })
    const runInTransaction: AdminMutationAuthorizationTransactionRunner = async (operation) => {
      events.push('begin')
      const result = await operation({
        lockUsersByIdForUpdate,
        lockSessionByIdForUpdate,
        hasRecentPrimaryAuthForUpdate,
      })
      events.push('commit')
      return result
    }
    const targetMiddleware = createAdminTargetAuthorizationMiddleware<{ targetUserId: string }>({
      action: 'moderate',
      getTargetUserId: (input) => input.targetUserId,
      runInTransaction,
      superAdministrators: parseSuperAdministratorAllowlist(undefined),
    })
    const targetOs = implement(targetContract).$context<AdminRequestContext>()
    const targetGuarded = targetOs.use(adminErrorBoundaryMiddleware).use(requireAdminProcedurePolicyMiddleware)
    const targetRouter = targetGuarded.router({
      target: targetGuarded.target.use(targetMiddleware).handler(({ context }) => {
        events.push('handler')
        return {
          actorUserId: context.adminTargetAuthorization.actor.id,
          targetUserId: context.adminTargetAuthorization.target.id,
        }
      }),
    })
    const targetHandler = new OpenAPIHandler(targetRouter)
    const invokeTarget = (body: Record<string, unknown> = { targetUserId: 'target-id' }) =>
      targetHandler.handle(
        new Request('http://localhost/target', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        {
          context: {
            authentication: authentication('admin'),
            requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
          },
        },
      )

    const invalid = await invokeTarget({})
    expect(invalid.response?.status).toBe(400)
    await expect(invalid.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'VALIDATION_FAILED',
    })
    expect(events).toEqual([])

    const permitted = await invokeTarget()
    expect(permitted.response?.status).toBe(200)
    await expect(permitted.response?.json()).resolves.toEqual({
      actorUserId: 'admin-id',
      targetUserId: 'target-id',
    })
    expect(events).toEqual(['begin', 'lock:admin-id,target-id', 'lock-session', 'handler', 'commit'])

    events.length = 0
    lockedActorRole = 'user'
    const denied = await invokeTarget()
    expect(denied.response?.status).toBe(403)
    await expect(denied.response?.json()).resolves.toMatchObject({
      defined: true,
      code: 'FORBIDDEN',
    })
    expect(events).toEqual(['begin', 'lock:admin-id,target-id', 'lock-session'])
  })
})