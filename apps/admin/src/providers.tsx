import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createAdminAuthClient, type AdminAuthClient } from './auth/admin-auth-client'
import { AdminAuthClientProvider, AdminAuthorizationProvider } from './auth/admin-authorization-provider'
import { AdminAuthProvider, PENDING_ADMIN_AUTH, type AdminAuthSnapshot } from './auth/admin-auth-context'
import { AdminSessionProvider } from './auth/admin-session-provider'
import { AdminCompatibilityBoundary } from './components/compatibility-boundary'
import { AdminDataProvider } from './data/admin-data-context'
import { createAdminRuntime, type AdminRuntime } from './data/admin-runtime'
import { TranslationProvider } from './i18n'
import { adminTheme } from './theme'

let productionRuntime: AdminRuntime | undefined
let productionAuthClient: AdminAuthClient | undefined

const getProductionRuntime = (): AdminRuntime => {
  productionRuntime ??= createAdminRuntime()
  return productionRuntime
}

const getProductionAuthClient = (): AdminAuthClient => {
  productionAuthClient ??= createAdminAuthClient()
  return productionAuthClient
}

export type AdminProvidersProps = {
  readonly authClient?: AdminAuthClient
  readonly auth?: AdminAuthSnapshot
  readonly authenticate?: boolean
  readonly children: ReactNode
  readonly runtime?: AdminRuntime
}

const StaticAdminAuthProviders = ({
  auth,
  authClient,
  children,
}: {
  readonly auth: AdminAuthSnapshot
  readonly authClient?: AdminAuthClient
  readonly children: ReactNode
}) => {
  const content = <AdminAuthProvider value={auth}>{children}</AdminAuthProvider>
  if (!authClient) return content

  return (
    <AdminAuthClientProvider value={authClient}>
      <AdminSessionProvider client={authClient}>{content}</AdminSessionProvider>
    </AdminAuthClientProvider>
  )
}

export const AdminProviders = ({
  authClient,
  auth = PENDING_ADMIN_AUTH,
  authenticate = false,
  children,
  runtime = getProductionRuntime(),
}: AdminProvidersProps) => (
  <TranslationProvider>
    <MantineProvider defaultColorScheme="auto" theme={adminTheme}>
      <QueryClientProvider client={runtime.queryClient}>
        <AdminCompatibilityBoundary controller={runtime.compatibility}>
          <AdminDataProvider value={runtime.data}>
            {authenticate ? (
              <AdminAuthorizationProvider authClient={authClient ?? getProductionAuthClient()} runtime={runtime}>
                {children}
              </AdminAuthorizationProvider>
            ) : (
              <StaticAdminAuthProviders auth={auth} authClient={authClient}>
                {children}
              </StaticAdminAuthProviders>
            )}
          </AdminDataProvider>
        </AdminCompatibilityBoundary>
      </QueryClientProvider>
    </MantineProvider>
  </TranslationProvider>
)