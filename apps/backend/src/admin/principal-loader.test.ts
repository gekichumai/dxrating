import { describe, expect, it, vi } from 'vitest'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { createAdminPrincipalLoader } from './principal-loader.js'

const headers = new Headers({ cookie: 'private-session-cookie' })
const session = {
  session: { id: 'session-id', createdAt: new Date('2026-08-23T00:00:00.000Z') },
  user: { id: 'database-user-id' },
}

describe('administrator principal loader', () => {
  it('returns unauthenticated without querying a user for a missing or expired session', async () => {
    for (const resolvedSession of [null, undefined]) {
      const findUserById = vi.fn()
      const load = createAdminPrincipalLoader({
        getSession: vi.fn().mockResolvedValue(resolvedSession),
        findUserById,
        superAdministrators: parseSuperAdministratorAllowlist('[]'),
      })

      await expect(load(headers)).resolves.toEqual({ status: 'unauthenticated' })
      expect(findUserById).not.toHaveBeenCalled()
    }
  })

  it('re-reads the database role on every request and does not trust session claims', async () => {
    const getSession = vi.fn().mockResolvedValue({
      ...session,
      user: { ...session.user, role: 'admin', email: 'not-an-authorization-input@example.com' },
    })
    const findUserById = vi.fn().mockResolvedValue({ id: 'database-user-id', role: 'user' })
    const load = createAdminPrincipalLoader({
      getSession,
      findUserById,
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })

    await expect(load(headers)).resolves.toMatchObject({
      status: 'authenticated',
      authorizationUser: { id: 'database-user-id', role: 'user' },
      principal: undefined,
    })
    await load(headers)

    expect(getSession).toHaveBeenCalledTimes(2)
    expect(findUserById).toHaveBeenCalledTimes(2)
    expect(findUserById).toHaveBeenNthCalledWith(1, 'database-user-id')
    expect(findUserById).toHaveBeenNthCalledWith(2, 'database-user-id')
  })

  it('resolves current database administrators and allowlisted ordinary users', async () => {
    const getSession = vi.fn().mockResolvedValue(session)
    const adminLoader = createAdminPrincipalLoader({
      getSession,
      findUserById: vi.fn().mockResolvedValue({ id: 'database-user-id', role: 'admin' }),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })
    await expect(adminLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { userId: 'database-user-id', effectiveRole: 'admin' },
      session: session.session,
    })

    const superAdminLoader = createAdminPrincipalLoader({
      getSession,
      findUserById: vi.fn().mockResolvedValue({ id: 'database-user-id', role: 'user' }),
      superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]'),
    })
    await expect(superAdminLoader(headers)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { userId: 'database-user-id', effectiveRole: 'super_admin' },
    })
  })

  it('fails closed when the session user no longer resolves to the same database account', async () => {
    for (const databaseUser of [undefined, { id: 'different-user-id', role: 'admin' }]) {
      const load = createAdminPrincipalLoader({
        getSession: vi.fn().mockResolvedValue(session),
        findUserById: vi.fn().mockResolvedValue(databaseUser),
        superAdministrators: parseSuperAdministratorAllowlist('["database-user-id"]'),
      })

      await expect(load(headers)).resolves.toEqual({ status: 'unauthenticated' })
    }
  })

  it('propagates session and database failures as unexpected server errors', async () => {
    const sessionFailure = new Error('session store unavailable')
    const databaseFailure = new Error('database unavailable')
    const loadSessionFailure = createAdminPrincipalLoader({
      getSession: vi.fn().mockRejectedValue(sessionFailure),
      findUserById: vi.fn(),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })
    const loadDatabaseFailure = createAdminPrincipalLoader({
      getSession: vi.fn().mockResolvedValue(session),
      findUserById: vi.fn().mockRejectedValue(databaseFailure),
      superAdministrators: parseSuperAdministratorAllowlist('[]'),
    })

    await expect(loadSessionFailure(headers)).rejects.toBe(sessionFailure)
    await expect(loadDatabaseFailure(headers)).rejects.toBe(databaseFailure)
  })
})