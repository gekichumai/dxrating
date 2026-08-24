import { describe, expect, it, vi } from 'vitest'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { createAdminPrincipalLoader } from './principal-loader.js'

const headers = new Headers({ cookie: 'private-session-cookie' })
const session = {
  session: { id: 'session-id', createdAt: new Date('2026-08-23T00:00:00.000Z') },
  user: { id: 'database-user-id' },
}
const activation = new Date('2026-08-23T00:00:00.000Z')
const authorizationIssuedAt = new Date('2026-08-24T00:00:00.000Z')
const authorizationSnapshot = (role: 'user' | 'admin' = 'admin') => ({
  id: 'database-user-id',
  role,
  adminAuthorizationNotBefore: activation,
  authorizationIssuedAt,
})

describe('administrator principal loader', () => {
  it('returns unauthenticated without querying a user for a missing or expired session', async () => {
    for (const resolvedSession of [null, undefined]) {
      const findAuthorizationSnapshot = vi.fn()
      const load = createAdminPrincipalLoader({
        getSession: vi.fn().mockResolvedValue(resolvedSession),
        findAuthorizationSnapshot,
        superAdministrators: parseSuperAdministratorAllowlist('[]'),
      })

      await expect(load(headers)).resolves.toEqual({ status: 'unauthenticated' })
      expect(findAuthorizationSnapshot).not.toHaveBeenCalled()
    }
  })

  it('re-reads the database role on every request and does not trust session claims', async () => {
    const getSession = vi.fn().mockResolvedValue({
      ...session,
      user: { ...session.user, role: 'admin', email: 'not-an-authorization-input@example.com' },
    })
    const findAuthorizationSnapshot = vi.fn().mockResolvedValue(authorizationSnapshot('user'))
    const load = createAdminPrincipalLoader({
      getSession,
      findAuthorizationSnapshot,
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })

    await expect(load(headers)).resolves.toMatchObject({
      status: 'authenticated',
      authorizationUser: { id: 'database-user-id', role: 'user' },
      principal: undefined,
      session: { authorizationIssuedAt },
      assurance: { freshLoginSatisfied: false, recentPrimaryAuthSatisfied: false },
    })
    await load(headers)

    expect(getSession).toHaveBeenCalledTimes(2)
    expect(findAuthorizationSnapshot).toHaveBeenCalledTimes(2)
    expect(findAuthorizationSnapshot).toHaveBeenNthCalledWith(1, {
      userId: 'database-user-id',
      sessionId: 'session-id',
    })
    expect(findAuthorizationSnapshot).toHaveBeenNthCalledWith(2, {
      userId: 'database-user-id',
      sessionId: 'session-id',
    })
  })

  it('resolves current database administrators and allowlisted ordinary users', async () => {
    const getSession = vi.fn().mockResolvedValue(session)
    const adminLoader = createAdminPrincipalLoader({
      getSession,
      findAuthorizationSnapshot: vi.fn().mockResolvedValue(authorizationSnapshot()),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })
    await expect(adminLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { userId: 'database-user-id', effectiveRole: 'admin' },
      session: { id: 'session-id', authorizationIssuedAt },
      assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: false },
    })

    const superAdminLoader = createAdminPrincipalLoader({
      getSession,
      findAuthorizationSnapshot: vi.fn().mockResolvedValue(authorizationSnapshot('user')),
      superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]', '2026-01-01T00:00:00.000Z'),
    })
    await expect(superAdminLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { userId: 'database-user-id', effectiveRole: 'super_admin' },
      assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: false },
    })
  })

  it('returns a stale administrator principal without consulting recent primary authentication', async () => {
    const hasRecentPrimaryAuth = vi.fn().mockResolvedValue(true)
    const load = createAdminPrincipalLoader({
      getSession: vi.fn().mockResolvedValue(session),
      findAuthorizationSnapshot: vi.fn().mockResolvedValue({
        ...authorizationSnapshot(),
        adminAuthorizationNotBefore: authorizationIssuedAt,
      }),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
      hasRecentPrimaryAuth,
    })

    await expect(load(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { effectiveRole: 'admin' },
      assurance: { freshLoginSatisfied: false, recentPrimaryAuthSatisfied: false },
    })
    expect(hasRecentPrimaryAuth).not.toHaveBeenCalled()
  })

  it('falls back to persisted administrator authority when only the super-admin generation is stale', async () => {
    const load = createAdminPrincipalLoader({
      getSession: vi.fn().mockResolvedValue(session),
      findAuthorizationSnapshot: vi.fn().mockResolvedValue(authorizationSnapshot()),
      superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]', '2026-08-25T00:00:00.000Z'),
    })

    await expect(load(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { effectiveRole: 'admin' },
      assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: false },
    })
  })

  it('requires fresh login for an allowlist addition and applies removal immediately', async () => {
    const getSession = vi.fn().mockResolvedValue(session)
    const findAuthorizationSnapshot = vi.fn().mockResolvedValue(authorizationSnapshot('user'))
    const addedLoader = createAdminPrincipalLoader({
      getSession,
      findAuthorizationSnapshot,
      superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]', '2026-08-25T00:00:00.000Z'),
    })
    await expect(addedLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { effectiveRole: 'super_admin' },
      assurance: { freshLoginSatisfied: false, recentPrimaryAuthSatisfied: false },
    })

    const removedLoader = createAdminPrincipalLoader({
      getSession,
      findAuthorizationSnapshot,
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })
    await expect(removedLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: undefined,
      assurance: { freshLoginSatisfied: false, recentPrimaryAuthSatisfied: false },
    })
  })

  it('loads a non-sliding recent-primary-authentication window for the exact user and session', async () => {
    const hasRecentPrimaryAuth = vi.fn().mockResolvedValue(true)
    const load = createAdminPrincipalLoader({
      getSession: vi.fn().mockResolvedValue(session),
      findAuthorizationSnapshot: vi.fn().mockResolvedValue(authorizationSnapshot()),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
      hasRecentPrimaryAuth,
    })

    await expect(load(headers)).resolves.toMatchObject({
      status: 'authenticated',
      assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: true },
    })
    expect(hasRecentPrimaryAuth).toHaveBeenCalledExactlyOnceWith({
      userId: 'database-user-id',
      sessionId: 'session-id',
    })
  })

  it('fails closed when the session user no longer resolves to the same database account', async () => {
    for (const databaseUser of [undefined, { id: 'different-user-id', role: 'admin' }]) {
      const load = createAdminPrincipalLoader({
        getSession: vi.fn().mockResolvedValue(session),
        findAuthorizationSnapshot: vi.fn().mockResolvedValue(
          databaseUser
            ? {
                ...databaseUser,
                adminAuthorizationNotBefore: activation,
                authorizationIssuedAt,
              }
            : undefined,
        ),
        superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]', '2026-01-01T00:00:00.000Z'),
      })

      await expect(load(headers)).resolves.toEqual({ status: 'unauthenticated' })
    }
  })

  it('propagates session and database failures as unexpected server errors', async () => {
    const sessionFailure = new Error('session store unavailable')
    const databaseFailure = new Error('database unavailable')
    const loadSessionFailure = createAdminPrincipalLoader({
      getSession: vi.fn().mockRejectedValue(sessionFailure),
      findAuthorizationSnapshot: vi.fn(),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })
    const loadDatabaseFailure = createAdminPrincipalLoader({
      getSession: vi.fn().mockResolvedValue(session),
      findAuthorizationSnapshot: vi.fn().mockRejectedValue(databaseFailure),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })

    await expect(loadSessionFailure(headers)).rejects.toBe(sessionFailure)
    await expect(loadDatabaseFailure(headers)).rejects.toBe(databaseFailure)
  })
})