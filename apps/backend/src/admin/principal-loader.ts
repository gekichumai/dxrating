import { eq } from 'drizzle-orm'
import { auth } from '../auth.js'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { user } from '../db/auth-schema.js'
import { resolveAdministratorPrincipal, type AdministratorPrincipal, type RoleBearingUser } from './role-policy.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

export type UnauthenticatedAdminRequest = {
  readonly status: 'unauthenticated'
}

export type AuthenticatedAdminRequest = {
  readonly status: 'authenticated'
  readonly authorizationUser: RoleBearingUser & { id: string }
  readonly principal: AdministratorPrincipal | undefined
  readonly session: {
    readonly id: string
    readonly createdAt: Date
  }
  readonly assurance?: {
    readonly recentPrimaryAuthSatisfied?: boolean
    readonly freshLoginSatisfied?: boolean
  }
}

export type AdminRequestAuthentication = UnauthenticatedAdminRequest | AuthenticatedAdminRequest

export type AdminSessionLookup = (headers: Headers) => Promise<
  | {
      session: { id: string; createdAt: Date }
      user: { id: string }
    }
  | null
  | undefined
>

export type AdminUserLookup = (userId: string) => Promise<(RoleBearingUser & { id: string }) | undefined>

export const createAdminPrincipalLoader = ({
  getSession,
  findUserById,
  superAdministrators,
}: {
  getSession: AdminSessionLookup
  findUserById: AdminUserLookup
  superAdministrators: SuperAdministratorAllowlist
}) => {
  return async (headers: Headers): Promise<AdminRequestAuthentication> => {
    const session = await getSession(headers)
    if (!session || typeof session.user.id !== 'string' || session.user.id.length === 0) {
      return { status: 'unauthenticated' }
    }

    // The persisted role is deliberately omitted from Better Auth's public
    // session output. Re-read the current row for every administrator request.
    const authorizationUser = await findUserById(session.user.id)
    if (!authorizationUser || authorizationUser.id !== session.user.id) {
      return { status: 'unauthenticated' }
    }

    return {
      status: 'authenticated',
      authorizationUser,
      principal: resolveAdministratorPrincipal(authorizationUser, superAdministrators),
      session: {
        id: session.session.id,
        createdAt: session.session.createdAt,
      },
    }
  }
}

export const findAdminAuthorizationUserById: AdminUserLookup = async (userId) => {
  const rows = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  return rows[0]
}

export const loadAdminRequestAuthentication = createAdminPrincipalLoader({
  getSession: (headers) => auth.api.getSession({ headers }),
  findUserById: findAdminAuthorizationUserById,
  superAdministrators: config.auth.superAdministrators,
})