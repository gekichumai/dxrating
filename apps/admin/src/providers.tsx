import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AdminAuthProvider, PENDING_ADMIN_AUTH, type AdminAuthSnapshot } from './auth/admin-auth-context'
import { AdminCompatibilityBoundary } from './components/compatibility-boundary'
import { AdminDataProvider } from './data/admin-data-context'
import { createAdminRuntime, type AdminRuntime } from './data/admin-runtime'
import { TranslationProvider, translate } from './i18n'
import { adminTheme } from './theme'

let productionRuntime: AdminRuntime | undefined

const getProductionRuntime = (): AdminRuntime => {
  productionRuntime ??= createAdminRuntime()
  return productionRuntime
}

export type AdminProvidersProps = {
  readonly auth?: AdminAuthSnapshot
  readonly children: ReactNode
  readonly runtime?: AdminRuntime
}

export const AdminProviders = ({
  auth = PENDING_ADMIN_AUTH,
  children,
  runtime = getProductionRuntime(),
}: AdminProvidersProps) => (
  <TranslationProvider>
    <MantineProvider defaultColorScheme="auto" theme={adminTheme}>
      <QueryClientProvider client={runtime.queryClient}>
        <AdminCompatibilityBoundary controller={runtime.compatibility}>
          <AdminDataProvider value={runtime.data}>
            <AdminAuthProvider value={auth}>
              <Notifications limit={4} position="top-right" />
              <ModalsProvider
                labels={{
                  confirm: translate('actions.confirm'),
                  cancel: translate('actions.cancel'),
                }}
                modalProps={{ centered: true }}
              >
                {children}
              </ModalsProvider>
            </AdminAuthProvider>
          </AdminDataProvider>
        </AdminCompatibilityBoundary>
      </QueryClientProvider>
    </MantineProvider>
  </TranslationProvider>
)