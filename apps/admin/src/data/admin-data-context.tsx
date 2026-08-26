import { createContext, useContext, type ReactNode } from 'react'
import type { AdminDataClient } from './admin-client'

const AdminDataContext = createContext<AdminDataClient | undefined>(undefined)

export const AdminDataProvider = ({
  children,
  value,
}: {
  readonly children: ReactNode
  readonly value: AdminDataClient
}) => <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>

export const useAdminData = (): AdminDataClient => {
  const value = useContext(AdminDataContext)
  if (!value) throw new Error('useAdminData must be used inside AdminDataProvider')
  return value
}