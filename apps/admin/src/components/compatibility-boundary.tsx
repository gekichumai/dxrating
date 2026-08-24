import { Button, Center, Code, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { MessageKey } from '../i18n'
import { useAdminTranslation } from '../i18n'
import type { AdminCompatibilityController, AdminCompatibilityState } from '../data/compatibility'
import classes from './compatibility-boundary.module.css'

type BlockingCopy = {
  readonly description: MessageKey
  readonly title: MessageKey
}

const getBlockingCopy = (state: AdminCompatibilityState): BlockingCopy => {
  switch (state.status) {
    case 'blocking':
      return {
        description: 'compatibility.blocking.description',
        title: 'compatibility.blocking.title',
      }
    case 'reload_available':
      return {
        description: 'compatibility.reloadAvailable.description',
        title: 'compatibility.reloadAvailable.title',
      }
    case 'reloading':
      return {
        description: 'compatibility.reloading.description',
        title: 'compatibility.reloading.title',
      }
    case 'update_required':
      return {
        description: 'compatibility.updateRequired.description',
        title: 'compatibility.updateRequired.title',
      }
    case 'compatible':
    case 'unchecked':
      throw new Error('Compatible state has no blocking copy')
  }
}

export const AdminCompatibilityBoundary = ({
  children,
  controller,
}: {
  readonly children: ReactNode
  readonly controller: AdminCompatibilityController
}) => {
  const { t } = useAdminTranslation()
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const isBlocked = state.status !== 'unchecked' && state.status !== 'compatible'

  useEffect(() => {
    if (!isBlocked) return
    const copy = getBlockingCopy(state)
    document.title = `${t(copy.title)} · ${t('app.name')}`
    headingRef.current?.focus()
  }, [isBlocked, state, t])

  if (!isBlocked) return children

  const copy = getBlockingCopy(state)
  const isBusy = state.status === 'blocking' || state.status === 'reloading'
  return (
    <Center aria-busy={isBusy} className={classes.root} component="main">
      <Paper className={classes.card} p="xl" radius="lg" role="alert" shadow="sm">
        <Stack align="flex-start" gap="md">
          {isBusy ? <Loader aria-label={t(copy.title)} size="md" /> : null}
          <Title order={1} ref={headingRef} tabIndex={-1}>
            {t(copy.title)}
          </Title>
          <Text c="dimmed">{t(copy.description)}</Text>
          {state.mismatch.requestId ? (
            <Text size="sm">
              <Text component="span" fw={600}>
                {t('error.supportId')}:
              </Text>{' '}
              <Code style={{ fontVariantNumeric: 'tabular-nums' }}>{state.mismatch.requestId}</Code>
            </Text>
          ) : null}
          {state.status === 'reload_available' ? (
            <Button mih={40} onClick={controller.requestReload} size="md">
              {t('actions.reloadAdmin')}
            </Button>
          ) : null}
        </Stack>
      </Paper>
    </Center>
  )
}