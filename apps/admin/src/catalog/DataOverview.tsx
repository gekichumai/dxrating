import { Alert, Anchor, Badge, Card, Group, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { adminOrpc } from '../api'
import { routeHref } from '../route'
import { formatUtc } from './Publications'

/**
 * The data overview on the admin landing page (gekichumai/meta#50 Phase 3, slice 5): the current publication, what it
 * changed, and when each source last fed the catalog. Ages are relative to the time the API read them.
 */
export const formatAge = (seconds: number) => {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`
  const days = Math.floor(seconds / 86_400)
  const hours = Math.round((seconds % 86_400) / 3600)
  return hours ? `${days} d ${hours} h ago` : `${days} d ago`
}

/** A display hint only: a source the catalog has not heard from in a week is worth a look */
const STALE_SECONDS = 7 * 86_400

export function DataOverview() {
  const query = useQuery(adminOrpc.catalog.overview.queryOptions({ input: {} }))
  const data = query.data

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="data-heading">
      <Title order={2} size="h5" id="data-heading" mb="sm">
        Song data
      </Title>
      {query.isPending && <Skeleton h={160} radius="md" aria-busy="true" aria-label="Loading the data overview" />}
      {query.isError && (
        <Alert color="red" variant="light" role="alert">
          Could not load the data overview. Try again in a moment.
        </Alert>
      )}
      {data && !data.current && (
        <Text size="sm" component="output" display="block">
          Nothing is published on {data.channel} yet.
        </Text>
      )}
      {data?.current && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <div>
              <Text size="xs" c="dimmed">
                Current publication
              </Text>
              <Group gap="xs" align="baseline">
                <Anchor href={routeHref('publications')} fw={600}>
                  r{data.current.revision}
                </Anchor>
                <Text size="sm">{formatUtc(data.current.publishedAt)}</Text>
                <Text size="sm" c="dimmed">
                  {formatAge(data.current.ageSeconds)}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {data.current.songCount.toLocaleString('en')} songs · {data.current.sheetCount.toLocaleString('en')}{' '}
                sheets · {data.current.pipelineVersion} ·{' '}
                {data.current.hasProvenanceManifest ? 'provenance manifest' : 'no provenance manifest'}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Latest change
              </Text>
              {data.latestChange ? (
                <>
                  <Anchor
                    href={routeHref('diff', { from: data.latestChange.from, to: data.latestChange.to })}
                    size="sm"
                  >
                    r{data.latestChange.from} → r{data.latestChange.to}: {data.latestChange.summary.songsChanged} songs
                    changed
                    {data.latestChange.summary.songsAdded > 0 ? `, ${data.latestChange.summary.songsAdded} added` : ''}
                    {data.latestChange.summary.songsRemoved > 0
                      ? `, ${data.latestChange.summary.songsRemoved} removed`
                      : ''}
                  </Anchor>
                  <Group gap={4} mt={4}>
                    {data.latestChange.pathCounts.map((p) => (
                      <Badge
                        key={p.path}
                        component="a"
                        href={routeHref('diff', {
                          from: data.latestChange!.from,
                          to: data.latestChange!.to,
                          path: p.path,
                        })}
                        size="xs"
                        variant="outline"
                        tt="none"
                        style={{ cursor: 'pointer' }}
                      >
                        {p.path} · {p.count}
                      </Badge>
                    ))}
                  </Group>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  Only one publication so far.
                </Text>
              )}
            </div>
          </SimpleGrid>

          <div>
            <Text size="xs" fw={600} mb={4}>
              Sources: last successful observation
            </Text>
            <Table verticalSpacing={4} fz="sm" aria-label="Sources">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Source</Table.Th>
                  <Table.Th visibleFrom="sm">Kind</Table.Th>
                  <Table.Th>Last observed</Table.Th>
                  <Table.Th ta="right">Items</Table.Th>
                  <Table.Th ta="right" visibleFrom="sm">
                    Observations
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.sources.map((source) => {
                  const stale = source.ageSeconds !== null && source.ageSeconds > STALE_SECONDS
                  return (
                    <Table.Tr key={`${source.id}:${source.scope ?? ''}`}>
                      <Table.Td>
                        <Group gap={6} wrap="wrap">
                          <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>
                            {source.id}
                          </Text>
                          {source.authoritative && (
                            <Badge size="xs" variant="light">
                              authoritative
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {source.name}
                          {source.scope && source.scope !== 'catalog' ? ` · ${source.scope}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td visibleFrom="sm">{source.kind}</Table.Td>
                      <Table.Td>
                        {source.lastObservedAt ? (
                          <>
                            <Text size="sm">{formatUtc(source.lastObservedAt)}</Text>
                            <Text size="xs" c={stale ? 'orange' : 'dimmed'}>
                              {formatAge(source.ageSeconds!)}
                              {stale ? ' · over a week' : ''}
                            </Text>
                          </>
                        ) : (
                          <Text size="xs" c="dimmed" fs="italic">
                            never observed
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">{source.itemCount?.toLocaleString('en') ?? ''}</Table.Td>
                      <Table.Td ta="right" visibleFrom="sm">
                        {source.observations.toLocaleString('en')}
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt={4}>
              {data.failures.note}. Ages are as of {formatUtc(data.observedAt)}.
            </Text>
          </div>
        </Stack>
      )}
    </Card>
  )
}