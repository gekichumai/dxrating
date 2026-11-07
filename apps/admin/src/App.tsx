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
import { DataOverview } from './catalog/DataOverview'
import { Diff } from './catalog/Diff'
import { Publications } from './catalog/Publications'
import { SongProvenance, SongSearch } from './catalog/Songs'
import { routeHref, useRoute, type View } from './route'

const NAV: { view: View; label: string; scope?: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'announcements', label: 'Announcements', scope: 'announcements:read' },
  { view: 'publications', label: 'Publications', scope: 'catalog:read' },
  { view: 'diff', label: 'Changes', scope: 'catalog:read' },
  { view: 'songs', label: 'Songs', scope: 'catalog:read' },
]

const can = (scopes: readonly string[] | undefined, scope: string | undefined) =>
  scope === undefined || scopes?.includes('*') === true || scopes?.includes(scope) === true

/** The admin shell (gekichumai/meta#50; Mantine per the owner). English only (meta#50 Q6). */
export function App() {
  const [navOpen, { toggle, close }] = useDisclosure()
  const route = useRoute()
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
        {NAV.filter((item) => can(principal?.scopes, item.scope)).map((item) => (
          <NavLink
            key={item.view}
            label={item.label}
            href={routeHref(item.view)}
            active={route.view === item.view || (item.view === 'songs' && route.view === 'song')}
            aria-current={route.view === item.view ? 'page' : undefined}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack maw={route.view === 'overview' || route.view === 'announcements' ? 960 : 1200}>
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
          {principal && route.view === 'overview' && (
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
                    <Table.Th w={88}>Principal</Table.Th>
                    <Table.Td>
                      <Code style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{principal.actor}</Code>
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
          {principal && route.view === 'overview' && can(principal.scopes, 'catalog:read') && <DataOverview />}
          {principal && route.view === 'announcements' && can(principal.scopes, 'announcements:read') && (
            <Announcements canWrite={can(principal.scopes, 'announcements:write')} />
          )}
          {principal && route.view === 'diff' && can(principal.scopes, 'catalog:read') && (
            <Diff
              channel={route.params.get('channel') ?? undefined}
              from={Number(route.params.get('from')) || undefined}
              to={Number(route.params.get('to')) || undefined}
              path={route.params.get('path') ?? undefined}
              offset={Number(route.params.get('offset')) || undefined}
            />
          )}
          {principal && route.view === 'songs' && can(principal.scopes, 'catalog:read') && (
            <SongSearch
              channel={route.params.get('channel') ?? undefined}
              q={route.params.get('q') ?? undefined}
              revision={Number(route.params.get('revision')) || undefined}
            />
          )}
          {principal &&
            route.view === 'song' &&
            can(principal.scopes, 'catalog:read') &&
            route.params.get('songId') && (
              <SongProvenance
                key={route.params.get('songId')}
                channel={route.params.get('channel') ?? undefined}
                songId={route.params.get('songId')!}
                revision={Number(route.params.get('revision')) || undefined}
              />
            )}
          {principal && route.view === 'publications' && can(principal.scopes, 'catalog:read') && (
            <Publications
              channel={route.params.get('channel') ?? undefined}
              before={Number(route.params.get('before')) || undefined}
            />
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}