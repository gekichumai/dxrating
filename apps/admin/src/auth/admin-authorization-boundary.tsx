import { Button, Center, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconLock, IconRefresh, IconShieldOff } from '@tabler/icons-react'
import { Navigate, Outlet } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'
import { useAdminTranslation } from '../i18n'
import { useAdminAuth, useAdminAuthActions } from './admin-auth-context'
import classes from './admin-authorization-boundary.module.css'

const AccessState = ({
  description,
  icon,
  title,
  actions,
}: {
  readonly actions?: ReactNode
  readonly description: string
  readonly icon: ReactNode
  readonly title: string
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [title])

  return (
    <Center component="main" className={classes.page}>
      <Paper className={classes.card} p="xl" radius="lg">
        <Stack gap="lg">
          {icon}
          <Stack gap={6}>
            <Title order={1} ref={headingRef} tabIndex={-1}>
              {title}
            </Title>
            <Text c="dimmed">{description}</Text>
          </Stack>
          {actions}
        </Stack>
      </Paper>
    </Center>
  )
}

export const AdminAuthorizationBoundary = () => {
  const auth = useAdminAuth()
  const actions = useAdminAuthActions()
  const { t } = useAdminTranslation()

  if (auth.status === 'authenticated') return <Outlet />
  if (auth.status === 'unauthenticated') return <Navigate replace to="/sign-in" />

  if (auth.status === 'pending' || auth.status === 'clearing' || auth.status === 'signing-out') {
    return (
      <AccessState
        description={t(
          auth.status === 'clearing'
            ? 'auth.clearing.description'
            : auth.status === 'signing-out'
              ? 'auth.signingOut.description'
              : 'auth.pending.description',
        )}
        icon={<Loader aria-label={t('loading.label')} size="lg" />}
        title={t(
          auth.status === 'clearing'
            ? 'auth.clearing.title'
            : auth.status === 'signing-out'
              ? 'auth.signingOut.title'
              : 'auth.pending.title',
        )}
      />
    )
  }

  if (auth.status === 'forbidden') {
    return (
      <AccessState
        actions={
          <Button leftSection={<IconLock aria-hidden="true" size={18} />} onClick={() => void actions.signOut()}>
            {t('actions.useAnotherAccount')}
          </Button>
        }
        description={t('auth.forbidden.description')}
        icon={<IconShieldOff aria-hidden="true" color="var(--mantine-color-red-6)" size={36} />}
        title={t('auth.forbidden.title')}
      />
    )
  }

  if (auth.status === 'fresh-login-required') {
    return (
      <AccessState
        actions={
          <Button leftSection={<IconLock aria-hidden="true" size={18} />} onClick={() => void actions.signOut()}>
            {t('actions.signInAgain')}
          </Button>
        }
        description={t('error.freshLoginRequired.description')}
        icon={<IconAlertTriangle aria-hidden="true" color="var(--mantine-color-orange-6)" size={36} />}
        title={t('error.freshLoginRequired.title')}
      />
    )
  }

  return (
    <AccessState
      actions={
        <Group>
          <Button leftSection={<IconRefresh aria-hidden="true" size={18} />} onClick={() => void actions.retry()}>
            {t('actions.retry')}
          </Button>
          <Button onClick={() => void actions.signOut()} variant="default">
            {t('actions.useAnotherAccount')}
          </Button>
        </Group>
      }
      description={t(
        auth.source === 'sign-out' ? 'auth.signOutUnavailable.description' : 'auth.unavailable.description',
      )}
      icon={<IconAlertTriangle aria-hidden="true" color="var(--mantine-color-orange-6)" size={36} />}
      title={t(auth.source === 'sign-out' ? 'auth.signOutUnavailable.title' : 'auth.unavailable.title')}
    />
  )
}