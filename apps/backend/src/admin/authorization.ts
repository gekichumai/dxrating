import {
  AdminProcedureAuthorizationPolicySchema,
  type AdminProcedureAuthorizationPolicy,
} from '@gekichumai/admin-contract'
import {
  canTargetUser,
  resolveAdministratorPrincipal,
  type AdministratorPrincipal,
  type AdministratorTargetAction,
  type PersistedUserRole,
} from './role-policy.js'
import type { AdminRequestAuthentication, AuthenticatedAdminRequest } from './principal-loader.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

export type AdminAuthorizationFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RECENT_AUTH_REQUIRED'
  | 'FRESH_LOGIN_REQUIRED'
  | 'NOT_FOUND'

export class AdminAuthorizationFailure extends Error {
  readonly code: AdminAuthorizationFailureCode

  constructor(code: AdminAuthorizationFailureCode) {
    super('Administrator authorization failed')
    this.name = 'AdminAuthorizationFailure'
    this.code = code
  }
}

export type AdminAuthorizationContext = {
  readonly authentication?: AdminRequestAuthentication
}

export type AuthorizedAdminRequest = AuthenticatedAdminRequest & {
  readonly principal: AdministratorPrincipal
}

export const requireAuthenticated = (context: AdminAuthorizationContext): AuthenticatedAdminRequest => {
  if (context.authentication?.status !== 'authenticated') {
    throw new AdminAuthorizationFailure('UNAUTHENTICATED')
  }
  return context.authentication
}

export const requireAdmin = (context: AdminAuthorizationContext): AuthorizedAdminRequest => {
  const authentication = requireAuthenticated(context)
  if (!authentication.principal) throw new AdminAuthorizationFailure('FORBIDDEN')
  return authentication as AuthorizedAdminRequest
}

export const requireSuperAdmin = (context: AdminAuthorizationContext): AuthorizedAdminRequest => {
  const authentication = requireAdmin(context)
  if (authentication.principal.effectiveRole !== 'super_admin') {
    throw new AdminAuthorizationFailure('FORBIDDEN')
  }
  return authentication
}

export const requireRecentPrimaryAuth = (context: AdminAuthorizationContext): AuthorizedAdminRequest => {
  const authentication = requireAdmin(context)
  if (authentication.assurance?.recentPrimaryAuthSatisfied !== true) {
    throw new AdminAuthorizationFailure('RECENT_AUTH_REQUIRED')
  }
  return authentication
}

export const requireFreshLogin = (context: AdminAuthorizationContext): AuthorizedAdminRequest => {
  const authentication = requireAdmin(context)
  if (authentication.assurance?.freshLoginSatisfied !== true) {
    throw new AdminAuthorizationFailure('FRESH_LOGIN_REQUIRED')
  }
  return authentication
}

export const requireAdminProcedurePolicy = (
  context: AdminAuthorizationContext,
  policy: AdminProcedureAuthorizationPolicy,
): AuthorizedAdminRequest => {
  const validatedPolicy = AdminProcedureAuthorizationPolicySchema.safeParse(policy)
  if (!validatedPolicy.success) {
    throw new Error('Invalid administrator authorization policy')
  }

  let authentication =
    validatedPolicy.data.minimumRole === 'super_admin' ? requireSuperAdmin(context) : requireAdmin(context)

  if (validatedPolicy.data.freshLogin) authentication = requireFreshLogin(context)
  if (validatedPolicy.data.recentPrimaryAuth) authentication = requireRecentPrimaryAuth(context)

  return authentication
}

export type LockedAdminAuthorizationUser = {
  readonly id: string
  readonly role: PersistedUserRole
}

export type AdminMutationAuthorizationTransaction = {
  /** The implementation must issue SELECT ... FOR UPDATE for every ID in the supplied order. */
  lockUsersByIdForUpdate: (
    orderedUserIds: readonly string[],
  ) => Promise<ReadonlyMap<string, LockedAdminAuthorizationUser>>
}

export type AdminTargetAuthorization = {
  readonly actor: LockedAdminAuthorizationUser
  readonly target: LockedAdminAuthorizationUser
  readonly principal: AdministratorPrincipal
}

export const requireTargetAuthorization = async ({
  context,
  targetUserId,
  action,
  transaction,
  superAdministrators,
}: {
  context: AdminAuthorizationContext
  targetUserId: string
  action: AdministratorTargetAction
  transaction: AdminMutationAuthorizationTransaction
  superAdministrators: SuperAdministratorAllowlist
}): Promise<AdminTargetAuthorization> => {
  const authentication = requireAuthenticated(context)
  if (targetUserId.length === 0) throw new AdminAuthorizationFailure('NOT_FOUND')

  const actorUserId = authentication.authorizationUser.id
  const orderedUserIds = Array.from(new Set([actorUserId, targetUserId])).sort()
  const lockedUsers = await transaction.lockUsersByIdForUpdate(orderedUserIds)
  const actor = lockedUsers.get(actorUserId)
  const target = lockedUsers.get(targetUserId)

  if (!actor) throw new AdminAuthorizationFailure('UNAUTHENTICATED')
  if (!target) throw new AdminAuthorizationFailure('NOT_FOUND')
  if (!['user', 'admin'].includes(actor.role) || !['user', 'admin'].includes(target.role)) {
    throw new Error('Invalid locked administrator role')
  }

  const principal = resolveAdministratorPrincipal(actor, superAdministrators)
  if (!principal || !canTargetUser({ actor, target, action, superAdministrators })) {
    throw new AdminAuthorizationFailure('FORBIDDEN')
  }

  return { actor, target, principal }
}