import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AdminAuthProvider, PENDING_ADMIN_AUTH, useAdminAuth, type AdminAuthSnapshot } from './admin-auth-context'

describe('administrator authentication context seam', () => {
  it('provides an injectable snapshot without implementing authentication', () => {
    const value: AdminAuthSnapshot = {
      status: 'authenticated',
      principal: {
        userId: 'admin-user-id',
        effectiveRole: 'admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: true,
          canManageAdministrators: false,
        },
      },
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AdminAuthProvider value={value}>{children}</AdminAuthProvider>
    )

    expect(renderHook(useAdminAuth, { wrapper }).result.current).toEqual(value)
  })

  it('exports a stable pending state for the authentication implementation step', () => {
    expect(PENDING_ADMIN_AUTH).toEqual({
      status: 'pending',
      phase: 'session',
      checkId: 0,
    })
  })
})