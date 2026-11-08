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
  UnstyledButton,
} from '@mantine/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { adminClient, adminOrpc } from '../api'
import { routeHref } from '../route'

/**
 * dxdata publications (gekichumai/meta#50 Phase 3, slice 1): every receipt of a channel, newest first. Read-only: the
 * assembly line publishes; the admin only looks. The pipeline publishes hourly and most publications repeat the
 * previous catalog, so consecutive unchanged ones fold into one row that expands on click.
 */
export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} kB`

/** `2026-11-07 08:00 UTC`: absolute and zone-explicit, so two admins in different zones read the same thing */
export const formatUtc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`

const DEFAULT_CHANNEL = 'production-v1'
const COLUMNS = 9
const tabular = { fontVariantNumeric: 'tabular-nums' } as const

type Page = Awaited<ReturnType<typeof adminClient.catalog.publications>>
type Publication = Page['publications'][number]

export type PublicationItem =
  | { kind: 'row'; publication: Publication; index: number }
  | {
      kind: 'run'
      /** Newest first; each one's catalog equals the next older publication's */
      publications: Publication[]
      /** Index of the run's first (newest) publication on the page */
      index: number
      /** The publication the whole run repeats: the page row below it, or null when that is on the older page */
      base: Publication | null
    }

/**
 * Folds each stretch of consecutive publications that did not change the catalog into one run. The current
 * publication always stays its own row, so the channel's live catalog is never hidden.
 */
export const groupPublications = (publications: Publication[]): PublicationItem[] => {
  const items: PublicationItem[] = []
  let run: Publication[] = []
  const flush = (end: number) => {
    if (run.length > 0)
      items.push({ kind: 'run', publications: run, index: end - run.length, base: publications[end] ?? null })
    run = []
  }
  publications.forEach((publication, index) => {
    if (publication.changedFromPrevious === false && !publication.current) {
      run.push(publication)
      return
    }
    flush(index)
    items.push({ kind: 'row', publication, index })
  })
  flush(publications.length)
  return items
}

const runKey = (channel: string, run: { publications: Publication[] }) =>
  `${channel}:${run.publications[0]!.revision}:${run.publications.length}`

const signed = (n: number, unit: string) =>
  `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en')}\u00a0${Math.abs(n) === 1 ? unit : `${unit}s`}`

/** `+3 songs · +12 sheets` against the previous publication, or nothing when the counts did not move */
export const countDelta = (publication: Publication, previous: Publication | undefined) => {
  if (!previous) return null
  const parts = [
    publication.songCount !== previous.songCount && signed(publication.songCount - previous.songCount, 'song'),
    publication.sheetCount !== previous.sheetCount && signed(publication.sheetCount - previous.sheetCount, 'sheet'),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function Publications({ channel, before }: { channel?: string; before?: number }) {
  const query = useQuery({
    ...adminOrpc.catalog.publications.queryOptions({ input: { channel, before, limit: 50 } }),
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (key: string) =>
    setExpanded((keys) => {
      const next = new Set(keys)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const rowProps = (page: Page, publication: Publication, index: number) => ({
    publication,
    previous: page.publications[index + 1],
    // An API from before changedFromPrevious: every row with an older one counts as changed, as it was shown then
    hasPrevious: index < page.publications.length - 1 || page.nextBefore !== null,
    // page.channel, not the prop: while another channel loads, these rows are still the old one's
    channel: page.channel,
  })

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
        Each dxdata catalog the assembly line published on this channel. Publications that repeat the previous catalog
        are folded together. Times are UTC.
      </Text>

      {query.isPending && <Skeleton h={160} radius="md" aria-busy="true" aria-label="Loading publications" />}
      {query.isError && (
        <Alert color="red" variant="light" role="alert">
          Could not load publications. Try again in a moment.
        </Alert>
      )}
      {data && data.publications.length === 0 && (
        <Text size="sm" component="output" display="block">
          No publications on {data.channel} yet.
        </Text>
      )}
      {data && data.publications.length > 0 && (
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover verticalSpacing="xs" fz="sm">
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
                <Table.Th>Changes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groupPublications(data.publications).map((item) => {
                if (item.kind === 'row')
                  return (
                    <PublicationRow
                      key={item.publication.fingerprint}
                      {...rowProps(data, item.publication, item.index)}
                    />
                  )
                const key = runKey(data.channel, item)
                return (
                  <UnchangedRun key={key} run={item} expanded={expanded.has(key)} onToggle={() => toggle(key)}>
                    {item.publications.map((publication, offset) => (
                      <PublicationRow
                        key={publication.fingerprint}
                        {...rowProps(data, publication, item.index + offset)}
                        nested
                      />
                    ))}
                  </UnchangedRun>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {/* While another channel or page loads, the rows (and their cursor) are the previous query's: no paging until it lands */}
      {data && !query.isPlaceholderData && (before !== undefined || data.nextBefore !== null) && (
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

function UnchangedRun({
  run,
  expanded,
  onToggle,
  children,
}: {
  run: Extract<PublicationItem, { kind: 'run' }>
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const newest = run.publications[0]!
  const oldest = run.publications.at(-1)!
  const count = run.publications.length
  const revisions = count === 1 ? `r${newest.revision}` : `r${oldest.revision}–r${newest.revision}`
  const span =
    count === 1
      ? formatUtc(newest.publishedAt)
      : oldest.publishedAt.slice(0, 10) === newest.publishedAt.slice(0, 10)
        ? `${formatUtc(oldest.publishedAt).slice(0, 16)}–${formatUtc(newest.publishedAt).slice(11)}`
        : `${formatUtc(oldest.publishedAt).slice(0, 16)} – ${formatUtc(newest.publishedAt)}`
  return (
    <>
      <Table.Tr className="admin-run-row" data-expanded={expanded || undefined}>
        <Table.Td colSpan={COLUMNS} p={0}>
          <UnstyledButton
            onClick={onToggle}
            aria-expanded={expanded}
            className="admin-run-toggle"
            w="100%"
            px="sm"
            py={6}
          >
            <Group gap="xs" wrap="nowrap">
              <Text component="span" size="xs" c="dimmed" aria-hidden className="admin-run-chevron">
                ▸
              </Text>
              <Text component="span" size="sm" fw={500}>
                {count.toLocaleString('en')} unchanged {count === 1 ? 'publication' : 'publications'}
              </Text>
              <Text component="span" size="sm" c="dimmed" style={{ ...tabular, whiteSpace: 'nowrap' }}>
                {revisions} · {span} ·{' '}
                {run.base ? `same catalog as r${run.base.revision}` : 'continues on the older page'}
              </Text>
            </Group>
          </UnstyledButton>
        </Table.Td>
      </Table.Tr>
      {expanded && children}
    </>
  )
}

function PublicationRow({
  publication: p,
  previous,
  hasPrevious,
  channel,
  nested = false,
}: {
  publication: Publication
  previous: Publication | undefined
  hasPrevious: boolean
  channel: string
  nested?: boolean
}) {
  const changed = p.changedFromPrevious ?? (hasPrevious ? true : null)
  const delta = changed ? countDelta(p, previous) : null
  return (
    <Table.Tr className={nested ? 'admin-run-member' : undefined}>
      <Table.Td>
        <Group gap={6} wrap="nowrap" pl={nested ? 'md' : 0}>
          <Text fw={600} size="sm" style={tabular}>
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
      <Table.Td ta="right" style={tabular}>
        {p.songCount.toLocaleString('en')}
      </Table.Td>
      <Table.Td ta="right" style={tabular}>
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
      <Table.Td miw={120}>
        {changed === true && (
          <>
            <Anchor
              size="sm"
              style={{ whiteSpace: 'nowrap' }}
              href={routeHref('diff', { channel: channel === DEFAULT_CHANNEL ? undefined : channel, to: p.revision })}
            >
              vs previous
            </Anchor>
            {delta && (
              <Text size="xs" c="dimmed" style={tabular}>
                {delta}
              </Text>
            )}
          </>
        )}
        {changed === false && (
          <Text component="span" size="xs" c="dimmed">
            no change
          </Text>
        )}
        {changed === null && (
          <Text component="span" size="xs" c="dimmed">
            first
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  )
}