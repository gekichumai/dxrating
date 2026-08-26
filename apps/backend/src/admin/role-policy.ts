import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

export const PERSISTED_USER_ROLES = ['user', 'admin'] as const

export type PersistedUserRole = (typeof PERSISTED_USER_ROLES)[number]
export type EffectiveUserRole = PersistedUserRole | 'super_admin'

export type RoleBearingUser = {
  readonly id?: unknown
  readonly role?: unknown
  readonly adminAuthorizationNotBefore?: unknown
}

export type AdministratorCapabilities = {
  readonly canModerateUsers: boolean
  readonly canModerateAdministrators: boolean
  readonly canManageAdministrators: boolean
}

export type AdministratorPrincipal = {
  readonly userId: string
  readonly effectiveRole: Exclude<EffectiveUserRole, 'user'>
  readonly capabilities: AdministratorCapabilities
}

export type AdministratorSessionAuthorization = {
  readonly principal: AdministratorPrincipal | undefined
  readonly freshLoginSatisfied: boolean
}

export type AdministratorTargetAction = 'moderate' | 'manage_administrator_role'

const USER_CAPABILITIES: AdministratorCapabilities = Object.freeze({
  canModerateUsers: false,
  canModerateAdministrators: false,
  canManageAdministrators: false,
})

const ADMIN_CAPABILITIES: AdministratorCapabilities = Object.freeze({
  canModerateUsers: true,
  canModerateAdministrators: false,
  canManageAdministrators: false,
})

const SUPER_ADMIN_CAPABILITIES: AdministratorCapabilities = Object.freeze({
  canModerateUsers: true,
  canModerateAdministrators: true,
  canManageAdministrators: true,
})

const hasUsableUserId = (user: RoleBearingUser | null | undefined): user is RoleBearingUser & { id: string } =>
  typeof user?.id === 'string' && user.id.length > 0

export const normalizePersistedUserRole = (role: unknown): PersistedUserRole => (role === 'admin' ? 'admin' : 'user')

export const forceOrdinaryRoleForNewUser = <Candidate extends Record<string, unknown>>(
  candidate: Candidate,
): Candidate & { role: 'user' } => ({
  ...candidate,
  role: 'user',
})

export const resolveEffectiveRole = (
  user: RoleBearingUser | null | undefined,
  superAdministrators: SuperAdministratorAllowlist,
): EffectiveUserRole => {
  if (!hasUsableUserId(user)) return 'user'
  if (superAdministrators.hasExactUserId(user.id)) return 'super_admin'
  return normalizePersistedUserRole(user.role)
}

export const resolveAdministratorCapabilities = (role: EffectiveUserRole): AdministratorCapabilities => {
  if (role === 'super_admin') return SUPER_ADMIN_CAPABILITIES
  if (role === 'admin') return ADMIN_CAPABILITIES
  return USER_CAPABILITIES
}

export const resolveAdministratorPrincipal = (
  user: RoleBearingUser | null | undefined,
  superAdministrators: SuperAdministratorAllowlist,
): AdministratorPrincipal | undefined => {
  if (!hasUsableUserId(user)) return undefined
  const effectiveRole = resolveEffectiveRole(user, superAdministrators)
  if (effectiveRole === 'user') return undefined

  return {
    userId: user.id,
    effectiveRole,
    capabilities: resolveAdministratorCapabilities(effectiveRole),
  }
}

const administratorPrincipalForRole = (
  userId: string,
  role: Exclude<EffectiveUserRole, 'user'>,
): AdministratorPrincipal => ({
  userId,
  effectiveRole: role,
  capabilities: resolveAdministratorCapabilities(role),
})

export const resolveAdministratorSessionAuthorization = ({
  user,
  authorizationIssuedAt,
  superAdministrators,
}: {
  user: RoleBearingUser | null | undefined
  authorizationIssuedAt: Date
  superAdministrators: SuperAdministratorAllowlist
}): AdministratorSessionAuthorization => {
  if (!hasUsableUserId(user)) return { principal: undefined, freshLoginSatisfied: false }

  const persistedRole = normalizePersistedUserRole(user.role)
  const allowlisted = superAdministrators.hasExactUserId(user.id)
  const potentialRole = allowlisted ? 'super_admin' : persistedRole
  const potentialPrincipal =
    potentialRole === 'user' ? undefined : administratorPrincipalForRole(user.id, potentialRole)

  if (!(user.adminAuthorizationNotBefore instanceof Date)) {
    return { principal: potentialPrincipal, freshLoginSatisfied: false }
  }

  const issuedAtMilliseconds = authorizationIssuedAt.getTime()
  const notBeforeMilliseconds = user.adminAuthorizationNotBefore.getTime()
  if (
    !Number.isFinite(issuedAtMilliseconds) ||
    !Number.isFinite(notBeforeMilliseconds) ||
    issuedAtMilliseconds <= notBeforeMilliseconds
  ) {
    return { principal: potentialPrincipal, freshLoginSatisfied: false }
  }

  if (allowlisted) {
    if (superAdministrators.isSessionEligibleForCurrentGeneration(user.id, authorizationIssuedAt)) {
      return {
        principal: administratorPrincipalForRole(user.id, 'super_admin'),
        freshLoginSatisfied: true,
      }
    }

    // A session predating the current super-admin generation can retain an
    // intentional persisted-administrator fallback as long as it clears that
    // account's own role floor.
    if (persistedRole === 'admin') {
      return {
        principal: administratorPrincipalForRole(user.id, 'admin'),
        freshLoginSatisfied: true,
      }
    }
  }

  return {
    principal: potentialPrincipal,
    freshLoginSatisfied: persistedRole === 'admin',
  }
}

export const isAdministratorSessionEligible = (input: {
  user: RoleBearingUser | null | undefined
  authorizationIssuedAt: Date
  superAdministrators: SuperAdministratorAllowlist
}): boolean => resolveAdministratorSessionAuthorization(input).freshLoginSatisfied

export const canTargetUser = ({
  actor,
  target,
  action,
  superAdministrators,
}: {
  actor: RoleBearingUser | null | undefined
  target: RoleBearingUser | null | undefined
  action: AdministratorTargetAction
  superAdministrators: SuperAdministratorAllowlist
}): boolean => {
  if (!hasUsableUserId(actor) || !hasUsableUserId(target)) return false

  const actorRole = resolveEffectiveRole(actor, superAdministrators)
  if (actorRole === 'user') return false
  return canAdministratorPrincipalTargetUser({
    principal: administratorPrincipalForRole(actor.id, actorRole),
    target,
    action,
    superAdministrators,
  })
}

export const canAdministratorPrincipalTargetUser = ({
  principal,
  target,
  action,
  superAdministrators,
}: {
  principal: AdministratorPrincipal
  target: RoleBearingUser | null | undefined
  action: AdministratorTargetAction
  superAdministrators: SuperAdministratorAllowlist
}): boolean => {
  if (!hasUsableUserId(target)) return false

  const actorRole = principal.effectiveRole
  const targetRole = resolveEffectiveRole(target, superAdministrators)
  if (targetRole === 'super_admin') return false

  if (action === 'manage_administrator_role') return actorRole === 'super_admin'
  if (action === 'moderate') {
    if (actorRole === 'super_admin') return true
    return actorRole === 'admin' && targetRole === 'user'
  }
  return false
}