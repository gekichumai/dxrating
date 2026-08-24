import { describe, expect, it, vi } from 'vitest'
import type { AdminProcedureAuthorizationPolicy } from '@gekichumai/admin-contract'
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
  type AdminMutationAuthorizationTransaction,
  type LockedAdminAuthorizationUser,
} from './authorization.js'
import type { AdminRequestAuthentication } from './principal-loader.js'

const superAdministrators = parseSuperAdministratorAllowlist('["super-id"]', '2026-01-01T00:00:00.000Z')
const authorizationNotBefore = new Date('2026-08-22T00:00:00.000Z')
const authorizationIssuedAt = new Date('2026-08-23T00:00:00.000Z')
const moderationPolicy = {
  minimumRole: 'admin',
  recentPrimaryAuth: false,
  freshLogin: false,
  primaryAuthAction: null,
  targetAction: 'moderate',
} as const satisfies AdminProcedureAuthorizationPolicy
const roleManagementPolicy = {
  ...moderationPolicy,
  minimumRole: 'super_admin',
  targetAction: 'manage_administrator_role',
} as const satisfies AdminProcedureAuthorizationPolicy

const lockedUser = (id: string, role: 'user' | 'admin'): LockedAdminAuthorizationUser => ({
  id,
  role,
  adminAuthorizationNotBefore: authorizationNotBefore,
})

const mutationTransaction = (
  lockUsersByIdForUpdate: AdminMutationAuthorizationTransaction['lockUsersByIdForUpdate'],
  overrides: Partial<AdminMutationAuthorizationTransaction> = {},
): AdminMutationAuthorizationTransaction => ({
  lockUsersByIdForUpdate,
  lockSessionByIdForUpdate: vi.fn().mockResolvedValue({
    id: 'session-id',
    userId: 'admin-id',
    authorizationIssuedAt,
  }),
  hasRecentPrimaryAuthForUpdate: vi.fn().mockResolvedValue(false),
  ...overrides,
})

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
  session: { id: 'session-id', authorizationIssuedAt },
  assurance: {
    recentPrimaryAuthSatisfied: assurance?.recentPrimaryAuthSatisfied ?? false,
    freshLoginSatisfied: assurance?.freshLoginSatisfied ?? true,
  },
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
    expectFailure(
      () => requireFreshLogin({ authentication: authentication('admin', { freshLoginSatisfied: false }) }),
      'FRESH_LOGIN_REQUIRED',
    )

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
        ['admin-id', lockedUser('admin-id', 'admin')],
        ['target-id', lockedUser('target-id', 'user')],
      ]),
    )
    const transaction = mutationTransaction(lockUsersByIdForUpdate)

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction,
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
        ['admin-id', lockedUser('admin-id', 'user')],
        ['target-id', lockedUser('target-id', 'user')],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: staleAdminContext,
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(lockUsersByIdForUpdate),
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('denies when the target was promoted before the mutation lock was acquired', async () => {
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', lockedUser('admin-id', 'admin')],
        ['target-id', lockedUser('target-id', 'admin')],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(lockUsersByIdForUpdate),
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rechecks the exact live session and fresh-login floor under the mutation locks', async () => {
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', lockedUser('admin-id', 'admin')],
        ['target-id', lockedUser('target-id', 'user')],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(lockUsersByIdForUpdate, {
          lockSessionByIdForUpdate: vi.fn().mockResolvedValue(undefined),
        }),
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(lockUsersByIdForUpdate, {
          lockSessionByIdForUpdate: vi.fn().mockResolvedValue({
            id: 'session-id',
            userId: 'admin-id',
            authorizationIssuedAt: authorizationNotBefore,
          }),
        }),
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'FRESH_LOGIN_REQUIRED' })
  })

  it('rechecks recent primary authentication under lock when the procedure requires it', async () => {
    const recentPolicy = {
      ...moderationPolicy,
      recentPrimaryAuth: true,
      primaryAuthAction: 'user.ban',
    } as const satisfies AdminProcedureAuthorizationPolicy
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', lockedUser('admin-id', 'admin')],
        ['target-id', lockedUser('target-id', 'user')],
      ]),
    )
    const hasRecentPrimaryAuthForUpdate = vi.fn().mockResolvedValue(false)
    const transaction = mutationTransaction(lockUsersByIdForUpdate, { hasRecentPrimaryAuthForUpdate })

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin', { recentPrimaryAuthSatisfied: true }) },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: recentPolicy,
        transaction,
        superAdministrators,
      }),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })
    expect(hasRecentPrimaryAuthForUpdate).toHaveBeenCalledExactlyOnceWith({
      userId: 'admin-id',
      sessionId: 'session-id',
    })
  })

  it('does not regain super-admin targeting through a stale allowlist generation fallback', async () => {
    const currentGeneration = parseSuperAdministratorAllowlist('["admin-id"]', '2026-08-24T00:00:00.000Z')
    const lockUsersByIdForUpdate = vi.fn().mockResolvedValue(
      new Map([
        ['admin-id', lockedUser('admin-id', 'admin')],
        ['target-id', lockedUser('target-id', 'admin')],
      ]),
    )

    await expect(
      requireTargetAuthorization({
        context: { authentication: authentication('admin') },
        targetUserId: 'target-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(lockUsersByIdForUpdate),
        superAdministrators: currentGeneration,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('never permits a locked effective super-admin target and returns not found for missing accounts', async () => {
    const superContext = { authentication: authentication('super_admin') }
    const superTargetUsers = vi.fn().mockResolvedValue(
      new Map([
        ['super-id', lockedUser('super-id', 'user')],
        ['target-super', lockedUser('target-super', 'admin')],
      ]),
    )
    const superTarget = mutationTransaction(superTargetUsers, {
      lockSessionByIdForUpdate: vi.fn().mockResolvedValue({
        id: 'session-id',
        userId: 'super-id',
        authorizationIssuedAt,
      }),
    })
    const targetAllowlist = parseSuperAdministratorAllowlist('["super-id","target-super"]', '2026-01-01T00:00:00.000Z')

    await expect(
      requireTargetAuthorization({
        context: superContext,
        targetUserId: 'target-super',
        action: 'manage_administrator_role',
        policy: roleManagementPolicy,
        transaction: superTarget,
        superAdministrators: targetAllowlist,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await expect(
      requireTargetAuthorization({
        context: superContext,
        targetUserId: 'missing-id',
        action: 'moderate',
        policy: moderationPolicy,
        transaction: mutationTransaction(
          vi.fn().mockResolvedValue(new Map([['super-id', lockedUser('super-id', 'user')]])),
          {
            lockSessionByIdForUpdate: vi.fn().mockResolvedValue({
              id: 'session-id',
              userId: 'super-id',
              authorizationIssuedAt,
            }),
          },
        ),
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