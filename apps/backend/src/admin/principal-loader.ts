import { and, eq, gt, sql } from 'drizzle-orm'
import { auth } from '../auth.js'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { session, user } from '../db/auth-schema.js'
import { hasRecentAdminPrimaryAuth } from './primary-auth-store.js'
import {
  resolveAdministratorSessionAuthorization,
  type AdministratorPrincipal,
  type RoleBearingUser,
} from './role-policy.js'
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
    readonly authorizationIssuedAt: Date
  }
  readonly assurance: {
    readonly recentPrimaryAuthSatisfied: boolean
    readonly freshLoginSatisfied: boolean
  }
}

export type AdminRequestAuthentication = UnauthenticatedAdminRequest | AuthenticatedAdminRequest

export type AdminSessionLookup = (headers: Headers) => Promise<
  | {
      session: { id: string }
      user: { id: string }
    }
  | null
  | undefined
>

export type AdminAuthorizationSnapshot = RoleBearingUser & {
  readonly id: string
  readonly adminAuthorizationNotBefore: Date
  readonly authorizationIssuedAt: Date
}
export type AdminAuthorizationSnapshotLookup = (identity: {
  readonly userId: string
  readonly sessionId: string
}) => Promise<AdminAuthorizationSnapshot | undefined>
export type AdminRecentPrimaryAuthLookup = (identity: {
  readonly userId: string
  readonly sessionId: string
}) => Promise<boolean>

export const createAdminPrincipalLoader = ({
  getSession,
  findAuthorizationSnapshot,
  superAdministrators,
  hasRecentPrimaryAuth = async () => false,
}: {
  getSession: AdminSessionLookup
  findAuthorizationSnapshot: AdminAuthorizationSnapshotLookup
  superAdministrators: SuperAdministratorAllowlist
  hasRecentPrimaryAuth?: AdminRecentPrimaryAuthLookup
}) => {
  return async (headers: Headers): Promise<AdminRequestAuthentication> => {
    const session = await getSession(headers)
    if (!session || typeof session.user.id !== 'string' || session.user.id.length === 0) {
      return { status: 'unauthenticated' }
    }

    // The persisted role is deliberately omitted from Better Auth's public
    // session output. Re-read the current row for every administrator request.
    const authorizationUser = await findAuthorizationSnapshot({
      userId: session.user.id,
      sessionId: session.session.id,
    })
    if (!authorizationUser || authorizationUser.id !== session.user.id) {
      return { status: 'unauthenticated' }
    }

    const { principal, freshLoginSatisfied } = resolveAdministratorSessionAuthorization({
      user: authorizationUser,
      authorizationIssuedAt: authorizationUser.authorizationIssuedAt,
      superAdministrators,
    })
    const recentPrimaryAuthSatisfied =
      principal && freshLoginSatisfied
        ? await hasRecentPrimaryAuth({ userId: authorizationUser.id, sessionId: session.session.id })
        : false

    return {
      status: 'authenticated',
      authorizationUser,
      principal,
      session: {
        id: session.session.id,
        authorizationIssuedAt: authorizationUser.authorizationIssuedAt,
      },
      assurance: { freshLoginSatisfied, recentPrimaryAuthSatisfied },
    }
  }
}

export const findAdminAuthorizationSnapshot: AdminAuthorizationSnapshotLookup = async ({ userId, sessionId }) => {
  const rows = await db
    .select({
      id: user.id,
      role: user.role,
      adminAuthorizationNotBefore: user.adminAuthorizationNotBefore,
      authorizationIssuedAt: session.adminAuthorizationIssuedAt,
    })
    .from(user)
    .innerJoin(session, and(eq(session.id, sessionId), eq(session.userId, user.id)))
    .where(and(eq(user.id, userId), gt(session.expiresAt, sql`clock_timestamp()`)))
    .limit(1)
  return rows[0]
}

export const loadAdminRequestAuthentication = createAdminPrincipalLoader({
  getSession: (headers) => auth.api.getSession({ headers }),
  findAuthorizationSnapshot: findAdminAuthorizationSnapshot,
  superAdministrators: config.auth.superAdministrators,
  hasRecentPrimaryAuth: hasRecentAdminPrimaryAuth,
})