import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Badge, Code, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { userModerationDetailQueryOptions } from '../data/query-options'
import classes from './user-read-model.module.css'

type UserModerationDetail = AdminContractOutputs['getUserModerationDetail']
type UserBanState = UserModerationDetail['banState']

export type UserModerationSummaryLabels = {
  readonly title: string
  readonly loading: string
  readonly displayName: string
  readonly userId: string
  readonly email: string
  readonly emailVerification: string
  readonly effectiveRole: string
  readonly verified: string
  readonly unverified: string
  readonly roles: {
    readonly user: string
    readonly admin: string
    readonly superAdmin: string
  }
  readonly currentBan: string
  readonly banStatus: string
  readonly banStatuses: {
    readonly unbanned: string
    readonly expired: string
    readonly temporary: string
    readonly permanent: string
  }
  readonly noActiveBan: string
  readonly reason: string
  readonly actorUserId: string
  readonly banStartedAt: string
  readonly expiresAt: string
  readonly evaluatedAt: string
  readonly dateTime: AdminDateTimeLabels
}

export type UserModerationSummaryProps = {
  readonly labels: UserModerationSummaryLabels
  readonly locale: string
  readonly userId: string
}

const statusColor = (status: UserBanState['status']): string => {
  switch (status) {
    case 'temporary':
      return 'orange'
    case 'permanent':
      return 'red'
    case 'expired':
      return 'gray'
    case 'unbanned':
      return 'green'
  }
}

const roleLabel = (
  role: UserModerationDetail['effectiveRole'],
  labels: UserModerationSummaryLabels['roles'],
): string => {
  switch (role) {
    case 'user':
      return labels.user
    case 'admin':
      return labels.admin
    case 'super_admin':
      return labels.superAdmin
  }
}

const CurrentBanState = ({
  labels,
  locale,
  state,
}: {
  readonly labels: UserModerationSummaryLabels
  readonly locale: string
  readonly state: UserBanState
}) => {
  const statusLabel = labels.banStatuses[state.status]

  return (
    <Paper bg="var(--mantine-color-default-hover)" p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group align="center" gap="sm" justify="space-between" wrap="wrap">
          <Text fw={600}>{labels.currentBan}</Text>
          <Badge color={statusColor(state.status)} variant="light">
            {statusLabel}
          </Badge>
        </Group>
        {state.status === 'unbanned' ? <Text size="sm">{labels.noActiveBan}</Text> : null}
        <dl className={classes.descriptionList}>
          <dt>{labels.banStatus}</dt>
          <dd>{statusLabel}</dd>
          {state.status === 'unbanned' ? null : (
            <>
              <dt>{labels.reason}</dt>
              <dd>{state.reason}</dd>
              <dt>{labels.actorUserId}</dt>
              <dd>
                <Code className={classes.identifier}>{state.actorUserId}</Code>
              </dd>
              <dt>{labels.banStartedAt}</dt>
              <dd>
                <AdminDateTime labels={labels.dateTime} locale={locale} value={state.banStartedAt} />
              </dd>
              {state.expiresAt ? (
                <>
                  <dt>{labels.expiresAt}</dt>
                  <dd>
                    <AdminDateTime labels={labels.dateTime} locale={locale} value={state.expiresAt} />
                  </dd>
                </>
              ) : null}
            </>
          )}
          <dt>{labels.evaluatedAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={state.evaluatedAt} />
          </dd>
        </dl>
      </Stack>
    </Paper>
  )
}

export const UserModerationSummary = ({ labels, locale, userId }: UserModerationSummaryProps) => {
  const data = useAdminData()
  const query = useQuery(userModerationDetailQueryOptions(data, userId))
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
            <Skeleton height={22} radius="sm" />
            <Skeleton height={118} radius="md" />
          </Stack>
        ) : query.error ? (
          <AdminErrorNotice
            error={query.error}
            onRefresh={() => void query.refetch()}
            onRetry={() => void query.refetch()}
          />
        ) : query.data ? (
          <Stack gap="lg">
            <dl className={classes.descriptionList}>
              <dt>{labels.displayName}</dt>
              <dd>{query.data.displayName}</dd>
              <dt>{labels.userId}</dt>
              <dd>
                <Code className={classes.identifier}>{query.data.userId}</Code>
              </dd>
              <dt>{labels.email}</dt>
              <dd>{query.data.email}</dd>
              <dt>{labels.emailVerification}</dt>
              <dd>
                <Badge color={query.data.emailVerified ? 'green' : 'gray'} variant="light">
                  {query.data.emailVerified ? labels.verified : labels.unverified}
                </Badge>
              </dd>
              <dt>{labels.effectiveRole}</dt>
              <dd>{roleLabel(query.data.effectiveRole, labels.roles)}</dd>
            </dl>
            <CurrentBanState labels={labels} locale={locale} state={query.data.banState} />
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  )
}