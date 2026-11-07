import {
  ANNOUNCEMENT_LOOKAHEAD_MS,
  ANNOUNCEMENT_PLATFORMS,
  ANNOUNCEMENT_REGIONS,
  ANNOUNCEMENT_SEVERITIES,
  SUPPORTED_LOCALES,
} from '@gekichumai/api-contract'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  NativeSelect,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { useRef, useState } from 'react'
import { adminClient, adminOrpc } from './api'

/**
 * Announcement authoring (gekichumai/meta#49, meta#50 L4b). Preview runs the same validation as Save (dryRun) and shows
 * what each language will read; Save writes and invalidates the public list at the edge.
 */
type Announcement = Awaited<ReturnType<typeof adminClient.announcements.list>>['announcements'][number]
type WriteResult = Awaited<ReturnType<typeof adminClient.announcements.create>>
type Text = Record<string, string>

interface Draft {
  /** Which opening of the editor this draft belongs to; a save result only carries over within the same one */
  session?: number
  id?: number
  /** The updatedAt this draft was read at; Save is refused (409) if someone saved since */
  updatedAt?: string
  severity: (typeof ANNOUNCEMENT_SEVERITIES)[number]
  title: Text
  body: Text
  linkUrl: string
  linkLabel: Text
  startsAt: string
  endsAt: string
  platforms: string[]
  regions: string[]
  minAppVersion: string
  maxAppVersion: string
  dismissible: boolean
}

let sessions = 0
const emptyDraft = (): Draft => ({
  session: ++sessions,
  severity: 'info',
  title: {},
  body: {},
  linkUrl: '',
  linkLabel: {},
  startsAt: '',
  endsAt: '',
  platforms: [],
  regions: [],
  minAppVersion: '',
  maxAppVersion: '',
  dismissible: true,
})

/** datetime-local works in the browser's zone; the API takes ISO 8601 */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

const draftFrom = (a: Announcement): Draft => ({
  session: ++sessions,
  id: a.id,
  updatedAt: a.updatedAt,
  severity: a.severity as Draft['severity'],
  title: a.title,
  body: a.body,
  linkUrl: a.link?.url ?? '',
  linkLabel: a.link?.label ?? {},
  startsAt: toLocalInput(a.startsAt),
  endsAt: toLocalInput(a.endsAt),
  platforms: a.platforms,
  regions: a.regions,
  minAppVersion: a.minAppVersion ?? '',
  maxAppVersion: a.maxAppVersion ?? '',
  dismissible: a.dismissible,
})

export const toInput = (draft: Draft) => ({
  severity: draft.severity,
  title: draft.title,
  body: draft.body,
  link: draft.linkUrl.trim()
    ? {
        url: draft.linkUrl.trim(),
        label: Object.values(draft.linkLabel).some((v) => v.trim()) ? draft.linkLabel : null,
      }
    : null,
  startsAt: fromLocalInput(draft.startsAt),
  endsAt: fromLocalInput(draft.endsAt),
  platforms: draft.platforms as (typeof ANNOUNCEMENT_PLATFORMS)[number][],
  regions: draft.regions as (typeof ANNOUNCEMENT_REGIONS)[number][],
  minAppVersion: draft.minAppVersion.trim() || null,
  maxAppVersion: draft.maxAppVersion.trim() || null,
  dismissible: draft.dismissible,
})

export const statusOf = (a: Pick<Announcement, 'startsAt' | 'endsAt'>, now = Date.now()) =>
  a.endsAt && Date.parse(a.endsAt) <= now ? 'ended' : Date.parse(a.startsAt) > now ? 'scheduled' : 'live'

const errorText = (error: unknown) =>
  error instanceof ORPCError ? `${error.code}: ${error.message}` : 'The request failed. Try again.'

const STATUS_COLOR = { live: 'teal', scheduled: 'blue', ended: 'gray' } as const
const SEVERITY_COLOR: Record<string, string> = { info: 'blue', warning: 'orange', critical: 'red' }

export function Announcements({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const list = useQuery(adminOrpc.announcements.list.queryOptions({ retry: false }))
  const [draft, setDraftState] = useState<Draft | null>(null)
  // The editor's current draft, readable from a mutation callback that finishes after later edits
  const draftRef = useRef<Draft | null>(null)
  const setDraft = (next: Draft | null | ((current: Draft | null) => Draft | null)) => {
    const value = typeof next === 'function' ? next(draftRef.current) : next
    draftRef.current = value
    setDraftState(value)
  }
  const [result, setResult] = useState<WriteResult | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminOrpc.announcements.list.key() })

  const write = useMutation({
    mutationFn: ({ draft, dryRun }: { draft: Draft; dryRun: boolean }) =>
      draft.id === undefined
        ? adminClient.announcements.create({ announcement: toInput(draft), dryRun })
        : adminClient.announcements.update({
            announcement: { ...toInput(draft), id: draft.id },
            dryRun,
            ifUpdatedAt: draft.updatedAt,
          }),
    onSuccess: (out, { draft: submitted, dryRun }) => {
      const unchanged = draftRef.current === submitted
      if (dryRun) {
        // A preview belongs to the draft it was asked for; ignore it if the editor has moved on
        if (unchanged) setResult(out)
        return
      }
      // Close the editor only if it still holds the draft that was saved, never a newer one. A newer draft of the same
      // announcement adopts the saved row's id and updatedAt, so saving it again updates (not duplicates) without a
      // conflict against the user's own earlier save.
      if (unchanged) setDraft(null)
      else if (out.announcement) {
        const saved = out.announcement
        setDraft((current) =>
          current && current.session === submitted.session
            ? { ...current, id: saved.id, updatedAt: saved.updatedAt }
            : current,
        )
      }
      setResult(out)
      void refresh()
    },
  })
  const end = useMutation({
    mutationFn: (id: number) => adminClient.announcements.end({ id }),
    onSuccess: () => void refresh(),
  })
  const endedTitle = end.data?.announcement.title.en

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setResult(null)
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }
  const setText = (key: 'title' | 'body' | 'linkLabel', locale: string, value: string) =>
    set(key, { ...draft![key], [locale]: value })
  const toggle = (key: 'platforms' | 'regions', value: string) =>
    set(key, draft![key].includes(value) ? draft![key].filter((v) => v !== value) : [...draft![key], value])

  const missing = (locale: string) => !draft?.title[locale]?.trim() || !draft?.body[locale]?.trim()

  return (
    <Card className="admin-glass" padding="lg" component="section" aria-labelledby="announcements-heading">
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h5" id="announcements-heading">
          Announcements
        </Title>
        {canWrite && !draft && (
          <Button size="xs" onClick={() => (setResult(null), setDraft(emptyDraft()))}>
            New announcement
          </Button>
        )}
      </Group>

      <Stack gap="xs">
        {end.isSuccess && (
          <Alert color="teal" variant="light" role="status" py="xs">
            Ended “{endedTitle}”. Edge cache: {end.data.edgeCache}.
          </Alert>
        )}
        {end.isError && (
          <Alert color="red" variant="light" role="alert" py="xs">
            Could not end it: {errorText(end.error)}
          </Alert>
        )}
        {result && !draft && (
          <Alert color="teal" variant="light" role="status" py="xs">
            Saved. Edge cache: {result.edgeCache}.
          </Alert>
        )}
      </Stack>

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            write.mutate({ draft, dryRun: false })
          }}
        >
          <Stack mt="md" gap="md">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <NativeSelect
                label="Severity"
                data={[...ANNOUNCEMENT_SEVERITIES]}
                value={draft.severity}
                onChange={(e) => set('severity', e.currentTarget.value as Draft['severity'])}
              />
              <TextInput
                type="datetime-local"
                label="Starts (empty: now)"
                value={draft.startsAt}
                onChange={(e) => set('startsAt', e.currentTarget.value)}
              />
              <TextInput
                type="datetime-local"
                label="Ends (empty: no end)"
                value={draft.endsAt}
                onChange={(e) => set('endsAt', e.currentTarget.value)}
              />
            </SimpleGrid>

            {draft.startsAt && Date.parse(fromLocalInput(draft.startsAt)!) - Date.now() > ANNOUNCEMENT_LOOKAHEAD_MS && (
              <Alert color="blue" variant="light" role="note" py="xs">
                Clients receive a scheduled notice up to 24 hours before it starts, so this one reaches them from{' '}
                {new Date(Date.parse(fromLocalInput(draft.startsAt)!) - ANNOUNCEMENT_LOOKAHEAD_MS).toLocaleString()}.
              </Alert>
            )}

            <div>
              <Text size="sm" fw={500}>
                Text
              </Text>
              <Text size="xs" c="dimmed" mb="xs">
                English is required. A language left empty falls back (see Preview).
              </Text>
              <Tabs defaultValue="en" keepMounted variant="outline">
                <Tabs.List style={{ flexWrap: 'wrap' }}>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <Tabs.Tab
                      key={locale}
                      value={locale}
                      rightSection={
                        missing(locale) ? (
                          <Badge size="xs" variant="light" color={locale === 'en' ? 'red' : 'gray'}>
                            {locale === 'en' ? 'required' : 'empty'}
                          </Badge>
                        ) : undefined
                      }
                    >
                      {locale}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
                {SUPPORTED_LOCALES.map((locale) => (
                  <Tabs.Panel key={locale} value={locale} pt="sm">
                    <Stack gap="xs">
                      <TextInput
                        label={`Title (${locale})`}
                        maxLength={80}
                        required={locale === 'en'}
                        withAsterisk={false}
                        value={draft.title[locale] ?? ''}
                        onChange={(e) => setText('title', locale, e.currentTarget.value)}
                      />
                      <Textarea
                        label={`Body (${locale})`}
                        rows={3}
                        maxLength={500}
                        required={locale === 'en'}
                        withAsterisk={false}
                        value={draft.body[locale] ?? ''}
                        onChange={(e) => setText('body', locale, e.currentTarget.value)}
                      />
                    </Stack>
                  </Tabs.Panel>
                ))}
              </Tabs>
            </div>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="Link (https URL or /path; optional)"
                value={draft.linkUrl}
                onChange={(e) => set('linkUrl', e.currentTarget.value)}
              />
              <TextInput
                label="Link label (en; optional)"
                maxLength={40}
                value={draft.linkLabel.en ?? ''}
                onChange={(e) => setText('linkLabel', 'en', e.currentTarget.value)}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Checkbox.Group
                label="Platforms (none: all)"
                value={draft.platforms}
                onChange={(v) => set('platforms', v)}
              >
                <Group mt={6}>
                  {ANNOUNCEMENT_PLATFORMS.map((p) => (
                    <Checkbox key={p} value={p} label={p} />
                  ))}
                </Group>
              </Checkbox.Group>
              <Checkbox.Group label="Regions (none: all)" value={draft.regions} onChange={(v) => set('regions', v)}>
                <Group mt={6}>
                  {ANNOUNCEMENT_REGIONS.map((r) => (
                    <Checkbox key={r} value={r} label={r} />
                  ))}
                </Group>
              </Checkbox.Group>
              <Switch
                mt="lg"
                label="Dismissible"
                checked={draft.dismissible}
                onChange={(e) => set('dismissible', e.currentTarget.checked)}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="iOS from version (optional)"
                placeholder="e.g. 1.2"
                value={draft.minAppVersion}
                onChange={(e) => set('minAppVersion', e.currentTarget.value)}
              />
              <TextInput
                label="iOS up to version (optional)"
                placeholder="e.g. 1.9"
                value={draft.maxAppVersion}
                onChange={(e) => set('maxAppVersion', e.currentTarget.value)}
              />
            </SimpleGrid>

            {write.isError && (
              <Alert color="red" variant="light" role="alert" py="xs">
                {errorText(write.error)}
              </Alert>
            )}

            {result?.dryRun && (
              <Card withBorder padding="sm" aria-label="Preview">
                <Text size="sm" fw={600} mb="xs">
                  Preview{result.revision !== undefined ? ` (revision ${result.revision})` : ''}
                </Text>
                <Stack gap={6}>
                  {Object.entries(result.preview.title).map(([locale, title]) => {
                    const body = result.preview.body[locale]
                    const label = result.preview.linkLabel?.[locale]
                    return (
                      <div key={locale}>
                        <Group gap={6} wrap="nowrap">
                          <Badge size="xs" variant="outline" tt="none" miw={64} style={{ flexShrink: 0 }}>
                            {locale}
                          </Badge>
                          <Text size="sm" fw={600}>
                            {title.text}
                          </Text>
                          {title.from !== locale && (
                            <Text size="xs" c="dimmed">
                              (title from {title.from})
                            </Text>
                          )}
                        </Group>
                        {body && (
                          <Text size="sm" ml={70} style={{ whiteSpace: 'pre-line' }}>
                            {body.text}
                            {body.from !== locale && (
                              <Text span size="xs" c="dimmed">
                                {' '}
                                (body from {body.from})
                              </Text>
                            )}
                          </Text>
                        )}
                        {label && (
                          <Text size="xs" c="dimmed" ml={70}>
                            Link: {label.text}
                            {label.from !== locale && ` (from ${label.from})`}
                          </Text>
                        )}
                      </div>
                    )
                  })}
                </Stack>
              </Card>
            )}

            <Group gap="xs">
              <Button
                variant="default"
                disabled={write.isPending}
                onClick={() => write.mutate({ draft, dryRun: true })}
              >
                Preview
              </Button>
              <Button type="submit" disabled={write.isPending}>
                Save
              </Button>
              <Button variant="subtle" color="gray" onClick={() => (setDraft(null), setResult(null))}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      )}

      {list.isError && (
        <Alert color="red" variant="light" role="alert" mt="sm" py="xs">
          {errorText(list.error)}
        </Alert>
      )}
      {list.isPending && <Skeleton h={80} mt="md" />}
      {list.data && list.data.announcements.length === 0 && !draft && (
        <Text size="sm" c="dimmed" mt="sm">
          No announcements yet.
        </Text>
      )}
      {list.data && list.data.announcements.length > 0 && (
        <Table.ScrollContainer minWidth={760} mt="md">
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Status</Table.Th>
                <Table.Th>Severity</Table.Th>
                <Table.Th>Title (en)</Table.Th>
                <Table.Th>Last change</Table.Th>
                {canWrite && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.data.announcements.map((a) => {
                const status = statusOf(a)
                return (
                  <Table.Tr key={a.id}>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={STATUS_COLOR[status]}
                        styles={{ root: { flexShrink: 0 }, label: { overflow: 'visible' } }}
                      >
                        {status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="outline"
                        color={SEVERITY_COLOR[a.severity] ?? 'gray'}
                        styles={{ root: { flexShrink: 0 }, label: { overflow: 'visible' } }}
                      >
                        {a.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {a.title.en}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        r{a.revision} · {a.updatedBy}
                      </Text>
                    </Table.Td>
                    {canWrite && (
                      <Table.Td>
                        {status !== 'ended' && (
                          <Group gap={6} justify="flex-end" wrap="nowrap">
                            <Button
                              size="compact-sm"
                              variant="default"
                              onClick={() => (setResult(null), setDraft(draftFrom(a)))}
                            >
                              Edit
                            </Button>
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="red"
                              disabled={end.isPending}
                              onClick={() => window.confirm(`End “${a.title.en}” now?`) && end.mutate(a.id)}
                            >
                              End
                            </Button>
                          </Group>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  )
}