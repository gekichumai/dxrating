import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Table, Text, ThemeIcon } from '@mantine/core'
import { IconChevronRight, IconMessageCircle, IconSearchOff } from '@tabler/icons-react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import classes from './comment-search-table.module.css'

export type CommentSearchRow = AdminContractOutputs['listRecentComments']['items'][number]

export type CommentSearchTableLabels = {
  readonly caption: string
  readonly tableRegion: string
  readonly loading: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly newestFirst: string
  readonly columns: {
    readonly preview: string
    readonly author: string
    readonly chart: string
    readonly thread: string
    readonly createdAt: string
    readonly status: string
    readonly action: string
  }
  readonly activeStatus: string
  readonly deletedStatus: string
  readonly rootComment: string
  readonly reply: string
  readonly previewTruncated: string
  readonly bannedAuthor: string
  readonly currentChart: string
  readonly historicalChart: string
  readonly unresolvedChart: string
  readonly commentId: string
  readonly userId: string
  readonly chartId: string
  readonly rootId: string
  readonly parentId: string
  readonly openUser: string
  readonly openChart: string
  readonly openDrawer: string
  readonly dateTime: AdminDateTimeLabels
}

export type CommentSearchTableProps = {
  readonly loading?: boolean
  readonly rows: readonly CommentSearchRow[]
  readonly labels: CommentSearchTableLabels
  readonly locale: string
  readonly onOpenComment: (commentId: string) => void
}

const chartPresentation = (chart: CommentSearchRow['chart'], labels: CommentSearchTableLabels) => {
  switch (chart.availability) {
    case 'current':
      return { color: 'green', label: labels.currentChart }
    case 'historical':
      return { color: 'blue', label: labels.historicalChart }
    case 'unresolved':
      return { color: 'gray', label: labels.unresolvedChart }
  }
}

const CommentAuthor = ({ comment, labels }: { comment: CommentSearchRow; labels: CommentSearchTableLabels }) => (
  <Stack gap={5}>
    <a
      aria-label={`${labels.openUser}: ${comment.author.displayName}`}
      href={`/users/${encodeURIComponent(comment.author.userId)}?sourceCommentId=${encodeURIComponent(comment.id)}`}
    >
      {comment.author.displayName}
    </a>
    <Group gap={6} wrap="wrap">
      <Text c="dimmed" size="xs">
        {labels.userId}
      </Text>
      <Code className={classes.identifier}>{comment.author.userId}</Code>
    </Group>
    {comment.author.isBanned ? (
      <Badge color="red" size="sm" variant="light">
        {labels.bannedAuthor}
      </Badge>
    ) : null}
  </Stack>
)

const CommentChart = ({ comment, labels }: { comment: CommentSearchRow; labels: CommentSearchTableLabels }) => {
  const presentation = chartPresentation(comment.chart, labels)
  const content = (
    <Stack gap={4}>
      <Text fw={600} size="sm">
        {comment.chart.songLabel}
      </Text>
      <Text c="dimmed" size="xs">
        {comment.chart.chartLabel}
      </Text>
    </Stack>
  )

  return (
    <Stack gap={6}>
      <Badge color={presentation.color} size="sm" variant="outline">
        {presentation.label}
      </Badge>
      {comment.chart.chartId === null ? (
        content
      ) : (
        <a
          aria-label={`${labels.openChart}: ${comment.chart.songLabel} — ${comment.chart.chartLabel}`}
          href={`/charts?chartId=${encodeURIComponent(comment.chart.chartId)}`}
        >
          {content}
        </a>
      )}
      {comment.chart.chartId === null ? null : (
        <Group gap={6} wrap="wrap">
          <Text c="dimmed" size="xs">
            {labels.chartId}
          </Text>
          <Code className={classes.identifier}>{comment.chart.chartId}</Code>
        </Group>
      )}
    </Stack>
  )
}

export const CommentSearchTable = ({
  loading = false,
  rows,
  labels,
  locale,
  onOpenComment,
}: CommentSearchTableProps) => {
  if (loading && rows.length === 0) {
    return (
      <Paper aria-live="polite" component="output" p="lg" radius="lg" withBorder>
        <Stack gap="sm">
          <Text size="sm">{labels.loading}</Text>
          <Skeleton height={42} radius="sm" />
          <Skeleton height={42} radius="sm" />
          <Skeleton height={42} radius="sm" />
        </Stack>
      </Paper>
    )
  }

  if (rows.length === 0) {
    return (
      <Paper component="section" p="xl" radius="lg" ta="center" withBorder>
        <Stack align="center" gap="xs">
          <ThemeIcon color="gray" radius="xl" size="xl" variant="light">
            <IconSearchOff aria-hidden="true" size={22} />
          </ThemeIcon>
          <Text fw={650}>{labels.emptyTitle}</Text>
          <Text c="dimmed" maw={520} size="sm">
            {labels.emptyDescription}
          </Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper component="section" radius="lg" shadow="xs" withBorder>
      <Text c="dimmed" p="md" pb={0} size="sm">
        {labels.newestFirst}
      </Text>
      <Table.ScrollContainer
        aria-label={labels.tableRegion}
        className={classes.scrollRegion}
        component="section"
        minWidth={1_120}
        tabIndex={0}
        type="native"
      >
        <Table aria-busy={loading} highlightOnHover horizontalSpacing="md" striped verticalSpacing="sm">
          <Table.Caption>{labels.caption}</Table.Caption>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{labels.columns.preview}</Table.Th>
              <Table.Th>{labels.columns.author}</Table.Th>
              <Table.Th>{labels.columns.chart}</Table.Th>
              <Table.Th>{labels.columns.thread}</Table.Th>
              <Table.Th>{labels.columns.createdAt}</Table.Th>
              <Table.Th>{labels.columns.status}</Table.Th>
              <Table.Th>{labels.columns.action}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((comment) => (
              <Table.Tr key={comment.id}>
                <Table.Td>
                  <Stack gap={6}>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.commentId}
                      </Text>
                      <Code className={classes.identifier}>{comment.id}</Code>
                    </Group>
                    <Text className={classes.preview} size="sm">
                      {comment.bodyPreview}
                    </Text>
                    {comment.bodyPreviewTruncated ? (
                      <Text c="dimmed" size="xs">
                        {labels.previewTruncated}
                      </Text>
                    ) : null}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <CommentAuthor comment={comment} labels={labels} />
                </Table.Td>
                <Table.Td>
                  <CommentChart comment={comment} labels={labels} />
                </Table.Td>
                <Table.Td>
                  <Stack gap={6}>
                    <Badge color={comment.parentId === null ? 'blue' : 'gray'} size="sm" variant="outline">
                      {comment.parentId === null ? labels.rootComment : labels.reply}
                    </Badge>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.rootId}
                      </Text>
                      <Code className={classes.identifier}>{comment.rootId}</Code>
                    </Group>
                    {comment.parentId === null ? null : (
                      <Group gap={6} wrap="wrap">
                        <Text c="dimmed" size="xs">
                          {labels.parentId}
                        </Text>
                        <Code className={classes.identifier}>{comment.parentId}</Code>
                      </Group>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td className={classes.timestamp}>
                  <AdminDateTime labels={labels.dateTime} locale={locale} value={comment.createdAt} />
                </Table.Td>
                <Table.Td>
                  <Badge color={comment.status === 'active' ? 'green' : 'gray'} variant="light">
                    {comment.status === 'active' ? labels.activeStatus : labels.deletedStatus}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    leftSection={<IconMessageCircle aria-hidden="true" size={16} />}
                    onClick={() => onOpenComment(comment.id)}
                    rightSection={<IconChevronRight aria-hidden="true" size={15} />}
                    size="xs"
                    variant="subtle"
                  >
                    {labels.openDrawer}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  )
}