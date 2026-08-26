import { modals, ModalsProvider } from '@mantine/modals'
import { notifications, Notifications } from '@mantine/notifications'
import { Outlet } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { AdminRecentAuthProvider } from '../auth/admin-recent-auth'
import { translate } from '../i18n'

const ProtectedOverlayLifecycle = ({ children }: { readonly children: ReactNode }) => {
  useEffect(
    () => () => {
      // The overlay hosts live once at the protected workspace root, but their content
      // can contain protected identities and action details. Clear queued work
      // first so removing visible notifications cannot promote stale content.
      notifications.cleanQueue()
      notifications.clean()
      modals.closeAll()
    },
    [],
  )

  return children
}

export const ProtectedAdminProviders = ({ children }: { readonly children?: ReactNode }) => (
  <ProtectedOverlayLifecycle>
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
  </ProtectedOverlayLifecycle>
)