import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'
import { TranslationProvider, translate } from './i18n'
import { adminTheme } from './theme'

export const AdminProviders = ({ children }: { children: ReactNode }) => (
  <TranslationProvider>
    <MantineProvider defaultColorScheme="auto" theme={adminTheme}>
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
    </MantineProvider>
  </TranslationProvider>
)