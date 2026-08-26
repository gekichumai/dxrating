import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { AdminAuthClient, AdminAuthFailure, AdminSessionIdentity } from './admin-auth-client'

export type AdminSessionState =
  | { readonly status: 'pending'; readonly refetch: () => Promise<void> }
  | {
      readonly status: 'authenticated'
      readonly identity: AdminSessionIdentity
      readonly isRefetching: boolean
      readonly refetch: () => Promise<void>
    }
  | { readonly status: 'unauthenticated'; readonly refetch: () => Promise<void> }
  | { readonly status: 'unavailable'; readonly failure: AdminAuthFailure; readonly refetch: () => Promise<void> }

export type AdminSessionProviderProps = {
  readonly children: ReactNode
  readonly client: AdminAuthClient
  readonly onSessionAvailable?: (identity: AdminSessionIdentity) => Promise<void> | void
  readonly onSessionMissing?: () => Promise<void> | void
  readonly onSessionUnavailable?: (failure: AdminAuthFailure) => Promise<void> | void
}

const AdminSessionContext = createContext<AdminSessionState | undefined>(undefined)

const notificationKey = (state: AdminSessionState): string => {
  if (state.status === 'authenticated') return `authenticated:${state.identity.sessionId}`
  if (state.status === 'unavailable') return `unavailable:${state.failure.kind}`
  return state.status
}

export const AdminSessionProvider = ({
  children,
  client,
  onSessionAvailable,
  onSessionMissing,
  onSessionUnavailable,
}: AdminSessionProviderProps) => {
  const session = client.useSession()
  const lastNotification = useRef<string | undefined>(undefined)

  const state = useMemo<AdminSessionState>(() => {
    if (session.isPending) return { status: 'pending', refetch: session.refetch }
    if (session.error) return { status: 'unavailable', failure: session.error, refetch: session.refetch }
    if (!session.data) return { status: 'unauthenticated', refetch: session.refetch }
    return {
      status: 'authenticated',
      identity: session.data,
      isRefetching: session.isRefetching,
      refetch: session.refetch,
    }
  }, [session.data, session.error, session.isPending, session.isRefetching, session.refetch])

  useEffect(() => {
    const key = notificationKey(state)
    if (lastNotification.current === key) return
    lastNotification.current = key

    if (state.status === 'authenticated') void onSessionAvailable?.(state.identity)
    if (state.status === 'unauthenticated') void onSessionMissing?.()
    if (state.status === 'unavailable') void onSessionUnavailable?.(state.failure)
  }, [onSessionAvailable, onSessionMissing, onSessionUnavailable, state])

  return <AdminSessionContext.Provider value={state}>{children}</AdminSessionContext.Provider>
}

export const useAdminSession = (): AdminSessionState => {
  const state = useContext(AdminSessionContext)
  if (!state) throw new Error('useAdminSession must be used inside AdminSessionProvider')
  return state
}