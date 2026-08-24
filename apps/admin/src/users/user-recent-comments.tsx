import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Anchor, Badge, Button, Code, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { recentCommentsQueryOptions } from '../data/query-options'
import classes from './user-read-model.module.css'

type RecentComment = AdminContractOutputs['listRecentComments']['items'][number]
type CommentChart = RecentComment['chart']

export type UserRecentCommentsLabels = {
  readonly title: string
  readonly loading: string
  readonly empty: string
  readonly active: string
  readonly deleted: string
  readonly root: string
  readonly reply: string
  readonly currentChart: string
  readonly historicalChart: string
  readonly unresolvedChart: string
  readonly commentId: string
  readonly song: string
  readonly chart: string
  readonly songId: string
  readonly chartId: string
  readonly legacyReference: string
  readonly legacySongId: string
  readonly sheetType: string
  readonly sheetDifficulty: string
  readonly createdAt: string
  readonly viewContext: string
  readonly previewTruncated: string
  readonly backToNewest: string
  readonly older: string
  readonly dateTime: AdminDateTimeLabels
}

export type UserRecentCommentsProps = {
  readonly cursor?: string
  readonly labels: UserRecentCommentsLabels
  readonly limit?: number
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
  readonly userId: string
}

const chartPresentation = (chart: CommentChart, labels: UserRecentCommentsLabels) => {
  switch (chart.availability) {
    case 'current':
      return { color: 'green', label: labels.currentChart }
    case 'historical':
      return { color: 'blue', label: labels.historicalChart }
    case 'unresolved':
      return { color: 'gray', label: labels.unresolvedChart }
  }
}

const RecentCommentItem = ({
  comment,
  labels,
  locale,
}: {
  readonly comment: RecentComment
  readonly labels: UserRecentCommentsLabels
  readonly locale: string
}) => {
  const chart = chartPresentation(comment.chart, labels)

  return (
    <Paper className={classes.item} component="li" p="md" radius="md" withBorder>
      <Stack gap="md">
        <Group gap="xs" wrap="wrap">
          <Badge color={comment.status === 'active' ? 'green' : 'gray'} variant="light">
            {comment.status === 'active' ? labels.active : labels.deleted}
          </Badge>
          <Badge color={comment.parentId === null ? 'blue' : 'gray'} variant="outline">
            {comment.parentId === null ? labels.root : labels.reply}
          </Badge>
          <Badge color={chart.color} variant="outline">
            {chart.label}
          </Badge>
        </Group>

        <Stack gap={6}>
          <Text className={classes.preview}>{comment.bodyPreview}</Text>
          {comment.bodyPreviewTruncated ? (
            <Text c="dimmed" size="xs">
              {labels.previewTruncated}
            </Text>
          ) : null}
        </Stack>

        <dl className={classes.descriptionList}>
          <dt>{labels.commentId}</dt>
          <dd>
            <Code className={classes.identifier}>{comment.id}</Code>
          </dd>
          <dt>{labels.createdAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={comment.createdAt} />
          </dd>
          <dt>{labels.song}</dt>
          <dd>{comment.chart.songLabel}</dd>
          <dt>{labels.chart}</dt>
          <dd>{comment.chart.chartLabel}</dd>
          {comment.chart.songId ? (
            <>
              <dt>{labels.songId}</dt>
              <dd>
                <Code className={classes.identifier}>{comment.chart.songId}</Code>
              </dd>
            </>
          ) : null}
          {comment.chart.chartId ? (
            <>
              <dt>{labels.chartId}</dt>
              <dd>
                <Code className={classes.identifier}>{comment.chart.chartId}</Code>
              </dd>
            </>
          ) : null}
          <dt>{labels.legacyReference}</dt>
          <dd>
            <Stack gap={2}>
              <Text size="sm">
                {labels.legacySongId}: {comment.chart.legacyReference.legacySongId}
              </Text>
              <Text size="sm">
                {labels.sheetType}: {comment.chart.legacyReference.sheetType}
              </Text>
              <Text size="sm">
                {labels.sheetDifficulty}: {comment.chart.legacyReference.sheetDifficulty}
              </Text>
            </Stack>
          </dd>
        </dl>

        <Anchor href={`/comments?commentId=${encodeURIComponent(comment.id)}`} size="sm">
          {labels.viewContext}
        </Anchor>
      </Stack>
    </Paper>
  )
}

export const UserRecentComments = ({
  cursor,
  labels,
  limit,
  locale,
  onCursorChange,
  userId,
}: UserRecentCommentsProps) => {
  const data = useAdminData()
  const parameters = {
    authorUserId: userId,
    ...(cursor ? { cursor } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
  const query = useQuery(recentCommentsQueryOptions(data, parameters))
  const titleId = useId()

  return (
    <Paper
      aria-busy={query.isPending}
      aria-labelledby={titleId}
      className={classes.panel}
      component="section"
      p="lg"
      withBorder
    >
      <Stack gap="lg">
        <Title id={titleId} order={2} size="h3">
          {labels.title}
        </Title>
        {query.isPending ? (
          <Stack aria-live="polite" component="output" gap="sm">
            <Text size="sm">{labels.loading}</Text>
            <Skeleton height={148} radius="md" />
            <Skeleton height={148} radius="md" />
          </Stack>
        ) : query.error ? (
          <AdminErrorNotice
            error={query.error}
            onRefresh={() => (cursor ? onCursorChange(undefined) : void query.refetch())}
            onRetry={() => void query.refetch()}
          />
        ) : query.data ? (
          <Stack gap="md">
            {query.data.items.length === 0 ? (
              <Text c="dimmed" size="sm">
                {labels.empty}
              </Text>
            ) : (
              <ol className={classes.itemList}>
                {query.data.items.map((comment) => (
                  <RecentCommentItem comment={comment} key={comment.id} labels={labels} locale={locale} />
                ))}
              </ol>
            )}
            {cursor || query.data.nextCursor ? (
              <Group gap="sm" justify="flex-end" wrap="wrap">
                {cursor ? (
                  <Button onClick={() => onCursorChange(undefined)} variant="default">
                    {labels.backToNewest}
                  </Button>
                ) : null}
                {query.data.nextCursor ? (
                  <Button onClick={() => onCursorChange(query.data.nextCursor ?? undefined)} variant="default">
                    {labels.older}
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  )
}