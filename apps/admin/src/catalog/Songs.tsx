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
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { ORPCError } from '@orpc/client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { adminClient, adminOrpc } from '../api'
import { routeHref } from '../route'
import { showValue } from './Diff'
import { formatUtc } from './Publications'

/**
 * Song search and per-song provenance (gekichumai/meta#50 Phase 3, slice 3). Rule-level: each value with the producer
 * rule that covers it (sources, transforms) and, where the rule names the song's lineage, the source it came from.
 */
type SongDetail = Awaited<ReturnType<typeof adminClient.catalog.song>>
type Field = SongDetail['fields'][number]

export function SongSearch({ channel, q, revision }: { channel?: string; q?: string; revision?: number }) {
  const [text, setText] = useState(q ?? '')
  // Back/Forward changes the committed query; the box follows it
  useEffect(() => setText(q ?? ''), [q])
  const query = useQuery({
    ...adminOrpc.catalog.songs.queryOptions({ input: { channel, q: q ?? '', revision, limit: 50 } }),
    placeholderData: keepPreviousData,
  })
  const data = query.data

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="songs-heading">
      <Title order={2} size="h5" id="songs-heading" mb="sm">
        Songs
      </Title>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          window.location.hash = routeHref('songs', { channel, q: text.trim() || undefined, revision })
        }}
      >
        <Group gap="xs" align="end" mb="md">
          <TextInput
            label="Search by ID, title, artist or acronym"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit">Search</Button>
        </Group>
      </form>
      {query.isPending && <Skeleton h={120} radius="md" aria-busy="true" aria-label="Searching" />}
      {query.isError && (
        <Alert color="red" variant="light" role="alert">
          Could not search. Try again in a moment.
        </Alert>
      )}
      {data && (
        <>
          <Text size="sm" c="dimmed" mb="xs">
            {data.total.toLocaleString('en')} songs in r{data.publication.revision} (
            {formatUtc(data.publication.publishedAt)})
            {data.total > data.songs.length ? `, first ${data.songs.length}` : ''}.
          </Text>
          <Table striped highlightOnHover verticalSpacing="xs" fz="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th visibleFrom="sm">Artist</Table.Th>
                <Table.Th w={70} ta="right">
                  Sheets
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.songs.map((song) => (
                <Table.Tr key={song.songId}>
                  <Table.Td>
                    <Anchor size="sm" href={routeHref('song', { channel, songId: song.songId, revision })}>
                      {song.title}
                    </Anchor>
                  </Table.Td>
                  <Table.Td visibleFrom="sm">{song.artist}</Table.Td>
                  <Table.Td ta="right">{song.sheetCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Card>
  )
}

/** The rule's sources: a lineage reference shows the source(s) this song names; any other source shows as listed */
function Sources({ field }: { field: Field }) {
  if (!field.rule)
    return (
      <Text span size="xs" c="dimmed">
        {field.note ?? 'no rule'}
      </Text>
    )
  return (
    <Group gap={4}>
      {field.rule.sources.flatMap((source) =>
        source.resolved === null
          ? [
              <Badge
                key={source.source}
                size="xs"
                variant="outline"
                color="gray"
                tt="none"
                title="Can supply this field"
              >
                {source.source}
              </Badge>,
            ]
          : source.resolved.map((name) => (
              <Badge
                key={`${source.source}:${name}`}
                size="xs"
                variant="light"
                tt="none"
                title={`This song’s ${source.source}`}
              >
                {name}
              </Badge>
            )),
      )}
    </Group>
  )
}

function FieldTable({ fields, label }: { fields: Field[]; label: string }) {
  return (
    <Table verticalSpacing={4} fz="sm" withTableBorder layout="fixed" aria-label={label}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w="24%">Field</Table.Th>
          <Table.Th w="26%">Value</Table.Th>
          <Table.Th>From</Table.Th>
          <Table.Th w="22%" visibleFrom="sm">
            Transforms
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {fields.map((field) => (
          <Table.Tr key={field.path} id={`field-${label}-${field.path}`}>
            <Table.Td>
              <Code style={{ overflowWrap: 'anywhere' }} title={field.outputPath}>
                {field.path}
              </Code>
            </Table.Td>
            <Table.Td>{showValue(field.value, true)}</Table.Td>
            <Table.Td>
              <Sources field={field} />
            </Table.Td>
            <Table.Td visibleFrom="sm">
              <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {field.rule?.transforms.join(' → ') ?? ''}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

const LINEAGE_LABELS: Record<string, string> = {
  catalog: 'Catalog entry',
  enrichment: 'Enrichment',
  regions: 'Regions',
  internalIds: 'Internal IDs',
}

export function SongProvenance({ channel, songId, revision }: { channel?: string; songId: string; revision?: number }) {
  const revisions = useQuery(adminOrpc.catalog.publications.queryOptions({ input: { channel, limit: 100 } }))
  const query = useQuery({
    ...adminOrpc.catalog.song.queryOptions({ input: { channel, songId, revision } }),
    retry: false,
  })
  const data = query.data
  const missing = query.error instanceof ORPCError && query.error.code === 'NOT_FOUND'
  // The newest 100, plus the one on screen (or asked for) when it is older than that
  const listed = (revisions.data?.publications ?? []).map((p) => ({
    value: String(p.revision),
    label: `r${p.revision} · ${formatUtc(p.publishedAt)}`,
  }))
  const current = data?.publication.revision ?? revision
  const pickerOptions =
    current !== undefined && listed.length > 0 && !listed.some((option) => option.value === String(current))
      ? [
          ...listed,
          {
            value: String(current),
            label: data ? `r${current} · ${formatUtc(data.publication.publishedAt)}` : `r${current}`,
          },
        ]
      : listed
  const lineage =
    data?.lineage && typeof data.lineage === 'object' && !Array.isArray(data.lineage)
      ? (data.lineage as Record<string, unknown>)
      : null
  const inputs =
    data?.manifest?.sources && typeof data.manifest.sources === 'object' && !Array.isArray(data.manifest.sources)
      ? Object.entries(
          data.manifest.sources as Record<string, { path?: string; sha256?: string; recordCount?: number }>,
        )
      : []
  const coverage = data?.manifest?.coverage as { percent?: number; leafFields?: number } | null | undefined

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="song-heading">
      <Group justify="space-between" mb="sm" wrap="wrap" align="end">
        <div>
          <Text size="xs" c="dimmed">
            <Anchor size="xs" href={routeHref('songs', { channel, revision })}>
              Songs
            </Anchor>{' '}
            ›
          </Text>
          <Title order={2} size="h5" id="song-heading">
            {data?.song.title ?? songId}
          </Title>
        </div>
        {/* Independent of the song query: a revision without this song (404) must still let you pick another */}
        {pickerOptions.length > 0 && (
          <NativeSelect
            aria-label="Publication"
            size="xs"
            data={pickerOptions}
            value={String(data?.publication.revision ?? revision ?? pickerOptions[0]!.value)}
            onChange={(e) =>
              (window.location.hash = routeHref('song', { channel, songId, revision: e.currentTarget.value }))
            }
          />
        )}
      </Group>

      {query.isPending && <Skeleton h={240} radius="md" aria-busy="true" aria-label="Loading song" />}
      {query.isError && (
        <Alert color={missing ? 'orange' : 'red'} variant="light" role="alert">
          {missing ? query.error.message : 'Could not load the song. Try again in a moment.'}
        </Alert>
      )}

      {data && (
        <Stack gap="md">
          <Group gap="xs" wrap="wrap">
            <Code>{data.song.songId}</Code>
            {data.song.legacySongId && data.song.legacySongId !== data.song.songId && (
              <Text size="xs" c="dimmed" title="The legacy songId the manifest’s lineage is keyed by">
                legacy <Code>{data.song.legacySongId}</Code>
              </Text>
            )}
            <Text size="sm">{data.song.artist}</Text>
            <Text size="sm" c="dimmed">
              · r{data.publication.revision}, {formatUtc(data.publication.publishedAt)}
            </Text>
          </Group>

          {data.manifest ? (
            <div>
              <Text size="xs" fw={600} mb={4}>
                Where this song came from
              </Text>
              <Group gap="lg" wrap="wrap">
                {Object.entries(LINEAGE_LABELS).map(([key, label]) => {
                  const value = lineage?.[key]
                  const names = Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)]
                  return (
                    <div key={key}>
                      <Text size="xs" c="dimmed">
                        {label}
                      </Text>
                      <Group gap={4}>
                        {names.length ? (
                          names.map((name) => (
                            <Badge key={name} size="sm" variant="light" tt="none">
                              {name}
                            </Badge>
                          ))
                        ) : (
                          <Text size="xs" c="dimmed" fs="italic">
                            none recorded
                          </Text>
                        )}
                      </Group>
                    </div>
                  )
                })}
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                From the publication’s provenance manifest (schema {data.manifest.schemaVersion}
                {coverage?.percent !== undefined
                  ? `, ${coverage.percent}% of ${coverage.leafFields} leaf fields traced`
                  : ''}
                ). It records the rule for each field and this song’s sources, not every candidate value.
              </Text>
            </div>
          ) : (
            <Alert color="gray" variant="light">
              This publication has no provenance manifest, so only its values are shown.
            </Alert>
          )}

          <Tabs defaultValue="song" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="song">Song</Tabs.Tab>
              {data.sheets.map((sheet) => (
                <Tabs.Tab key={sheet.id} value={sheet.id}>
                  {sheet.type} {sheet.difficulty}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel value="song" pt="sm">
              <FieldTable fields={data.fields} label="song" />
            </Tabs.Panel>
            {data.sheets.map((sheet) => (
              <Tabs.Panel key={sheet.id} value={sheet.id} pt="sm">
                <FieldTable fields={sheet.fields} label={`${sheet.type}-${sheet.difficulty}`} />
              </Tabs.Panel>
            ))}
          </Tabs>

          {inputs.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={4}>
                Build inputs
              </Text>
              <Table verticalSpacing={2} fz="xs" layout="fixed">
                <Table.Tbody>
                  {inputs.map(([name, input]) => (
                    <Table.Tr key={name}>
                      <Table.Td w="30%">
                        <Code style={{ overflowWrap: 'anywhere' }}>{name}</Code>
                      </Table.Td>
                      <Table.Td style={{ overflowWrap: 'anywhere' }}>{input?.path ?? ''}</Table.Td>
                      <Table.Td w="22%" visibleFrom="sm">
                        <Code title={input?.sha256}>{input?.sha256?.slice(0, 12)}</Code>
                      </Table.Td>
                      <Table.Td w="14%" ta="right">
                        {input?.recordCount?.toLocaleString('en') ?? ''}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          )}
        </Stack>
      )}
    </Card>
  )
}