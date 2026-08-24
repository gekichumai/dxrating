import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { administratorRoleHistoryQueryOptions } from '../data/query-options'
import classes from './administrator-role-history.module.css'

type AdministratorRoleHistoryEvent = AdminContractOutputs['listAdministratorRoleHistory']['items'][number]

export type AdministratorRoleHistoryLabels = {
  readonly title: string
  readonly selectSubject: string
  readonly loading: string
  readonly empty: string
  readonly chronology: string
  readonly subjectUserId: string
  readonly grant: string
  readonly revoke: string
  readonly actorUserId: string
  readonly reason: string
  readonly changedAt: string
  readonly backToNewest: string
  readonly older: string
  readonly dateTime: AdminDateTimeLabels
}

export type AdministratorRoleHistoryProps = {
  readonly cursor?: string
  readonly labels: AdministratorRoleHistoryLabels
  readonly limit?: number
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
  readonly userId?: string
}

const RoleHistoryItem = ({
  event,
  labels,
  locale,
}: {
  readonly event: AdministratorRoleHistoryEvent
  readonly labels: AdministratorRoleHistoryLabels
  readonly locale: string
}) => {
  const granted = event.newRole === 'admin'

  return (
    <Paper className={classes.item} component="li" p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group gap="sm" justify="space-between" wrap="wrap">
          <Badge color={granted ? 'indigo' : 'orange'} variant="light">
            {granted ? labels.grant : labels.revoke}
          </Badge>
          <Code className={classes.identifier}>#{event.id}</Code>
        </Group>
        <dl className={classes.descriptionList}>
          <dt>{labels.actorUserId}</dt>
          <dd>
            <Code className={classes.identifier}>{event.actorUserId}</Code>
          </dd>
          <dt>{labels.reason}</dt>
          <dd>{event.reason}</dd>
          <dt>{labels.changedAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={event.changedAt} />
          </dd>
        </dl>
      </Stack>
    </Paper>
  )
}

const LoadedAdministratorRoleHistory = ({
  cursor,
  labels,
  limit,
  locale,
  onCursorChange,
  userId,
}: Omit<AdministratorRoleHistoryProps, 'userId'> & { readonly userId: string }) => {
  const data = useAdminData()
  const parameters = {
    ...(cursor ? { cursor } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
  const query = useQuery(administratorRoleHistoryQueryOptions(data, userId, parameters))

  if (query.isPending) {
    return (
      <Stack aria-live="polite" component="output" gap="sm">
        <Text size="sm">{labels.loading}</Text>
        <Skeleton height={112} radius="md" />
        <Skeleton height={112} radius="md" />
      </Stack>
    )
  }

  if (query.error) {
    return (
      <AdminErrorNotice
        error={query.error}
        onRefresh={() => (cursor ? onCursorChange(undefined) : void query.refetch())}
        onRetry={() => void query.refetch()}
      />
    )
  }

  if (!query.data) return null

  return (
    <Stack gap="md">
      {query.data.items.length === 0 ? (
        <Text c="dimmed" size="sm">
          {labels.empty}
        </Text>
      ) : (
        <ol className={classes.itemList}>
          {query.data.items.map((event) => (
            <RoleHistoryItem event={event} key={event.id} labels={labels} locale={locale} />
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
  )
}

export const AdministratorRoleHistory = ({
  cursor,
  labels,
  limit,
  locale,
  onCursorChange,
  userId,
}: AdministratorRoleHistoryProps) => {
  const titleId = useId()

  return (
    <Paper
      aria-labelledby={titleId}
      className={classes.panel}
      component="section"
      p="lg"
      radius="lg"
      shadow="xs"
      withBorder
    >
      <Stack gap="lg">
        <Stack gap={4}>
          <Title id={titleId} order={2} size="h3">
            {labels.title}
          </Title>
          <Text c="dimmed" size="sm">
            {labels.chronology}
          </Text>
          {userId ? (
            <Group gap="xs" mt="xs" wrap="wrap">
              <Text component="span" fw={600} size="sm">
                {labels.subjectUserId}:
              </Text>
              <Code className={classes.identifier}>{userId}</Code>
            </Group>
          ) : null}
        </Stack>

        {userId ? (
          <LoadedAdministratorRoleHistory
            cursor={cursor}
            labels={labels}
            limit={limit}
            locale={locale}
            onCursorChange={onCursorChange}
            userId={userId}
          />
        ) : (
          <Text c="dimmed" size="sm">
            {labels.selectSubject}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}