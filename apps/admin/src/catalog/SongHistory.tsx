import { Alert, Anchor, Badge, Group, Skeleton, Stack, Table, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { adminClient, adminOrpc } from '../api'
import { routeHref } from '../route'
import { showValue } from './Diff'
import { formatUtc } from './Publications'

/**
 * What each recent publication changed in one song (gekichumai/meta#50 Phase 3, slice 4), as the publications recorded
 * it. Labelled as such: it is not a curated game-version history.
 */
type Entry = Awaited<ReturnType<typeof adminClient.catalog.songHistory>>['entries'][number]
type Change = NonNullable<Entry['change']>['fields'][number]

const KIND_COLOR = { added: 'teal', removed: 'red', changed: 'blue' } as const

function ChangeLine({ scope, change }: { scope: string; change: Change }) {
  return (
    <Group gap={6} wrap="wrap">
      <Text size="xs" c="dimmed">
        {scope}
      </Text>
      <Text size="xs" ff="monospace">
        {change.path}
      </Text>
      {showValue(change.before, Object.hasOwn(change, 'before'))}
      <Text size="xs" c="dimmed">
        →
      </Text>
      {showValue(change.after, Object.hasOwn(change, 'after'))}
    </Group>
  )
}

export function SongHistory({ channel, songId, limit = 10 }: { channel?: string; songId: string; limit?: number }) {
  const query = useQuery(adminOrpc.catalog.songHistory.queryOptions({ input: { channel, songId, limit } }))
  const data = query.data

  if (query.isPending) return <Skeleton h={160} radius="md" aria-busy="true" aria-label="Loading history" />
  if (query.isError || !data)
    return (
      <Alert color="red" variant="light" role="alert">
        Could not load the history. Try again in a moment.
      </Alert>
    )

  const entries = data.entries
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        The last {entries.length} publications, newest first, each against the one before it. This is what the
        publications recorded, not a curated game-version history.
      </Text>
      <Table verticalSpacing={6} fz="sm" withTableBorder layout="fixed" aria-label="History">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w="28%">Publication</Table.Th>
            <Table.Th>What changed in this song</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry, index) => {
            const older = entries[index + 1]
            return (
              <Table.Tr key={entry.revision}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    r{entry.revision}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatUtc(entry.publishedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {!entry.present && !entry.change && (
                    <Text size="xs" c="dimmed" fs="italic">
                      Not in this publication
                    </Text>
                  )}
                  {entry.present && !entry.change && (
                    <Text size="xs" c="dimmed">
                      {older ? 'No change' : 'Oldest shown'}
                    </Text>
                  )}
                  {entry.change && (
                    <Stack gap={4}>
                      {entry.change.kind !== 'changed' && (
                        <Badge size="xs" variant="light" color={KIND_COLOR[entry.change.kind]}>
                          song {entry.change.kind}
                        </Badge>
                      )}
                      {entry.change.fields.map((change) => (
                        <ChangeLine key={change.path} scope="song" change={change} />
                      ))}
                      {entry.change.sheets.flatMap((sheet) =>
                        sheet.kind === 'changed'
                          ? sheet.fields.map((change) => (
                              <ChangeLine
                                key={`${sheet.id}:${change.path}`}
                                scope={`${sheet.type} ${sheet.difficulty}`}
                                change={change}
                              />
                            ))
                          : entry.change!.kind === 'changed'
                            ? [
                                <Badge key={sheet.id} size="xs" variant="light" color={KIND_COLOR[sheet.kind]}>
                                  {sheet.type} {sheet.difficulty} {sheet.kind}
                                </Badge>,
                              ]
                            : [],
                      )}
                      {older && (
                        <Anchor
                          size="xs"
                          href={routeHref('diff', {
                            channel: data.channel === 'production-v1' ? undefined : data.channel,
                            from: older.revision,
                            to: entry.revision,
                          })}
                        >
                          Whole catalog r{older.revision} → r{entry.revision}
                        </Anchor>
                      )}
                    </Stack>
                  )}
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}