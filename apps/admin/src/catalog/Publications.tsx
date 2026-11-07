import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Group,
  NativeSelect,
  Skeleton,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { adminOrpc } from '../api'
import { routeHref } from '../route'

/**
 * dxdata publications (gekichumai/meta#50 Phase 3, slice 1): every receipt of a channel, newest first. Read-only: the
 * assembly line publishes; the admin only looks.
 */
export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} kB`

/** `2026-11-07 08:00 UTC`: absolute and zone-explicit, so two admins in different zones read the same thing */
export const formatUtc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`

export function Publications({ channel, before }: { channel?: string; before?: number }) {
  const query = useQuery({
    ...adminOrpc.catalog.publications.queryOptions({ input: { channel, before, limit: 50 } }),
    placeholderData: keepPreviousData,
  })
  const data = query.data

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="publications-heading">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Title order={2} size="h5" id="publications-heading">
          Publications
        </Title>
        {data && data.channels.length > 1 && (
          <NativeSelect
            aria-label="Channel"
            size="xs"
            data={data.channels}
            value={data.channel}
            onChange={(e) => (window.location.hash = routeHref('publications', { channel: e.currentTarget.value }))}
          />
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Each dxdata catalog the assembly line published on this channel. Times are UTC.
      </Text>

      {query.isPending && <Skeleton h={160} radius="md" aria-busy="true" aria-label="Loading publications" />}
      {query.isError && (
        <Alert color="red" variant="light" role="alert">
          Could not load publications. Try again in a moment.
        </Alert>
      )}
      {data && data.publications.length === 0 && (
        <Text size="sm" role="status">
          No publications on {data.channel} yet.
        </Text>
      )}
      {data && data.publications.length > 0 && (
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th miw={132}>Revision</Table.Th>
                <Table.Th>Published</Table.Th>
                <Table.Th ta="right">Songs</Table.Th>
                <Table.Th ta="right">Sheets</Table.Th>
                <Table.Th ta="right">Size</Table.Th>
                <Table.Th>Pipeline</Table.Th>
                <Table.Th>Snapshot</Table.Th>
                <Table.Th>Provenance</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.publications.map((p) => (
                <Table.Tr key={p.fingerprint}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600} size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        r{p.revision}
                      </Text>
                      {p.current && (
                        <Badge size="xs" variant="light" color="teal" style={{ flexShrink: 0, overflow: 'visible' }}>
                          current
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatUtc(p.publishedAt)}</Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.songCount.toLocaleString('en')}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.sheetCount.toLocaleString('en')}
                  </Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {formatBytes(p.byteLength)}
                  </Table.Td>
                  <Table.Td>
                    <Code>{p.pipelineVersion}</Code>
                  </Table.Td>
                  <Table.Td>
                    <Code title={p.bodySha256}>{p.bodySha256.slice(0, 12)}</Code>
                    {p.legacyGitCommitSha && (
                      <>
                        {' · '}
                        <Anchor
                          size="sm"
                          href={`https://github.com/gekichumai/dxrating/commit/${p.legacyGitCommitSha}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          git {p.legacyGitCommitSha.slice(0, 7)}
                        </Anchor>
                      </>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {p.hasProvenanceManifest ? (
                      <Badge size="xs" variant="outline">
                        manifest
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">
                        none
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {data && (before !== undefined || data.nextBefore !== null) && (
        <Group mt="md" gap="xs">
          {before !== undefined && (
            <Button component="a" size="xs" variant="default" href={routeHref('publications', { channel })}>
              Newest
            </Button>
          )}
          {data.nextBefore !== null && (
            <Button
              component="a"
              size="xs"
              variant="default"
              href={routeHref('publications', { channel, before: data.nextBefore })}
            >
              Older
            </Button>
          )}
        </Group>
      )}
    </Card>
  )
}