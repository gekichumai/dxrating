import type { MessageKey } from '../i18n'
import type { AdminPrincipal } from './admin-auth-context'

export type AdminTargetRole = 'user' | 'admin' | 'super_admin'
export type CapabilityGatedDestination = 'administrators' | 'comments' | 'users'

export const canModerateUser = (principal: AdminPrincipal, targetRole: AdminTargetRole = 'user'): boolean =>
  targetRole === 'super_admin'
    ? false
    : targetRole === 'admin'
      ? principal.capabilities.canModerateAdministrators
      : principal.capabilities.canModerateUsers

export const canManageAdministrators = (principal: AdminPrincipal): boolean =>
  principal.capabilities.canManageAdministrators

export const canAccessAdminDestination = (
  principal: AdminPrincipal,
  destination: CapabilityGatedDestination,
): boolean => {
  if (destination === 'administrators') {
    return principal.capabilities.canModerateAdministrators || principal.capabilities.canManageAdministrators
  }
  return principal.capabilities.canModerateUsers
}

export const getAdministratorRoleLabelKey = (principal: AdminPrincipal): MessageKey =>
  principal.effectiveRole === 'super_admin' ? 'shell.role.superAdmin' : 'shell.role.admin'