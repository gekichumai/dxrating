import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { userBanHistoryQueryOptions } from '../data/query-options'
import classes from './user-read-model.module.css'

type UserBanHistoryEvent = AdminContractOutputs['listUserBanHistory']['items'][number]

export type UserBanHistoryLabels = {
  readonly title: string
  readonly loading: string
  readonly empty: string
  readonly temporaryBan: string
  readonly permanentBan: string
  readonly unban: string
  readonly reason: string
  readonly noReason: string
  readonly actorUserId: string
  readonly occurredAt: string
  readonly banStartedAt: string
  readonly expiresAt: string
  readonly backToNewest: string
  readonly older: string
  readonly dateTime: AdminDateTimeLabels
}

export type UserBanHistoryProps = {
  readonly cursor?: string
  readonly labels: UserBanHistoryLabels
  readonly limit?: number
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
  readonly userId: string
}

const eventPresentation = (event: UserBanHistoryEvent, labels: UserBanHistoryLabels) => {
  if (event.action === 'unban') return { color: 'green', label: labels.unban }
  if (event.kind === 'temporary') return { color: 'orange', label: labels.temporaryBan }
  return { color: 'red', label: labels.permanentBan }
}

const BanHistoryItem = ({
  event,
  labels,
  locale,
}: {
  readonly event: UserBanHistoryEvent
  readonly labels: UserBanHistoryLabels
  readonly locale: string
}) => {
  const presentation = eventPresentation(event, labels)

  return (
    <Paper className={classes.item} component="li" p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group gap="sm" justify="space-between" wrap="wrap">
          <Badge color={presentation.color} variant="light">
            {presentation.label}
          </Badge>
          <Code className={classes.identifier}>#{event.id}</Code>
        </Group>
        <dl className={classes.descriptionList}>
          <dt>{labels.reason}</dt>
          <dd>{event.reason ?? labels.noReason}</dd>
          <dt>{labels.actorUserId}</dt>
          <dd>
            <Code className={classes.identifier}>{event.actorUserId}</Code>
          </dd>
          <dt>{labels.occurredAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={event.createdAt} />
          </dd>
          {event.action === 'ban' ? (
            <>
              <dt>{labels.banStartedAt}</dt>
              <dd>
                <AdminDateTime labels={labels.dateTime} locale={locale} value={event.banStartedAt} />
              </dd>
              {event.expiresAt ? (
                <>
                  <dt>{labels.expiresAt}</dt>
                  <dd>
                    <AdminDateTime labels={labels.dateTime} locale={locale} value={event.expiresAt} />
                  </dd>
                </>
              ) : null}
            </>
          ) : null}
        </dl>
      </Stack>
    </Paper>
  )
}

export const UserBanHistory = ({ cursor, labels, limit, locale, onCursorChange, userId }: UserBanHistoryProps) => {
  const data = useAdminData()
  const parameters = {
    ...(cursor ? { cursor } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
  const query = useQuery(userBanHistoryQueryOptions(data, userId, parameters))
  const titleId = useId()

  return (
    <Paper
      aria-busy={query.isPending}
      aria-labelledby={titleId}
      className={classes.panel}
      component="section"
      p="lg"
      withBorder
    >
      <Stack gap="lg">
        <Title id={titleId} order={2} size="h3">
          {labels.title}
        </Title>
        {query.isPending ? (
          <Stack aria-live="polite" component="output" gap="sm">
            <Text size="sm">{labels.loading}</Text>
            <Skeleton height={104} radius="md" />
            <Skeleton height={104} radius="md" />
          </Stack>
        ) : query.error ? (
          <AdminErrorNotice
            error={query.error}
            onRefresh={() => (cursor ? onCursorChange(undefined) : void query.refetch())}
            onRetry={() => void query.refetch()}
          />
        ) : query.data ? (
          <Stack gap="md">
            {query.data.items.length === 0 ? (
              <Text c="dimmed" size="sm">
                {labels.empty}
              </Text>
            ) : (
              <ol className={classes.itemList}>
                {query.data.items.map((event) => (
                  <BanHistoryItem event={event} key={event.id} labels={labels} locale={locale} />
                ))}
              </ol>
            )}
            {cursor || query.data.nextCursor ? (
              <Group gap="sm" justify="flex-end" wrap="wrap">
                {cursor ? (
                  <Button onClick={() => onCursorChange(undefined)} variant="default">
                    {labels.backToNewest}
                  </Button>
                ) : null}
                {query.data.nextCursor ? (
                  <Button onClick={() => onCursorChange(query.data.nextCursor ?? undefined)} variant="default">
                    {labels.older}
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  )
}