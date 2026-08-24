import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { Outlet } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AdminRecentAuthProvider } from '../auth/admin-recent-auth'
import { translate } from '../i18n'

export const ProtectedAdminProviders = ({ children }: { readonly children?: ReactNode }) => (
  <>
    <Notifications limit={4} position="top-right" />
    <ModalsProvider
      labels={{
        confirm: translate('actions.confirm'),
        cancel: translate('actions.cancel'),
      }}
      modalProps={{ centered: true }}
    >
      <AdminRecentAuthProvider
        labels={{
          cancel: translate('actions.cancel'),
          description: translate('recentAuth.description'),
          googleSubmit: translate('recentAuth.googleSubmit'),
          or: translate('recentAuth.or'),
          passwordLabel: translate('signIn.password'),
          passwordSubmit: translate('recentAuth.passwordSubmit'),
          title: translate('recentAuth.title'),
        }}
      >
        {children ?? <Outlet />}
      </AdminRecentAuthProvider>
    </ModalsProvider>
  </>
)