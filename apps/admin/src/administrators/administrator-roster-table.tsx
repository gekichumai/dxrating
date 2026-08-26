import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Table, Text, ThemeIcon } from '@mantine/core'
import {
  IconCheck,
  IconClock,
  IconHistory,
  IconLock,
  IconSearchOff,
  IconSettings,
  IconShield,
  IconShieldLock,
  IconUserMinus,
  IconX,
} from '@tabler/icons-react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import classes from './administrator-roster-table.module.css'

export type AdministratorRosterRow = AdminContractOutputs['listAdministrators']['items'][number]

export type AdministratorRosterTableLabels = {
  readonly caption: string
  readonly tableRegion: string
  readonly loading: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly columns: {
    readonly identity: string
    readonly email: string
    readonly accountStatus: string
    readonly roleAndSource: string
    readonly actions: string
  }
  readonly userId: string
  readonly email: {
    readonly verified: string
    readonly notVerified: string
  }
  readonly roles: {
    readonly administrator: string
    readonly superAdministrator: string
  }
  readonly sources: {
    readonly database: string
    readonly deployment: string
    readonly databaseDescription: string
    readonly deploymentDescription: string
    readonly immutable: string
  }
  readonly statuses: {
    readonly active: string
    readonly temporarilyBanned: string
    readonly permanentlyBanned: string
    readonly expiresAt: string
  }
  readonly openHistory: string
  readonly revoke: string
  readonly dateTime: AdminDateTimeLabels
}

type AdministratorRosterTableBaseProps = {
  readonly labels: AdministratorRosterTableLabels
  readonly loading?: boolean
  readonly locale: string
  readonly onOpenRoleHistory: (userId: string) => void
  readonly rows: readonly AdministratorRosterRow[]
}

type AdministratorRosterReadOnlyProps = {
  readonly canManageAdministrators: false
  readonly onRequestRevoke?: never
}

type AdministratorRosterManagementProps = {
  readonly canManageAdministrators: true
  readonly onRequestRevoke: (administrator: AdministratorRosterRow) => void
}

export type AdministratorRosterTableProps = AdministratorRosterTableBaseProps &
  (AdministratorRosterReadOnlyProps | AdministratorRosterManagementProps)

const AccountStatus = ({
  labels,
  locale,
  status,
}: {
  readonly labels: AdministratorRosterTableLabels
  readonly locale: string
  readonly status: AdministratorRosterRow['accountStatus']
}) => {
  if (status.status === 'active') {
    return (
      <Badge color="teal" variant="light">
        {labels.statuses.active}
      </Badge>
    )
  }

  if (status.status === 'permanently_banned') {
    return (
      <Badge color="red" leftSection={<IconLock aria-hidden="true" size={12} />} variant="light">
        {labels.statuses.permanentlyBanned}
      </Badge>
    )
  }

  return (
    <Stack gap={6}>
      <Badge color="orange" leftSection={<IconClock aria-hidden="true" size={12} />} variant="light">
        {labels.statuses.temporarilyBanned}
      </Badge>
      <Stack gap={3}>
        <Text c="dimmed" size="xs">
          {labels.statuses.expiresAt}
        </Text>
        <AdminDateTime labels={labels.dateTime} locale={locale} value={status.expiresAt} />
      </Stack>
    </Stack>
  )
}

const RoleAndSource = ({
  administrator,
  labels,
}: {
  readonly administrator: AdministratorRosterRow
  readonly labels: AdministratorRosterTableLabels
}) => {
  if (administrator.effectiveRole === 'super_admin') {
    return (
      <Stack gap={7}>
        <Group gap={6} wrap="wrap">
          <Badge color="violet" leftSection={<IconShieldLock aria-hidden="true" size={12} />} variant="light">
            {labels.roles.superAdministrator}
          </Badge>
          <Badge color="gray" variant="outline">
            {labels.sources.immutable}
          </Badge>
        </Group>
        <Group gap={6} wrap="nowrap">
          <IconSettings aria-hidden="true" color="var(--mantine-color-gray-6)" size={15} />
          <Text fw={600} size="sm">
            {labels.sources.deployment}
          </Text>
        </Group>
        <Text c="dimmed" className={classes.explanation} size="xs">
          {labels.sources.deploymentDescription}
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap={7}>
      <Badge color="indigo" leftSection={<IconShield aria-hidden="true" size={12} />} variant="light" w="fit-content">
        {labels.roles.administrator}
      </Badge>
      <Text fw={600} size="sm">
        {labels.sources.database}
      </Text>
      <Text c="dimmed" className={classes.explanation} size="xs">
        {labels.sources.databaseDescription}
      </Text>
    </Stack>
  )
}

export const AdministratorRosterTable = (props: AdministratorRosterTableProps) => {
  const { labels, loading = false, locale, onOpenRoleHistory, rows } = props

  if (loading && rows.length === 0) {
    return (
      <Paper aria-live="polite" component="output" p="lg" radius="lg" withBorder>
        <Stack gap="sm">
          <Text size="sm">{labels.loading}</Text>
          <Skeleton height={48} radius="sm" />
          <Skeleton height={48} radius="sm" />
          <Skeleton height={48} radius="sm" />
        </Stack>
      </Paper>
    )
  }

  if (rows.length === 0) {
    return (
      <Paper component="section" p="xl" radius="lg" ta="center" withBorder>
        <Stack align="center" gap="xs">
          <ThemeIcon color="gray" radius="xl" size="xl" variant="light">
            <IconSearchOff aria-hidden="true" size={22} />
          </ThemeIcon>
          <Text fw={650}>{labels.emptyTitle}</Text>
          <Text c="dimmed" maw={520} size="sm">
            {labels.emptyDescription}
          </Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper component="section" radius="lg" shadow="xs" withBorder>
      <Table.ScrollContainer
        aria-label={labels.tableRegion}
        className={classes.scrollRegion}
        component="section"
        minWidth={1_120}
        tabIndex={0}
        type="native"
      >
        <Table aria-busy={loading} highlightOnHover horizontalSpacing="md" striped verticalSpacing="sm">
          <Table.Caption>{labels.caption}</Table.Caption>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{labels.columns.identity}</Table.Th>
              <Table.Th>{labels.columns.email}</Table.Th>
              <Table.Th>{labels.columns.accountStatus}</Table.Th>
              <Table.Th>{labels.columns.roleAndSource}</Table.Th>
              <Table.Th>{labels.columns.actions}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((administrator) => (
              <Table.Tr key={administrator.userId}>
                <Table.Td>
                  <Stack gap={5}>
                    <Text fw={650}>{administrator.displayName}</Text>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.userId}
                      </Text>
                      <Code className={classes.identifier}>{administrator.userId}</Code>
                    </Group>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Stack gap={5}>
                    <Text className={classes.email} size="sm">
                      {administrator.email}
                    </Text>
                    <Group gap={5} wrap="nowrap">
                      {administrator.emailVerified ? (
                        <IconCheck aria-hidden="true" color="var(--mantine-color-teal-6)" size={15} />
                      ) : (
                        <IconX aria-hidden="true" color="var(--mantine-color-gray-6)" size={15} />
                      )}
                      <Text c="dimmed" size="xs">
                        {administrator.emailVerified ? labels.email.verified : labels.email.notVerified}
                      </Text>
                    </Group>
                  </Stack>
                </Table.Td>
                <Table.Td className={classes.status}>
                  <AccountStatus labels={labels} locale={locale} status={administrator.accountStatus} />
                </Table.Td>
                <Table.Td>
                  <RoleAndSource administrator={administrator} labels={labels} />
                </Table.Td>
                <Table.Td>
                  <Stack align="flex-start" gap="xs">
                    <Button
                      aria-label={`${labels.openHistory}: ${administrator.displayName}`}
                      leftSection={<IconHistory aria-hidden="true" size={16} />}
                      onClick={() => onOpenRoleHistory(administrator.userId)}
                      size="xs"
                      variant="subtle"
                    >
                      {labels.openHistory}
                    </Button>
                    {administrator.roleSource === 'database' && props.canManageAdministrators ? (
                      <Button
                        aria-label={`${labels.revoke}: ${administrator.displayName}`}
                        color="red"
                        leftSection={<IconUserMinus aria-hidden="true" size={16} />}
                        onClick={() => props.onRequestRevoke(administrator)}
                        size="xs"
                        variant="subtle"
                      >
                        {labels.revoke}
                      </Button>
                    ) : null}
                  </Stack>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  )
}