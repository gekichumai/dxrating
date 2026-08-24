import { Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useAdminTranslation } from '../i18n'
import classes from './operational-refresh.module.css'

export type ManualRefreshResult = { readonly isError: boolean } | { readonly status: 'success' | 'error' }

export type OperationalRefreshProps = {
  readonly dataUpdatedAt: number
  readonly isFetching: boolean
  readonly onRefresh: () => Promise<ManualRefreshResult>
}

type RefreshAnnouncement = 'idle' | 'refreshing' | 'success' | 'error'

export const OperationalRefresh = ({ dataUpdatedAt, isFetching, onRefresh }: OperationalRefreshProps) => {
  const { locale, t } = useAdminTranslation()
  const [announcement, setAnnouncement] = useState<RefreshAnnouncement>('idle')
  const observedDataUpdatedAt = useRef(dataUpdatedAt)
  const isRefreshing = isFetching || announcement === 'refreshing'
  const lastUpdated = Number.isFinite(dataUpdatedAt) && dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null

  useEffect(() => {
    if (dataUpdatedAt > observedDataUpdatedAt.current) {
      setAnnouncement((current) => (current === 'error' ? 'idle' : current))
    }
    observedDataUpdatedAt.current = dataUpdatedAt
  }, [dataUpdatedAt])

  const refresh = async () => {
    setAnnouncement('refreshing')
    try {
      const result = await onRefresh()
      const failed = 'isError' in result ? result.isError : result.status === 'error'
      setAnnouncement(failed ? 'error' : 'success')
    } catch {
      setAnnouncement('error')
    }
  }

  const announcementText =
    announcement === 'refreshing'
      ? t('operationalRefresh.refreshing')
      : announcement === 'success'
        ? t('operationalRefresh.refreshed')
        : announcement === 'error'
          ? t('operationalRefresh.failed')
          : ''

  return (
    <Stack align="flex-end" gap={4}>
      <Group gap="sm" justify="flex-end" wrap="wrap">
        <Text c="dimmed" size="sm">
          {lastUpdated ? (
            <time className={classes.timestamp} dateTime={lastUpdated.toISOString()}>
              {t('operationalRefresh.lastUpdated', {
                timestamp: new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                }).format(lastUpdated),
              })}
            </time>
          ) : (
            t('operationalRefresh.neverUpdated')
          )}
        </Text>
        <Button loading={isRefreshing} mih={40} onClick={() => void refresh()} size="sm" variant="default">
          {t('actions.refresh')}
        </Button>
      </Group>
      <Text aria-live="polite" c={announcement === 'error' ? 'red' : 'dimmed'} component="output" size="sm">
        {announcementText}
      </Text>
    </Stack>
  )
}