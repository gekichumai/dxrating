import { Button, Center, Container, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useAdminTranslation } from '../i18n'
import classes from './route-states.module.css'

export const RouteLoading = () => {
  const { t } = useAdminTranslation()
  return (
    <Container aria-label={t('loading.label')} className={classes.loading} component="output" fluid size="xl">
      <Skeleton height={24} radius="md" width="38%" />
      <Skeleton height={112} radius="lg" />
      <Group grow>
        <Skeleton height={88} radius="lg" />
        <Skeleton height={88} radius="lg" />
      </Group>
    </Container>
  )
}

const RecoveryState = ({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry?: () => void
}) => {
  const { t } = useAdminTranslation()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`
    headingRef.current?.focus()
  }, [t, title])

  return (
    <Center component="main" className={classes.recovery}>
      <Paper className={classes.recoveryCard} p="xl" radius="lg" shadow="sm">
        <Stack align="flex-start" gap="md">
          <Title order={1} ref={headingRef} tabIndex={-1}>
            {title}
          </Title>
          <Text c="dimmed">{description}</Text>
          <Group wrap="wrap">
            {onRetry ? (
              <Button onClick={onRetry} size="md">
                {t('actions.retry')}
              </Button>
            ) : null}
            <Button component="a" href="/" size="md" variant={onRetry ? 'default' : 'filled'}>
              {t('actions.backToDashboard')}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  )
}

export const AdminNotFound = () => {
  const { t } = useAdminTranslation()
  return <RecoveryState description={t('notFound.description')} title={t('notFound.title')} />
}

export const AdminRouteError = ({ reset }: ErrorComponentProps) => {
  const { t } = useAdminTranslation()
  return <RecoveryState description={t('routeError.description')} onRetry={reset} title={t('routeError.title')} />
}