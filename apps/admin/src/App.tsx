import {
  AppShell,
  Alert,
  Badge,
  Burger,
  Card,
  Code,
  Group,
  NavLink,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { Announcements } from './Announcements'
import { adminOrpc } from './api'

/** The admin shell (gekichumai/meta#50; Mantine per the owner). English only (meta#50 Q6). */
export function App() {
  const [navOpen, { toggle }] = useDisclosure()
  const me = useQuery(adminOrpc.me.queryOptions({ retry: false }))
  // A failed refetch keeps the old data in the cache, so show the principal only while the latest request succeeded
  const principal = me.isError ? undefined : me.data
  const denied =
    me.isError && me.error instanceof ORPCError && (me.error.code === 'UNAUTHORIZED' || me.error.code === 'FORBIDDEN')

  return (
    <AppShell
      className="admin-shell"
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !navOpen } }}
      padding="md"
    >
      <AppShell.Header className="admin-glass">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpen} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Title order={1} size="h4" style={{ whiteSpace: 'nowrap' }}>
              DXRating Admin
            </Title>
          </Group>
          {principal && (
            <Text size="sm" c="dimmed" truncate="end" maw={260} title={principal.actor} visibleFrom="xs">
              {principal.id}
            </Text>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" className="admin-glass">
        <NavLink label="Overview" href="#overview" />
        <NavLink label="Announcements" href="#announcements" />
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack maw={960}>
          {me.isPending && <Skeleton h={120} radius="md" aria-busy="true" aria-label="Loading" />}
          {denied && (
            <Alert color="orange" title="No access" role="alert">
              This account is not an administrator, or the sign-in has expired. Reload to sign in again.
            </Alert>
          )}
          {me.isError && !denied && (
            <Alert color="red" title="Admin API unavailable" role="alert">
              The request failed. Try again in a moment.
            </Alert>
          )}
          {principal && (
            <Card className="admin-glass" padding="lg" id="overview">
              <Group justify="space-between" mb="sm">
                <Title order={2} size="h5">
                  Signed in
                </Title>
                <Badge variant="light">{principal.type}</Badge>
              </Group>
              <Table variant="vertical" layout="fixed" withRowBorders={false}>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Th w={120}>Principal</Table.Th>
                    <Table.Td>
                      <Code>{principal.actor}</Code>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Scopes</Table.Th>
                    <Table.Td>
                      <Group gap={6}>
                        {principal.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" tt="none">
                            {scope}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Card>
          )}
          {principal && (principal.scopes.includes('*') || principal.scopes.includes('announcements:read')) && (
            <div id="announcements">
              <Announcements
                canWrite={principal.scopes.includes('*') || principal.scopes.includes('announcements:write')}
              />
            </div>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}