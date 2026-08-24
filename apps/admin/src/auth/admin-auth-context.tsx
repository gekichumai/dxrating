import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { createContext, useContext, type ReactNode } from 'react'

export type AdminPrincipal = AdminContractOutputs['bootstrap']['principal']

export type AdminAuthSnapshot =
  | { readonly status: 'pending' }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'authenticated'; readonly principal: AdminPrincipal }

export const PENDING_ADMIN_AUTH: AdminAuthSnapshot = { status: 'pending' }

const AdminAuthContext = createContext<AdminAuthSnapshot | undefined>(undefined)

export const AdminAuthProvider = ({
  children,
  value,
}: {
  readonly children: ReactNode
  readonly value: AdminAuthSnapshot
}) => <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>

export const useAdminAuth = (): AdminAuthSnapshot => {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return value
}