import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'

export const PERSISTED_USER_ROLES = ['user', 'admin'] as const

export type PersistedUserRole = (typeof PERSISTED_USER_ROLES)[number]
export type EffectiveUserRole = PersistedUserRole | 'super_admin'

export type RoleBearingUser = {
  readonly id?: unknown
  readonly role?: unknown
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
  const targetRole = resolveEffectiveRole(target, superAdministrators)
  if (targetRole === 'super_admin') return false

  if (action === 'manage_administrator_role') return actorRole === 'super_admin'
  if (action === 'moderate') {
    if (actorRole === 'super_admin') return true
    return actorRole === 'admin' && targetRole === 'user'
  }
  return false
}