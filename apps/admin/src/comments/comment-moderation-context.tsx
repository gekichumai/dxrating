import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Anchor, Badge, Button, Code, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useId, type ReactNode } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import classes from './comment-moderation-context.module.css'

type CommentModerationDetail = AdminContractOutputs['getCommentModerationDetail']
type CommentChart = CommentModerationDetail['comment']['chart']
type CommentState = CommentModerationDetail['state']
type AuthorBanState = CommentModerationDetail['author']['banState']
type ThreadItem = CommentModerationDetail['thread']['items'][number]
type CommentHistoryEvent = CommentModerationDetail['commentHistory']['items'][number]
type AuthorBanHistoryEvent = CommentModerationDetail['authorBanHistory']['items'][number]

export type CommentModerationContextLabels = {
  readonly title: string
  readonly actionsTitle: string
  readonly dateTime: AdminDateTimeLabels
  readonly selected: {
    readonly title: string
    readonly readOnly: string
    readonly originalBody: string
    readonly commentId: string
    readonly parentId: string
    readonly noParent: string
    readonly rootId: string
    readonly authorUserId: string
    readonly createdAt: string
  }
  readonly state: {
    readonly title: string
    readonly status: string
    readonly visible: string
    readonly deleted: string
    readonly neverModerated: string
    readonly stateVersion: string
    readonly actorUserId: string
    readonly moderatedAt: string
    readonly reason: string
  }
  readonly chart: {
    readonly title: string
    readonly current: string
    readonly historical: string
    readonly unresolved: string
    readonly song: string
    readonly chart: string
    readonly songId: string
    readonly chartId: string
    readonly legacyReference: string
    readonly legacySongId: string
    readonly sheetType: string
    readonly sheetDifficulty: string
    readonly openContext: string
    readonly publication: string
    readonly publicationChannel: string
    readonly catalogRunId: string
    readonly revision: string
  }
  readonly author: {
    readonly title: string
    readonly displayName: string
    readonly userId: string
    readonly email: string
    readonly emailVerification: string
    readonly verified: string
    readonly unverified: string
    readonly effectiveRole: string
    readonly roles: {
      readonly user: string
      readonly admin: string
      readonly superAdmin: string
    }
    readonly banState: string
    readonly banStatuses: {
      readonly unbanned: string
      readonly expired: string
      readonly temporary: string
      readonly permanent: string
    }
    readonly noActiveBan: string
    readonly reason: string
    readonly actorUserId: string
    readonly banStartedAt: string
    readonly expiresAt: string
    readonly evaluatedAt: string
    readonly openModeration: string
  }
  readonly thread: {
    readonly title: string
    readonly empty: string
    readonly partial: string
    readonly complete: string
    readonly deletedTombstone: string
    readonly visible: string
    readonly root: string
    readonly reply: string
    readonly depth: string
    readonly parentId: string
    readonly author: string
    readonly createdAt: string
    readonly selected: string
    readonly restart: string
    readonly continue: string
  }
  readonly commentHistory: {
    readonly title: string
    readonly empty: string
    readonly delete: string
    readonly restore: string
    readonly reason: string
    readonly noReason: string
    readonly actorUserId: string
    readonly occurredAt: string
    readonly eventId: string
    readonly restart: string
    readonly continue: string
  }
  readonly authorBanHistory: {
    readonly title: string
    readonly empty: string
    readonly temporaryBan: string
    readonly permanentBan: string
    readonly unban: string
    readonly reason: string
    readonly noReason: string
    readonly actorUserId: string
    readonly occurredAt: string
    readonly banStartedAt: string
    readonly expiresAt: string
    readonly eventId: string
    readonly restart: string
    readonly continue: string
  }
}

export type CommentModerationContextProps = {
  readonly actionContent?: ReactNode
  readonly authorBanHistoryCursor?: string
  readonly commentHistoryCursor?: string
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly onAuthorBanHistoryCursorChange: (cursor: string | undefined) => void
  readonly onCommentHistoryCursorChange: (cursor: string | undefined) => void
  readonly onThreadCursorChange: (cursor: string | undefined) => void
  readonly threadCursor?: string
}

const DescriptionList = ({ children }: { readonly children: ReactNode }) => (
  <dl className={classes.descriptionList}>{children}</dl>
)

const ContextSection = ({ children, title }: { readonly children: ReactNode; readonly title: string }) => {
  const titleId = useId()
  return (
    <Paper aria-labelledby={titleId} className={classes.section} component="section" p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title id={titleId} order={3} size="h4">
          {title}
        </Title>
        {children}
      </Stack>
    </Paper>
  )
}

const CursorControls = ({
  continueLabel,
  cursor,
  nextCursor,
  onCursorChange,
  restartLabel,
}: {
  readonly continueLabel: string
  readonly cursor?: string
  readonly nextCursor: string | null
  readonly onCursorChange: (cursor: string | undefined) => void
  readonly restartLabel: string
}) => {
  if (!cursor && !nextCursor) return null

  return (
    <Group gap="sm" justify="flex-end" wrap="wrap">
      {cursor ? (
        <Button mih={40} onClick={() => onCursorChange(undefined)} variant="default">
          {restartLabel}
        </Button>
      ) : null}
      {nextCursor ? (
        <Button mih={40} onClick={() => onCursorChange(nextCursor)} variant="default">
          {continueLabel}
        </Button>
      ) : null}
    </Group>
  )
}

const chartPresentation = (chart: CommentChart, labels: CommentModerationContextLabels['chart']) => {
  switch (chart.availability) {
    case 'current':
      return { color: 'green', label: labels.current }
    case 'historical':
      return { color: 'blue', label: labels.historical }
    case 'unresolved':
      return { color: 'gray', label: labels.unresolved }
  }
}

const roleLabel = (
  role: CommentModerationDetail['author']['effectiveRole'],
  labels: CommentModerationContextLabels['author']['roles'],
) => {
  switch (role) {
    case 'user':
      return labels.user
    case 'admin':
      return labels.admin
    case 'super_admin':
      return labels.superAdmin
  }
}

const stateColor = (state: CommentState['status']) => (state === 'visible' ? 'green' : 'gray')

const banStateColor = (state: AuthorBanState['status']) => {
  switch (state) {
    case 'unbanned':
      return 'green'
    case 'expired':
      return 'gray'
    case 'temporary':
      return 'orange'
    case 'permanent':
      return 'red'
  }
}

const SelectedEvidence = ({
  detail,
  labels,
  locale,
}: {
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
}) => (
  <ContextSection title={labels.selected.title}>
    <Group gap="sm" justify="space-between" wrap="wrap">
      <Text c="dimmed" size="sm">
        {labels.selected.originalBody}
      </Text>
      <Badge color="blue" variant="light">
        {labels.selected.readOnly}
      </Badge>
    </Group>
    <Paper className={classes.immutableBody} p="md" radius="sm" withBorder>
      <Text className={classes.bodyText}>{detail.comment.originalBody}</Text>
    </Paper>
    <DescriptionList>
      <dt>{labels.selected.commentId}</dt>
      <dd>
        <Code className={classes.identifier}>{detail.comment.id}</Code>
      </dd>
      <dt>{labels.selected.parentId}</dt>
      <dd>
        {detail.comment.parentId ? (
          <Code className={classes.identifier}>{detail.comment.parentId}</Code>
        ) : (
          labels.selected.noParent
        )}
      </dd>
      <dt>{labels.selected.rootId}</dt>
      <dd>
        <Code className={classes.identifier}>{detail.comment.rootId}</Code>
      </dd>
      <dt>{labels.selected.authorUserId}</dt>
      <dd>
        <Code className={classes.identifier}>{detail.comment.authorUserId}</Code>
      </dd>
      <dt>{labels.selected.createdAt}</dt>
      <dd>
        <AdminDateTime labels={labels.dateTime} locale={locale} value={detail.comment.createdAt} />
      </dd>
    </DescriptionList>
  </ContextSection>
)

const CurrentState = ({
  labels,
  locale,
  state,
}: {
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly state: CommentState
}) => {
  const statusLabel = state.status === 'visible' ? labels.state.visible : labels.state.deleted
  const initialState = state.status === 'visible' && state.stateVersion === null

  return (
    <ContextSection title={labels.state.title}>
      <Group gap="sm" wrap="wrap">
        <Badge color={stateColor(state.status)} variant="light">
          {statusLabel}
        </Badge>
        {initialState ? (
          <Badge color="gray" variant="outline">
            {labels.state.neverModerated}
          </Badge>
        ) : null}
      </Group>
      <DescriptionList>
        <dt>{labels.state.status}</dt>
        <dd>{statusLabel}</dd>
        {state.stateVersion ? (
          <>
            <dt>{labels.state.stateVersion}</dt>
            <dd>
              <Code className={classes.identifier}>{state.stateVersion}</Code>
            </dd>
          </>
        ) : null}
        {state.actorUserId ? (
          <>
            <dt>{labels.state.actorUserId}</dt>
            <dd>
              <Code className={classes.identifier}>{state.actorUserId}</Code>
            </dd>
          </>
        ) : null}
        {state.moderatedAt ? (
          <>
            <dt>{labels.state.moderatedAt}</dt>
            <dd>
              <AdminDateTime labels={labels.dateTime} locale={locale} value={state.moderatedAt} />
            </dd>
          </>
        ) : null}
        {state.status === 'deleted' ? (
          <>
            <dt>{labels.state.reason}</dt>
            <dd>{state.reason}</dd>
          </>
        ) : null}
      </DescriptionList>
    </ContextSection>
  )
}

const ChartContext = ({
  detail,
  labels,
}: {
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
}) => {
  const chart = detail.comment.chart
  const presentation = chartPresentation(chart, labels.chart)

  return (
    <ContextSection title={labels.chart.title}>
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Badge color={presentation.color} variant="light">
          {presentation.label}
        </Badge>
        {chart.chartId ? (
          <Anchor href={`/charts?chartId=${encodeURIComponent(chart.chartId)}`} size="sm">
            {labels.chart.openContext}
          </Anchor>
        ) : null}
      </Group>
      <DescriptionList>
        <dt>{labels.chart.song}</dt>
        <dd>{chart.songLabel}</dd>
        <dt>{labels.chart.chart}</dt>
        <dd>{chart.chartLabel}</dd>
        {chart.songId ? (
          <>
            <dt>{labels.chart.songId}</dt>
            <dd>
              <Code className={classes.identifier}>{chart.songId}</Code>
            </dd>
          </>
        ) : null}
        {chart.chartId ? (
          <>
            <dt>{labels.chart.chartId}</dt>
            <dd>
              <Code className={classes.identifier}>{chart.chartId}</Code>
            </dd>
          </>
        ) : null}
        <dt>{labels.chart.legacyReference}</dt>
        <dd>
          <Stack gap={2}>
            <Text size="sm">
              {labels.chart.legacySongId}: {chart.legacyReference.legacySongId}
            </Text>
            <Text size="sm">
              {labels.chart.sheetType}: {chart.legacyReference.sheetType}
            </Text>
            <Text size="sm">
              {labels.chart.sheetDifficulty}: {chart.legacyReference.sheetDifficulty}
            </Text>
          </Stack>
        </dd>
        {detail.activePublication ? (
          <>
            <dt>{labels.chart.publication}</dt>
            <dd>
              <Stack gap={2}>
                <Text size="sm">
                  {labels.chart.publicationChannel}: {detail.activePublication.channel}
                </Text>
                <Text size="sm">
                  {labels.chart.catalogRunId}: {detail.activePublication.catalogRunId}
                </Text>
                <Text size="sm">
                  {labels.chart.revision}: {detail.activePublication.revision}
                </Text>
              </Stack>
            </dd>
          </>
        ) : null}
      </DescriptionList>
    </ContextSection>
  )
}

const AuthorContext = ({
  detail,
  labels,
  locale,
}: {
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
}) => {
  const author = detail.author
  const banState = author.banState
  const banLabel = labels.author.banStatuses[banState.status]

  return (
    <ContextSection title={labels.author.title}>
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Badge color={banStateColor(banState.status)} variant="light">
          {banLabel}
        </Badge>
        <Anchor
          href={`/users/${encodeURIComponent(author.userId)}?sourceCommentId=${encodeURIComponent(detail.comment.id)}`}
          size="sm"
        >
          {labels.author.openModeration}
        </Anchor>
      </Group>
      {banState.status === 'unbanned' ? (
        <Text c="dimmed" size="sm">
          {labels.author.noActiveBan}
        </Text>
      ) : null}
      <DescriptionList>
        <dt>{labels.author.displayName}</dt>
        <dd>{author.displayName}</dd>
        <dt>{labels.author.userId}</dt>
        <dd>
          <Code className={classes.identifier}>{author.userId}</Code>
        </dd>
        <dt>{labels.author.email}</dt>
        <dd>{author.email}</dd>
        <dt>{labels.author.emailVerification}</dt>
        <dd>{author.emailVerified ? labels.author.verified : labels.author.unverified}</dd>
        <dt>{labels.author.effectiveRole}</dt>
        <dd>{roleLabel(author.effectiveRole, labels.author.roles)}</dd>
        <dt>{labels.author.banState}</dt>
        <dd>{banLabel}</dd>
        {banState.status !== 'unbanned' ? (
          <>
            <dt>{labels.author.reason}</dt>
            <dd>{banState.reason}</dd>
            <dt>{labels.author.actorUserId}</dt>
            <dd>
              <Code className={classes.identifier}>{banState.actorUserId}</Code>
            </dd>
            <dt>{labels.author.banStartedAt}</dt>
            <dd>
              <AdminDateTime labels={labels.dateTime} locale={locale} value={banState.banStartedAt} />
            </dd>
            {banState.expiresAt ? (
              <>
                <dt>{labels.author.expiresAt}</dt>
                <dd>
                  <AdminDateTime labels={labels.dateTime} locale={locale} value={banState.expiresAt} />
                </dd>
              </>
            ) : null}
          </>
        ) : null}
        <dt>{labels.author.evaluatedAt}</dt>
        <dd>
          <AdminDateTime labels={labels.dateTime} locale={locale} value={banState.evaluatedAt} />
        </dd>
      </DescriptionList>
    </ContextSection>
  )
}

const ThreadEntry = ({
  item,
  labels,
  locale,
  selectedCommentId,
}: {
  readonly item: ThreadItem
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly selectedCommentId: string
}) => {
  const deleted = item.state.status === 'deleted'
  const relationLabel = item.depth === 0 ? labels.thread.root : labels.thread.reply

  return (
    <Paper
      aria-label={`${relationLabel} ${item.id}`}
      className={classes.threadItem}
      component="li"
      data-thread-depth={item.depth}
      p="sm"
      style={{ marginInlineStart: `${Math.min(item.depth, 8) * 14}px` }}
      withBorder
    >
      <Stack gap="sm">
        <Group gap="xs" wrap="wrap">
          <Badge color={item.depth === 0 ? 'blue' : 'gray'} variant="outline">
            {relationLabel}
          </Badge>
          <Badge color={deleted ? 'gray' : 'green'} variant="light">
            {deleted ? labels.state.deleted : labels.thread.visible}
          </Badge>
          {item.id === selectedCommentId ? (
            <Badge color="indigo" variant="light">
              {labels.thread.selected}
            </Badge>
          ) : null}
        </Group>
        <Text className={deleted ? classes.tombstone : classes.bodyText}>
          {deleted ? labels.thread.deletedTombstone : item.originalBody}
        </Text>
        <DescriptionList>
          <dt>{labels.selected.commentId}</dt>
          <dd>
            <Code className={classes.identifier}>{item.id}</Code>
          </dd>
          <dt>{labels.thread.depth}</dt>
          <dd>{item.depth}</dd>
          {item.parentId ? (
            <>
              <dt>{labels.thread.parentId}</dt>
              <dd>
                <Code className={classes.identifier}>{item.parentId}</Code>
              </dd>
            </>
          ) : null}
          <dt>{labels.thread.author}</dt>
          <dd>
            {item.author.displayName} <Code className={classes.identifier}>{item.author.userId}</Code>
          </dd>
          <dt>{labels.thread.createdAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={item.createdAt} />
          </dd>
        </DescriptionList>
      </Stack>
    </Paper>
  )
}

const ThreadContext = ({
  cursor,
  detail,
  labels,
  locale,
  onCursorChange,
}: {
  readonly cursor?: string
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
}) => (
  <ContextSection title={labels.thread.title}>
    <Badge color={detail.thread.completeness === 'complete' ? 'green' : 'orange'} variant="light">
      {detail.thread.completeness === 'complete' ? labels.thread.complete : labels.thread.partial}
    </Badge>
    {detail.thread.items.length === 0 ? (
      <Text c="dimmed" size="sm">
        {labels.thread.empty}
      </Text>
    ) : (
      <ol className={classes.itemList}>
        {detail.thread.items.map((item) => (
          <ThreadEntry
            item={item}
            key={item.id}
            labels={labels}
            locale={locale}
            selectedCommentId={detail.comment.id}
          />
        ))}
      </ol>
    )}
    <CursorControls
      continueLabel={labels.thread.continue}
      cursor={cursor}
      nextCursor={detail.thread.nextCursor}
      onCursorChange={onCursorChange}
      restartLabel={labels.thread.restart}
    />
  </ContextSection>
)

const CommentHistoryEntry = ({
  event,
  labels,
  locale,
}: {
  readonly event: CommentHistoryEvent
  readonly labels: CommentModerationContextLabels
  readonly locale: string
}) => (
  <Paper className={classes.historyItem} component="li" p="sm" withBorder>
    <Stack gap="sm">
      <Badge color={event.action === 'delete' ? 'red' : 'green'} variant="light">
        {event.action === 'delete' ? labels.commentHistory.delete : labels.commentHistory.restore}
      </Badge>
      <DescriptionList>
        <dt>{labels.commentHistory.eventId}</dt>
        <dd>
          <Code className={classes.identifier}>{event.id}</Code>
        </dd>
        <dt>{labels.commentHistory.reason}</dt>
        <dd>{event.reason ?? labels.commentHistory.noReason}</dd>
        <dt>{labels.commentHistory.actorUserId}</dt>
        <dd>
          <Code className={classes.identifier}>{event.actorUserId}</Code>
        </dd>
        <dt>{labels.commentHistory.occurredAt}</dt>
        <dd>
          <AdminDateTime labels={labels.dateTime} locale={locale} value={event.createdAt} />
        </dd>
      </DescriptionList>
    </Stack>
  </Paper>
)

const CommentHistory = ({
  cursor,
  detail,
  labels,
  locale,
  onCursorChange,
}: {
  readonly cursor?: string
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
}) => (
  <ContextSection title={labels.commentHistory.title}>
    {detail.commentHistory.items.length === 0 ? (
      <Text c="dimmed" size="sm">
        {labels.commentHistory.empty}
      </Text>
    ) : (
      <ol className={classes.itemList}>
        {detail.commentHistory.items.map((event) => (
          <CommentHistoryEntry event={event} key={event.id} labels={labels} locale={locale} />
        ))}
      </ol>
    )}
    <CursorControls
      continueLabel={labels.commentHistory.continue}
      cursor={cursor}
      nextCursor={detail.commentHistory.nextCursor}
      onCursorChange={onCursorChange}
      restartLabel={labels.commentHistory.restart}
    />
  </ContextSection>
)

const authorBanHistoryPresentation = (
  event: AuthorBanHistoryEvent,
  labels: CommentModerationContextLabels['authorBanHistory'],
) => {
  if (event.action === 'unban') return { color: 'green', label: labels.unban }
  if (event.kind === 'temporary') return { color: 'orange', label: labels.temporaryBan }
  return { color: 'red', label: labels.permanentBan }
}

const AuthorBanHistoryEntry = ({
  event,
  labels,
  locale,
}: {
  readonly event: AuthorBanHistoryEvent
  readonly labels: CommentModerationContextLabels
  readonly locale: string
}) => {
  const presentation = authorBanHistoryPresentation(event, labels.authorBanHistory)

  return (
    <Paper className={classes.historyItem} component="li" p="sm" withBorder>
      <Stack gap="sm">
        <Badge color={presentation.color} variant="light">
          {presentation.label}
        </Badge>
        <DescriptionList>
          <dt>{labels.authorBanHistory.eventId}</dt>
          <dd>
            <Code className={classes.identifier}>{event.id}</Code>
          </dd>
          <dt>{labels.authorBanHistory.reason}</dt>
          <dd>{event.reason ?? labels.authorBanHistory.noReason}</dd>
          <dt>{labels.authorBanHistory.actorUserId}</dt>
          <dd>
            <Code className={classes.identifier}>{event.actorUserId}</Code>
          </dd>
          <dt>{labels.authorBanHistory.occurredAt}</dt>
          <dd>
            <AdminDateTime labels={labels.dateTime} locale={locale} value={event.createdAt} />
          </dd>
          {event.action === 'ban' ? (
            <>
              <dt>{labels.authorBanHistory.banStartedAt}</dt>
              <dd>
                <AdminDateTime labels={labels.dateTime} locale={locale} value={event.banStartedAt} />
              </dd>
              {event.expiresAt ? (
                <>
                  <dt>{labels.authorBanHistory.expiresAt}</dt>
                  <dd>
                    <AdminDateTime labels={labels.dateTime} locale={locale} value={event.expiresAt} />
                  </dd>
                </>
              ) : null}
            </>
          ) : null}
        </DescriptionList>
      </Stack>
    </Paper>
  )
}

const AuthorBanHistory = ({
  cursor,
  detail,
  labels,
  locale,
  onCursorChange,
}: {
  readonly cursor?: string
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationContextLabels
  readonly locale: string
  readonly onCursorChange: (cursor: string | undefined) => void
}) => (
  <ContextSection title={labels.authorBanHistory.title}>
    {detail.authorBanHistory.items.length === 0 ? (
      <Text c="dimmed" size="sm">
        {labels.authorBanHistory.empty}
      </Text>
    ) : (
      <ol className={classes.itemList}>
        {detail.authorBanHistory.items.map((event) => (
          <AuthorBanHistoryEntry event={event} key={event.id} labels={labels} locale={locale} />
        ))}
      </ol>
    )}
    <CursorControls
      continueLabel={labels.authorBanHistory.continue}
      cursor={cursor}
      nextCursor={detail.authorBanHistory.nextCursor}
      onCursorChange={onCursorChange}
      restartLabel={labels.authorBanHistory.restart}
    />
  </ContextSection>
)

export const CommentModerationContext = ({
  actionContent,
  authorBanHistoryCursor,
  commentHistoryCursor,
  detail,
  labels,
  locale,
  onAuthorBanHistoryCursorChange,
  onCommentHistoryCursorChange,
  onThreadCursorChange,
  threadCursor,
}: CommentModerationContextProps) => {
  const titleId = useId()

  return (
    <Stack aria-labelledby={titleId} className={classes.root} component="article" gap="lg">
      <Title id={titleId} order={2} size="h3">
        {labels.title}
      </Title>

      <SelectedEvidence detail={detail} labels={labels} locale={locale} />

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" verticalSpacing="md">
        <CurrentState labels={labels} locale={locale} state={detail.state} />
        <ChartContext detail={detail} labels={labels} />
      </SimpleGrid>

      <AuthorContext detail={detail} labels={labels} locale={locale} />
      <ThreadContext
        cursor={threadCursor}
        detail={detail}
        labels={labels}
        locale={locale}
        onCursorChange={onThreadCursorChange}
      />
      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md" verticalSpacing="md">
        <CommentHistory
          cursor={commentHistoryCursor}
          detail={detail}
          labels={labels}
          locale={locale}
          onCursorChange={onCommentHistoryCursorChange}
        />
        <AuthorBanHistory
          cursor={authorBanHistoryCursor}
          detail={detail}
          labels={labels}
          locale={locale}
          onCursorChange={onAuthorBanHistoryCursorChange}
        />
      </SimpleGrid>

      {actionContent ? <ContextSection title={labels.actionsTitle}>{actionContent}</ContextSection> : null}
    </Stack>
  )
}