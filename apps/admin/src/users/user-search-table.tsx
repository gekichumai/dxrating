import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Table, Text, ThemeIcon } from '@mantine/core'
import { IconArrowRight, IconCheck, IconClock, IconLock, IconSearchOff, IconX } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { AdminClient } from '../data/admin-client'
import { useAdminTranslation } from '../i18n'

export type UserSearchRow = Awaited<ReturnType<AdminClient['searchUsers']>>['items'][number]

export type UserSearchTableProps = {
  readonly loading?: boolean
  readonly rows: readonly UserSearchRow[]
}

const roleColor = (role: UserSearchRow['effectiveRole']): string =>
  role === 'super_admin' ? 'violet' : role === 'admin' ? 'indigo' : 'gray'

export const UserSearchTable = ({ loading = false, rows }: UserSearchTableProps) => {
  const { locale, t } = useAdminTranslation()

  if (!loading && rows.length === 0) {
    return (
      <Paper component="section" p="xl" radius="lg" ta="center" withBorder>
        <Stack align="center" gap="xs">
          <ThemeIcon color="gray" radius="xl" size="xl" variant="light">
            <IconSearchOff aria-hidden="true" size={22} />
          </ThemeIcon>
          <Text fw={650}>{t('users.results.emptyTitle')}</Text>
          <Text c="dimmed" maw={520} size="sm">
            {t('users.results.emptyDescription')}
          </Text>
        </Stack>
      </Paper>
    )
  }

  const visibleRows = loading && rows.length === 0 ? Array.from({ length: 5 }, (_, index) => index) : rows

  return (
    <Paper component="section" radius="lg" shadow="xs" withBorder>
      <Table.ScrollContainer minWidth={900}>
        <Table aria-busy={loading} highlightOnHover horizontalSpacing="md" striped verticalSpacing="sm">
          <Table.Caption>{t('users.results.caption')}</Table.Caption>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('users.results.columns.identity')}</Table.Th>
              <Table.Th>{t('users.results.columns.email')}</Table.Th>
              <Table.Th>{t('users.results.columns.role')}</Table.Th>
              <Table.Th>{t('users.results.columns.status')}</Table.Th>
              <Table.Th>{t('users.results.columns.action')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.map((row) => {
              if (typeof row === 'number') {
                return (
                  <Table.Tr aria-hidden="true" key={`loading-${row}`}>
                    {Array.from({ length: 5 }, (_, column) => (
                      <Table.Td key={column}>
                        <Skeleton height={20} radius="sm" width={column === 4 ? 90 : '75%'} />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                )
              }

              const roleLabel =
                row.effectiveRole === 'super_admin'
                  ? t('users.role.superAdmin')
                  : row.effectiveRole === 'admin'
                    ? t('users.role.admin')
                    : t('users.role.user')
              const status = row.accountStatus
              const statusLabel =
                status.status === 'active'
                  ? t('users.status.active')
                  : status.status === 'permanently_banned'
                    ? t('users.status.permanentlyBanned')
                    : t('users.status.temporarilyBanned', {
                        timestamp: new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(status.expiresAt)),
                      })

              return (
                <Table.Tr key={row.userId}>
                  <Table.Td>
                    <Stack gap={3}>
                      <Text fw={650}>{row.displayName}</Text>
                      <Code>{row.userId}</Code>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Text size="sm">{row.email}</Text>
                      <Group gap={5} wrap="nowrap">
                        {row.emailVerified ? (
                          <IconCheck aria-hidden="true" color="var(--mantine-color-teal-6)" size={15} />
                        ) : (
                          <IconX aria-hidden="true" color="var(--mantine-color-gray-6)" size={15} />
                        )}
                        <Text c="dimmed" size="xs">
                          {row.emailVerified ? t('users.email.verified') : t('users.email.notVerified')}
                        </Text>
                      </Group>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={roleColor(row.effectiveRole)} variant="light">
                      {roleLabel}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        status.status === 'active' ? 'teal' : status.status === 'temporarily_banned' ? 'orange' : 'red'
                      }
                      leftSection={
                        status.status === 'active' ? undefined : status.status === 'temporarily_banned' ? (
                          <IconClock aria-hidden="true" size={12} />
                        ) : (
                          <IconLock aria-hidden="true" size={12} />
                        )
                      }
                      variant="light"
                    >
                      {statusLabel}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      renderRoot={(props) => (
                        <Link {...props} params={{ userId: row.userId }} search={{}} to="/users/$userId" />
                      )}
                      rightSection={<IconArrowRight aria-hidden="true" size={16} />}
                      size="xs"
                      variant="subtle"
                    >
                      {t('users.results.openDetails')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  )
}