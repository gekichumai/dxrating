import { describe, expect, it, vi } from 'vitest'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  AdminAuthorizationFailure,
  requireAdmin,
  requireAuthenticated,
  requireFreshLogin,
  requireRecentPrimaryAuth,
  requireSuperAdmin,
  requireTargetAuthorization,
  type AdminAuthorizationContext,
} from './authorization.js'
import type { AdminRequestAuthentication } from './principal-loader.js'

const superAdministrators = parseSuperAdministratorAllowlist('["super-id"]')

const authentication = (
  role: 'user' | 'admin' | 'super_admin',
  assurance?: { recentPrimaryAuthSatisfied?: boolean; freshLoginSatisfied?: boolean },
): AdminRequestAuthentication => ({
  status: 'authenticated',
  authorizationUser: {
    id: role === 'super_admin' ? 'super-id' : `${role}-id`,
    role: role === 'admin' ? 'admin' : 'user',
  },
  principal:
    role === 'user'
      ? undefined
      : {
          userId: role === 'super_admin' ? 'super-id' : 'admin-id',
          effectiveRole: role,
          capabilities: {
            canModerateUsers: true,
            canModerateAdministrators: role === 'super_admin',
            canManageAdministrators: role === 'super_admin',
          },
        },
  session: { id: 'session-id', createdAt: new Date('2026-08-23T00:00:00.000Z') },
  assurance,
})

const expectFailure = (callback: () => unknown, code: string) => {
  expect(callback).toThrowError(expect.objectContaining({ name: 'AdminAuthorizationFailure', code }))
}

describe('administrator authorization guards', () => {
  it('distinguishes missing authentication, ordinary users, admins, and super admins', () => {
    expectFailure(() => requireAuthenticated({}), 'UNAUTHENTICATED')
    expect(requireAuthenticated({ authentication: authentication('user') }).status).toBe('authenticated')
    expectFailure(() => requireAdmin({ authentication: authentication('user') }), 'FORBIDDEN')
    expect(requireAdmin({ authentication: authentication('admin') }).principal.effectiveRole).toBe('admin')
    expectFailure(() => requireSuperAdmin({ authentication: authentication('admin') }), 'FORBIDDEN')
    expect(requireSuperAdmin({ authentication: authentication('super_admin') }).principal.effectiveRole).toBe(
      'super_admin',
    )
  })

  it('keeps recent-authentication and fresh-login ceremonies distinct and fail closed', () => {
    const admin = authentication('admin')
    expectFailure(() => requireRecentPrimaryAuth({ authentication: admin }), 'RECENT_AUTH_REQUIRED')
    expectFailure(() => requireFreshLogin({ authentication: admin }), 'FRESH_LOGIN_REQUIRED')

    expect(
      requireRecentPrimaryAuth({
        authentication: authentication('admin', { recentPrimaryAuthSatisfied: true }),
      }).principal.effectiveRole,
    ).toBe('admin')
    expect(
      requireFreshLogin({
        authentication: authentication('admin', { freshLoginSatisfied: true }),
      }).principal.effectiveRole,
    ).toBe('admin')
  })

  it('locks and re-resolves actor and target inside the supplied mutation transaction', async () => {
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', { id: 'admin-id', role: 'admin' }],
        ['target-id', { id: 'target-id', role: 'user' }],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        transaction: { lockUsersByIdForUpdate },
        superAdministrators,
      }),
    ).resolves.toMatchObject({
      actor: { id: 'admin-id', role: 'admin' },
      target: { id: 'target-id', role: 'user' },
      principal: { effectiveRole: 'admin' },
    })
    expect(lockUsersByIdForUpdate).toHaveBeenCalledWith(['admin-id', 'target-id'])
  })

  it('ignores stale context roles and denies using the rows locked at mutation time', async () => {
    const staleAdminContext: AdminAuthorizationContext = { authentication: authentication('admin') }
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', { id: 'admin-id', role: 'user' }],
        ['target-id', { id: 'target-id', role: 'user' }],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: staleAdminContext,
        targetUserId: 'target-id',
        action: 'moderate',
        transaction: { lockUsersByIdForUpdate },
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('denies when the target was promoted before the mutation lock was acquired', async () => {
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', { id: 'admin-id', role: 'admin' }],
        ['target-id', { id: 'target-id', role: 'admin' }],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        transaction: { lockUsersByIdForUpdate },
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('never permits a locked effective super-admin target and returns not found for missing accounts', async () => {
    const superContext = { authentication: authentication('super_admin') }
    const superTarget = {
      lockUsersByIdForUpdate: vi.fn().mockResolvedValue(
        new Map([
          ['super-id', { id: 'super-id', role: 'user' }],
          ['target-super', { id: 'target-super', role: 'admin' }],
        ]),
      ),
    }
    const targetAllowlist = parseSuperAdministratorAllowlist('["super-id","target-super"]')

    await expect(
      requireTargetAuthorization({
        context: superContext,
        targetUserId: 'target-super',
        action: 'manage_administrator_role',
        transaction: superTarget,
        superAdministrators: targetAllowlist,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await expect(
      requireTargetAuthorization({
        context: superContext,
        targetUserId: 'missing-id',
        action: 'moderate',
        transaction: {
          lockUsersByIdForUpdate: vi.fn().mockResolvedValue(new Map([['super-id', { id: 'super-id', role: 'user' }]])),
        },
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('uses a sanitized failure object without actor, target, or policy details', () => {
    const failure = new AdminAuthorizationFailure('FORBIDDEN')
    expect(failure.message).toBe('Administrator authorization failed')
    expect(Object.keys(failure)).toEqual(['code', 'name'])
  })
})