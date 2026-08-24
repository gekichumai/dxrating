import type { AdminPrincipal } from './admin-auth-context'
import {
  canAccessAdminDestination,
  canManageAdministrators,
  canModerateUser,
  getAdministratorRoleLabelKey,
} from './admin-capabilities'

const principal = (overrides: Partial<AdminPrincipal> = {}): AdminPrincipal => ({
  userId: 'administrator-id',
  effectiveRole: 'admin',
  capabilities: {
    canModerateUsers: true,
    canModerateAdministrators: false,
    canManageAdministrators: false,
  },
  ...overrides,
})

describe('administrator capability presentation', () => {
  it('uses returned capability flags rather than inferring permissions from the role label', () => {
    const contradictory = principal({
      effectiveRole: 'super_admin',
      capabilities: {
        canModerateUsers: false,
        canModerateAdministrators: false,
        canManageAdministrators: false,
      },
    })

    expect(canModerateUser(contradictory)).toBe(false)
    expect(canManageAdministrators(contradictory)).toBe(false)
    expect(getAdministratorRoleLabelKey(contradictory)).toBe('shell.role.superAdmin')
  })

  it('selects the specific server capability and always fails closed for super-admin targets', () => {
    const contradictory = principal({
      effectiveRole: 'admin',
      capabilities: {
        canModerateUsers: false,
        canModerateAdministrators: true,
        canManageAdministrators: true,
      },
    })

    expect(canModerateUser(contradictory, 'user')).toBe(false)
    expect(canModerateUser(contradictory, 'admin')).toBe(true)
    expect(canModerateUser(contradictory, 'super_admin')).toBe(false)
    expect(canManageAdministrators(contradictory)).toBe(true)
    expect(canAccessAdminDestination(contradictory, 'administrators')).toBe(true)
    expect(canAccessAdminDestination(contradictory, 'comments')).toBe(false)
  })
})