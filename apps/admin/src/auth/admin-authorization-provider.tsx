import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { AdminRuntime } from '../data/admin-runtime'
import { adminBootstrapQueryOptions } from '../data/query-options'
import type { AdminAuthClient } from './admin-auth-client'
import { AdminAuthProvider, type AdminAuthActions } from './admin-auth-context'
import { AdminSessionProvider, useAdminSession } from './admin-session-provider'

const AdminAuthClientContext = createContext<AdminAuthClient | undefined>(undefined)

export const AdminAuthClientProvider = ({
  children,
  value,
}: {
  readonly children: ReactNode
  readonly value: AdminAuthClient
}) => <AdminAuthClientContext.Provider value={value}>{children}</AdminAuthClientContext.Provider>

export const useAdminAuthClient = (): AdminAuthClient => {
  const value = useContext(AdminAuthClientContext)
  if (!value) throw new Error('useAdminAuthClient must be used inside AdminAuthorizationProvider')
  return value
}

const AuthorizationBridge = ({
  authClient,
  children,
  runtime,
}: {
  readonly authClient: AdminAuthClient
  readonly children: ReactNode
  readonly runtime: AdminRuntime
}) => {
  const session = useAdminSession()
  const queryClient = useQueryClient()
  const auth = useSyncExternalStore(runtime.auth.subscribe, runtime.auth.getState, runtime.auth.getState)
  const bootstrapOptions = useMemo(() => adminBootstrapQueryOptions(runtime.data), [runtime.data])
  const activeBootstrapCheck = useRef<number | undefined>(undefined)
  const lastAppliedBootstrap = useRef(0)
  const lastSessionKey = useRef<string | undefined>(undefined)
  const replacingSessionKey = useRef<string | undefined>(undefined)
  const sessionTransition = useRef(0)
  const signOutOperation = useRef<Promise<void> | undefined>(undefined)

  const bootstrap = useQuery({
    ...bootstrapOptions,
    enabled: session.status === 'authenticated' && auth.status === 'authenticated',
  })

  const verifyAuthorization = useCallback(
    async (checkId: number) => {
      if (activeBootstrapCheck.current === checkId) return
      activeBootstrapCheck.current = checkId

      try {
        const output = await queryClient.fetchQuery({ ...bootstrapOptions, staleTime: 0 })
        if (runtime.auth.markAuthenticated(output.principal, checkId)) {
          lastAppliedBootstrap.current =
            queryClient.getQueryState(bootstrapOptions.queryKey)?.dataUpdatedAt ?? Date.now()
        }
      } catch (error) {
        runtime.auth.handleBootstrapError(error, checkId)
      } finally {
        if (activeBootstrapCheck.current === checkId) activeBootstrapCheck.current = undefined
      }
    },
    [bootstrapOptions, queryClient, runtime.auth],
  )

  useEffect(() => {
    const current = runtime.auth.getState()

    if (session.status === 'pending') return
    if (session.status === 'unavailable') {
      sessionTransition.current += 1
      replacingSessionKey.current = undefined
      const checkId = current.status === 'pending' && current.phase === 'session' ? current.checkId : undefined
      if (session.failure.kind === 'session-expired') {
        lastSessionKey.current = undefined
        if (
          current.status !== 'unauthenticated' &&
          !(current.status === 'clearing' && current.destination === 'unauthenticated')
        ) {
          void runtime.auth.handleSessionMissing(checkId)
        }
      } else if (!(current.status === 'unavailable' && current.source === 'session')) {
        runtime.auth.markUnavailable('session', checkId)
      }
      return
    }
    if (session.status === 'unauthenticated') {
      sessionTransition.current += 1
      replacingSessionKey.current = undefined
      lastSessionKey.current = undefined
      const checkId = current.status === 'pending' && current.phase === 'session' ? current.checkId : undefined
      if (
        current.status !== 'unauthenticated' &&
        !(current.status === 'clearing' && current.destination === 'unauthenticated')
      ) {
        void runtime.auth.handleSessionMissing(checkId)
      }
      return
    }

    const sessionKey = `${session.identity.sessionId}:${session.identity.user.id}`
    const previousSessionKey = lastSessionKey.current
    const changedSession = previousSessionKey !== sessionKey
    lastSessionKey.current = sessionKey

    if (changedSession) sessionTransition.current += 1

    if (previousSessionKey !== undefined && changedSession) {
      const transition = sessionTransition.current
      replacingSessionKey.current = sessionKey
      void (async () => {
        await runtime.auth.handleSessionMissing()
        if (sessionTransition.current !== transition || lastSessionKey.current !== sessionKey) return

        const checkId = runtime.auth.beginAuthorizationCheck()
        replacingSessionKey.current = undefined
        if (checkId !== undefined) await verifyAuthorization(checkId)
      })()
      return
    }

    if (replacingSessionKey.current === sessionKey) return

    if (
      changedSession ||
      (current.status === 'pending' && current.phase === 'session') ||
      (current.status === 'unavailable' && current.source === 'session')
    ) {
      const checkId = runtime.auth.beginAuthorizationCheck()
      if (checkId !== undefined) void verifyAuthorization(checkId)
      return
    }

    if (current.status === 'pending' && current.phase === 'authorization') {
      void verifyAuthorization(current.checkId)
    }
  }, [auth, runtime.auth, session, verifyAuthorization])

  useEffect(() => {
    if (auth.status !== 'authenticated' || !bootstrap.data || bootstrap.dataUpdatedAt <= lastAppliedBootstrap.current) {
      return
    }

    const checkId = runtime.auth.beginAuthorizationCheck()
    if (checkId !== undefined && runtime.auth.markAuthenticated(bootstrap.data.principal, checkId)) {
      lastAppliedBootstrap.current = bootstrap.dataUpdatedAt
    }
  }, [auth.status, bootstrap.data, bootstrap.dataUpdatedAt, runtime.auth])

  const signOut = useCallback(async () => {
    if (signOutOperation.current) return signOutOperation.current

    const operation = (async () => {
      await runtime.auth.beginSignOut()
      try {
        const result = await authClient.signOut()
        if (result.ok) runtime.auth.completeSignOut()
        else runtime.auth.failSignOut()
      } catch {
        runtime.auth.failSignOut()
      }
    })()
    signOutOperation.current = operation.finally(() => {
      signOutOperation.current = undefined
    })
    return signOutOperation.current
  }, [authClient, runtime.auth])

  const retry = useCallback(async () => {
    const current = runtime.auth.getState()
    if (current.status === 'unavailable' && current.source === 'sign-out') {
      await signOut()
      return
    }

    if (current.status === 'unavailable' && current.source === 'authorization') {
      const authorizationCheckId = runtime.auth.beginAuthorizationCheck()
      if (authorizationCheckId !== undefined) await verifyAuthorization(authorizationCheckId)
      return
    }

    const sessionCheckId = runtime.auth.beginSessionCheck()
    if (sessionCheckId === undefined) return
    try {
      await session.refetch()
    } catch {
      runtime.auth.markUnavailable('session', sessionCheckId)
    }
  }, [runtime.auth, session, signOut, verifyAuthorization])

  const actions = useMemo<AdminAuthActions>(
    () => ({ reportFeatureError: runtime.auth.handleFeatureError, retry, signOut }),
    [retry, runtime.auth.handleFeatureError, signOut],
  )

  return (
    <AdminAuthProvider actions={actions} value={auth}>
      {children}
    </AdminAuthProvider>
  )
}

export const AdminAuthorizationProvider = ({
  authClient,
  children,
  runtime,
}: {
  readonly authClient: AdminAuthClient
  readonly children: ReactNode
  readonly runtime: AdminRuntime
}) => (
  <AdminAuthClientProvider value={authClient}>
    <AdminSessionProvider client={authClient}>
      <AuthorizationBridge authClient={authClient} runtime={runtime}>
        {children}
      </AuthorizationBridge>
    </AdminSessionProvider>
  </AdminAuthClientProvider>
)