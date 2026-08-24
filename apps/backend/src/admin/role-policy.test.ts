import { describe, expect, it } from 'vitest'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  canTargetUser,
  forceOrdinaryRoleForNewUser,
  isAdministratorSessionEligible,
  normalizePersistedUserRole,
  resolveAdministratorCapabilities,
  resolveAdministratorPrincipal,
  resolveAdministratorSessionAuthorization,
  resolveEffectiveRole,
} from './role-policy.js'

const allowlist = parseSuperAdministratorAllowlist('["allowlisted-id","CaseSensitiveId"]', '2026-01-01T00:00:00.000Z')

describe('administrator role policy', () => {
  it('uses the persisted role when the immutable user ID is not allowlisted', () => {
    expect(resolveEffectiveRole({ id: 'ordinary-id', role: 'user' }, allowlist)).toBe('user')
    expect(resolveEffectiveRole({ id: 'administrator-id', role: 'admin' }, allowlist)).toBe('admin')
  })

  it('forces every Better Auth user-creation candidate to the ordinary role', () => {
    expect(forceOrdinaryRoleForNewUser({ id: 'new-user', role: 'admin', providerId: 'oauth' })).toEqual({
      id: 'new-user',
      role: 'user',
      providerId: 'oauth',
    })
  })

  it('gives the exact allowlisted ID precedence over the persisted role', () => {
    expect(resolveEffectiveRole({ id: 'allowlisted-id', role: 'user' }, allowlist)).toBe('super_admin')
    expect(resolveEffectiveRole({ id: 'allowlisted-id', role: 'admin' }, allowlist)).toBe('super_admin')
  })

  it('does not derive privilege from mutable profile or provider attributes', () => {
    const mutableLookalike = {
      id: 'ordinary-id',
      role: 'user',
      email: 'allowlisted-id',
      name: 'allowlisted-id',
      providerId: 'allowlisted-id',
      accountId: 'allowlisted-id',
      emailVerified: true,
    }

    expect(resolveEffectiveRole(mutableLookalike, allowlist)).toBe('user')
    expect(resolveEffectiveRole({ id: 'casesensitiveid', role: 'user' }, allowlist)).toBe('user')
    expect(resolveEffectiveRole({ id: 'prefix-allowlisted-id', role: 'user' }, allowlist)).toBe('user')
  })

  it('fails unknown or incomplete role data closed to ordinary user', () => {
    for (const role of [undefined, null, '', 'administrator', 'super_admin', 'ADMIN']) {
      expect(normalizePersistedUserRole(role)).toBe('user')
      expect(resolveEffectiveRole({ id: 'ordinary-id', role }, allowlist)).toBe('user')
    }
    expect(resolveEffectiveRole(undefined, allowlist)).toBe('user')
    expect(resolveEffectiveRole({ role: 'admin' }, allowlist)).toBe('user')
  })

  it('does not use email verification as an administrator predicate', () => {
    const unverifiedAdministrator = { id: 'administrator-id', role: 'admin', emailVerified: false }
    expect(resolveEffectiveRole(unverifiedAdministrator, allowlist)).toBe('admin')
  })

  it('returns narrowly scoped capability flags for each effective role', () => {
    expect(resolveAdministratorCapabilities('user')).toEqual({
      canModerateUsers: false,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    })
    expect(resolveAdministratorCapabilities('admin')).toEqual({
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    })
    expect(resolveAdministratorCapabilities('super_admin')).toEqual({
      canModerateUsers: true,
      canModerateAdministrators: true,
      canManageAdministrators: true,
    })
  })

  it('creates principals only for effective administrators', () => {
    expect(resolveAdministratorPrincipal({ id: 'ordinary-id', role: 'user' }, allowlist)).toBeUndefined()
    expect(resolveAdministratorPrincipal({ id: 'administrator-id', role: 'admin' }, allowlist)).toEqual({
      userId: 'administrator-id',
      effectiveRole: 'admin',
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: false,
        canManageAdministrators: false,
      },
    })
    expect(resolveAdministratorPrincipal({ id: 'allowlisted-id', role: 'user' }, allowlist)).toEqual({
      userId: 'allowlisted-id',
      effectiveRole: 'super_admin',
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: true,
        canManageAdministrators: true,
      },
    })
  })

  it('requires a DB-issued session after both account activation and the current allowlist generation', () => {
    const activation = new Date('2026-08-24T12:00:00.000Z')
    const before = new Date('2026-08-24T11:59:59.999Z')
    const equal = new Date('2026-08-24T12:00:00.000Z')
    const after = new Date('2026-08-24T12:00:00.001Z')

    for (const authorizationIssuedAt of [before, equal]) {
      expect(
        isAdministratorSessionEligible({
          user: { id: 'administrator-id', role: 'admin', adminAuthorizationNotBefore: activation },
          authorizationIssuedAt,
          superAdministrators: allowlist,
        }),
      ).toBe(false)
    }
    expect(
      isAdministratorSessionEligible({
        user: { id: 'administrator-id', role: 'admin', adminAuthorizationNotBefore: activation },
        authorizationIssuedAt: after,
        superAdministrators: allowlist,
      }),
    ).toBe(true)

    const currentGeneration = parseSuperAdministratorAllowlist('["allowlisted-id"]', '2026-08-24T12:00:00.000Z')
    expect(
      isAdministratorSessionEligible({
        user: { id: 'allowlisted-id', role: 'user', adminAuthorizationNotBefore: before },
        authorizationIssuedAt: equal,
        superAdministrators: currentGeneration,
      }),
    ).toBe(false)
    expect(
      isAdministratorSessionEligible({
        user: { id: 'allowlisted-id', role: 'user', adminAuthorizationNotBefore: before },
        authorizationIssuedAt: after,
        superAdministrators: currentGeneration,
      }),
    ).toBe(true)
  })

  it('falls back to persisted administrator authority when a newer super-admin generation requires login', () => {
    const user = {
      id: 'allowlisted-id',
      role: 'admin',
      adminAuthorizationNotBefore: new Date('2026-08-23T00:00:00.000Z'),
    }
    const authorization = resolveAdministratorSessionAuthorization({
      user,
      authorizationIssuedAt: new Date('2026-08-24T00:00:00.000Z'),
      superAdministrators: parseSuperAdministratorAllowlist('["allowlisted-id"]', '2026-08-25T00:00:00.000Z'),
    })

    expect(authorization).toMatchObject({
      principal: { userId: 'allowlisted-id', effectiveRole: 'admin' },
      freshLoginSatisfied: true,
    })
  })

  it('enforces the complete actor-target hierarchy for moderation and role management', () => {
    const ordinary = { id: 'ordinary-id', role: 'user' }
    const administrator = { id: 'administrator-id', role: 'admin' }
    const superAdministrator = { id: 'allowlisted-id', role: 'user' }
    const matrix = [
      { actor: ordinary, target: ordinary, moderate: false, manage: false },
      { actor: ordinary, target: administrator, moderate: false, manage: false },
      { actor: ordinary, target: superAdministrator, moderate: false, manage: false },
      { actor: administrator, target: ordinary, moderate: true, manage: false },
      { actor: administrator, target: administrator, moderate: false, manage: false },
      { actor: administrator, target: superAdministrator, moderate: false, manage: false },
      { actor: superAdministrator, target: ordinary, moderate: true, manage: true },
      { actor: superAdministrator, target: administrator, moderate: true, manage: true },
      { actor: superAdministrator, target: superAdministrator, moderate: false, manage: false },
    ]

    for (const entry of matrix) {
      expect(
        canTargetUser({
          actor: entry.actor,
          target: entry.target,
          action: 'moderate',
          superAdministrators: allowlist,
        }),
      ).toBe(entry.moderate)
      expect(
        canTargetUser({
          actor: entry.actor,
          target: entry.target,
          action: 'manage_administrator_role',
          superAdministrators: allowlist,
        }),
      ).toBe(entry.manage)
    }
  })

  it('never permits an effective super administrator or missing account as a target', () => {
    for (const action of ['moderate', 'manage_administrator_role'] as const) {
      expect(
        canTargetUser({
          actor: { id: 'allowlisted-id', role: 'user' },
          target: { id: 'CaseSensitiveId', role: 'admin' },
          action,
          superAdministrators: allowlist,
        }),
      ).toBe(false)
      expect(
        canTargetUser({
          actor: { id: 'allowlisted-id', role: 'user' },
          target: undefined,
          action,
          superAdministrators: allowlist,
        }),
      ).toBe(false)
    }

    expect(
      canTargetUser({
        actor: { id: 'allowlisted-id', role: 'user' },
        target: { id: 'ordinary-id', role: 'user' },
        action: 'unknown_action' as never,
        superAdministrators: allowlist,
      }),
    ).toBe(false)
  })
})