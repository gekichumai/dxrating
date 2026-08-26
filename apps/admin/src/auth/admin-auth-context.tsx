import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { createContext, useContext, type ReactNode } from 'react'

export type AdminPrincipal = AdminContractOutputs['bootstrap']['principal']
export type AdminAuthUnavailableSource = 'authorization' | 'session' | 'sign-out'

export type AdminAuthSnapshot =
  | { readonly status: 'pending'; readonly phase: 'session' | 'authorization'; readonly checkId: number }
  | {
      readonly status: 'clearing'
      readonly destination: 'authenticated' | 'forbidden' | 'fresh-login-required' | 'signing-out' | 'unauthenticated'
    }
  | { readonly status: 'unauthenticated'; readonly reason: 'initial' | 'expired-or-revoked' | 'signed-out' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'fresh-login-required' }
  | { readonly status: 'signing-out' }
  | { readonly status: 'unavailable'; readonly source: AdminAuthUnavailableSource }
  | { readonly status: 'authenticated'; readonly principal: AdminPrincipal }

export const PENDING_ADMIN_AUTH: AdminAuthSnapshot = { status: 'pending', phase: 'session', checkId: 0 }

export type AdminAuthActions = {
  readonly reportFeatureError: (error: unknown) => boolean
  readonly retry: () => Promise<void>
  readonly signOut: () => Promise<void>
}

export const INERT_ADMIN_AUTH_ACTIONS: AdminAuthActions = {
  reportFeatureError: () => false,
  retry: async () => undefined,
  signOut: async () => undefined,
}

const AdminAuthContext = createContext<AdminAuthSnapshot | undefined>(undefined)
const AdminAuthActionsContext = createContext<AdminAuthActions | undefined>(undefined)

export const AdminAuthProvider = ({
  actions = INERT_ADMIN_AUTH_ACTIONS,
  children,
  value,
}: {
  readonly actions?: AdminAuthActions
  readonly children: ReactNode
  readonly value: AdminAuthSnapshot
}) => (
  <AdminAuthActionsContext.Provider value={actions}>
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  </AdminAuthActionsContext.Provider>
)

export const useAdminAuth = (): AdminAuthSnapshot => {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return value
}

export const useAdminAuthActions = (): AdminAuthActions => {
  const value = useContext(AdminAuthActionsContext)
  if (!value) throw new Error('useAdminAuthActions must be used inside AdminAuthProvider')
  return value
}