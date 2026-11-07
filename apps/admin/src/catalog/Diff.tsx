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
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ORPCError } from '@orpc/client'
import { adminClient, adminOrpc } from '../api'
import { routeHref } from '../route'
import { formatUtc } from './Publications'

/**
 * What changed between two dxdata publications (gekichumai/meta#50 Phase 3, slice 2), computed by the admin API from
 * the two immutable snapshots. Every filter is in the URL hash, so a change list can be linked.
 */
type DiffResult = Awaited<ReturnType<typeof adminClient.catalog.diff>>
type Change = DiffResult['songs'][number]['fields'][number]

export interface DiffParams {
  channel?: string
  from?: number
  to?: number
  path?: string
  offset?: number
}

const PAGE = 50
const KIND_COLOR = { added: 'teal', removed: 'red', changed: 'blue' } as const

/** A value as the catalog has it: strings bare, everything else as JSON; an absent field says so */
export const showValue = (value: unknown, present: boolean) =>
  !present ? (
    <Text span size="xs" c="dimmed" fs="italic">
      absent
    </Text>
  ) : (
    <Code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {typeof value === 'string' ? value : JSON.stringify(value)}
    </Code>
  )

const has = (change: Change, side: 'before' | 'after') => Object.hasOwn(change, side)

export function Diff(params: DiffParams) {
  const { channel, from, to, path, offset = 0 } = params
  const revisions = useQuery(adminOrpc.catalog.publications.queryOptions({ input: { channel, limit: 100 } }))
  const query = useQuery({
    ...adminOrpc.catalog.diff.queryOptions({ input: { channel, from, to, path, offset, limit: PAGE } }),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const data = query.data
  // Links continue the comparison on screen: the pair the API resolved, never the omitted defaults, which would move
  // to a different pair as soon as a new publication lands
  const pair = data && !query.isPlaceholderData ? { from: data.from.revision, to: data.to.revision } : { from, to }
  const href = (next: Partial<DiffParams>) => routeHref('diff', { channel, ...pair, path, offset: undefined, ...next })
  // The newest 100, plus the two on screen when they are older than that
  const listed = (revisions.data?.publications ?? []).map((p) => ({ revision: p.revision, publishedAt: p.publishedAt }))
  const shown = data ? [data.from, data.to].filter((side) => !listed.some((p) => p.revision === side.revision)) : []
  const options = [...listed, ...shown]
    .sort((a, b) => b.revision - a.revision)
    .map((p) => ({ value: String(p.revision), label: `r${p.revision} · ${formatUtc(p.publishedAt)}` }))
  const missing = query.error instanceof ORPCError && query.error.code === 'NOT_FOUND'

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="diff-heading">
      <Group justify="space-between" mb="sm" wrap="wrap" align="end">
        <Title order={2} size="h5" id="diff-heading">
          Changes between publications
        </Title>
        {options.length > 0 && data && (
          <Group gap="xs" wrap="wrap">
            <NativeSelect
              aria-label="Older publication"
              size="xs"
              data={options}
              value={String(data.from.revision)}
              onChange={(e) => (window.location.hash = href({ from: Number(e.currentTarget.value) }))}
            />
            <Text size="xs" c="dimmed">
              →
            </Text>
            <NativeSelect
              aria-label="Newer publication"
              size="xs"
              data={options}
              value={String(data.to.revision)}
              onChange={(e) => (window.location.hash = href({ to: Number(e.currentTarget.value) }))}
            />
          </Group>
        )}
      </Group>

      {query.isPending && <Skeleton h={200} radius="md" aria-busy="true" aria-label="Loading changes" />}
      {query.isError && (
        <Alert color={missing ? 'orange' : 'red'} variant="light" role="alert">
          {missing ? query.error.message : 'Could not compute the changes. Try again in a moment.'}
        </Alert>
      )}

      {data && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            r{data.from.revision} ({formatUtc(data.from.publishedAt)}) → r{data.to.revision} (
            {formatUtc(data.to.publishedAt)}) on {data.channel}. Songs match by ID, sheets by type and difficulty.
          </Text>

          <Group gap={6} aria-label="Summary">
            {(
              [
                ['songsAdded', '+', 'songs', 'light', 'teal'],
                ['songsRemoved', '−', 'songs', 'light', 'red'],
                ['songsChanged', '', 'songs changed', 'light', 'blue'],
                ['sheetsAdded', '+', 'sheets', 'outline', 'teal'],
                ['sheetsRemoved', '−', 'sheets', 'outline', 'red'],
                ['sheetsChanged', '', 'sheets changed', 'outline', 'blue'],
                ['fieldChanges', '', 'field changes', 'default', 'gray'],
              ] as const
            )
              .filter(([key]) => data.summary[key] > 0)
              .map(([key, sign, label, variant, color]) => (
                <Badge key={key} variant={variant} color={color}>
                  {sign}
                  {data.summary[key]} {label}
                </Badge>
              ))}
          </Group>

          {data.pathCounts.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={4}>
                By field
              </Text>
              <Group gap={6}>
                {data.path && (
                  <Button component="a" size="compact-xs" variant="subtle" href={href({ path: undefined })}>
                    All changes
                  </Button>
                )}
                {data.pathCounts.map((p) => (
                  <Button
                    key={p.path}
                    component="a"
                    size="compact-xs"
                    variant={data.path === p.path ? 'filled' : 'default'}
                    href={href({ path: p.path })}
                    aria-current={data.path === p.path ? 'true' : undefined}
                    tt="none"
                  >
                    {p.path} · {p.count}
                  </Button>
                ))}
              </Group>
            </div>
          )}

          {data.lists.map((list) => (
            <Text key={list.key} size="sm">
              <b>{list.key}</b>: {list.beforeCount} → {list.afterCount}
              {list.added.length > 0 && <> · added {list.added.map((item) => JSON.stringify(item)).join(', ')}</>}
              {list.removed.length > 0 && <> · removed {list.removed.map((item) => JSON.stringify(item)).join(', ')}</>}
            </Text>
          ))}

          {data.songsTotal === 0 && (
            <Text size="sm" component="output" display="block">
              No song or sheet changed{data.path ? ` in ${data.path}` : ''}.
            </Text>
          )}

          {data.songs.map((song) => (
            <div key={`${song.kind}:${song.songId}`}>
              <Group gap="xs" mb={4} wrap="wrap">
                <Text fw={600} size="sm">
                  {song.title}
                </Text>
                <Code>{song.songId}</Code>
                <Badge size="xs" variant="light" color={KIND_COLOR[song.kind]}>
                  {song.kind}
                </Badge>
              </Group>
              <Table verticalSpacing={4} fz="sm" withTableBorder layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w="20%">Sheet</Table.Th>
                    <Table.Th w="30%">Field</Table.Th>
                    <Table.Th>Before</Table.Th>
                    <Table.Th>After</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {song.fields.map((change) => (
                    <Table.Tr key={`song:${change.path}`}>
                      <Table.Td c="dimmed">song</Table.Td>
                      <Table.Td>
                        <Code style={{ overflowWrap: 'anywhere' }}>{change.path}</Code>
                      </Table.Td>
                      <Table.Td>{showValue(change.before, has(change, 'before'))}</Table.Td>
                      <Table.Td>{showValue(change.after, has(change, 'after'))}</Table.Td>
                    </Table.Tr>
                  ))}
                  {song.sheets.flatMap((sheet) =>
                    sheet.kind === 'changed' ? (
                      sheet.fields.map((change) => (
                        <Table.Tr key={`${sheet.id}:${change.path}`}>
                          <Table.Td>
                            {sheet.type} {sheet.difficulty}
                          </Table.Td>
                          <Table.Td>
                            <Code style={{ overflowWrap: 'anywhere' }}>{change.path}</Code>
                          </Table.Td>
                          <Table.Td>{showValue(change.before, has(change, 'before'))}</Table.Td>
                          <Table.Td>{showValue(change.after, has(change, 'after'))}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr key={sheet.id}>
                        <Table.Td>
                          {sheet.type} {sheet.difficulty}
                        </Table.Td>
                        <Table.Td colSpan={3}>
                          <Badge size="xs" variant="light" color={KIND_COLOR[sheet.kind]}>
                            sheet {sheet.kind}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </div>
          ))}

          {/* While other revisions or another filter load, nextOffset is the previous query's: no paging until it lands */}
          {!query.isPlaceholderData && (offset > 0 || data.nextOffset !== null) && (
            <Group gap="xs">
              {offset > 0 && (
                <Button
                  component="a"
                  size="xs"
                  variant="default"
                  href={href({ offset: Math.max(0, offset - PAGE) || undefined })}
                >
                  Previous {PAGE}
                </Button>
              )}
              {data.nextOffset !== null && (
                <Button component="a" size="xs" variant="default" href={href({ offset: data.nextOffset })}>
                  Next {PAGE}
                </Button>
              )}
              <Text size="xs" c="dimmed">
                Songs {offset + 1}–{offset + data.songs.length} of {data.songsTotal}
              </Text>
            </Group>
          )}
          <Text size="xs" c="dimmed">
            Agents:{' '}
            <Anchor
              href={`/api/catalog/diff?${new URLSearchParams({
                channel: data.channel,
                from: String(data.from.revision),
                to: String(data.to.revision),
                ...(data.path ? { path: data.path } : {}),
              })}`}
            >
              JSON
            </Anchor>{' '}
            (scope catalog:read).
          </Text>
        </Stack>
      )}
    </Card>
  )
}