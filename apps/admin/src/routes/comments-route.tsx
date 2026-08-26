import { Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowRight, IconRotateClockwise } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { CommentSearchForm } from '../comments/comment-search-form'
import { CommentSearchTable } from '../comments/comment-search-table'
import {
  COMMENT_LIST_SORT,
  commentListFiltersFromSearch,
  commentListQueryFromSearch,
  selectCommentInSearch,
  validateCommentListSearch,
  type CommentListFilters,
  type CommentListSearch,
} from '../comments/comment-route-search'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { recentCommentsQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import { CommentModerationDrawer, type CommentModerationDrawerCursor } from './comment-moderation-drawer'
import classes from './comments-route.module.css'

const commentsRouteApi = getRouteApi('/require-admin/workspace/admin-shell/comments')

export const CommentsRoute = () => {
  const { locale, t } = useAdminTranslation()
  const data = useAdminData()
  const search = validateCommentListSearch(commentsRouteApi.useSearch())
  const navigate = useNavigate({ from: '/comments' })
  const comments = useQuery(recentCommentsQueryOptions(data, commentListQueryFromSearch(search)))
  const rows = comments.data?.items ?? []

  const navigateToSearch = (next: CommentListSearch | CommentListFilters, replace = false) => {
    void navigate({ search: next, replace })
  }

  const applyFilters = (filters: CommentListFilters) => navigateToSearch(filters)
  const clearFilters = () => navigateToSearch({ sort: COMMENT_LIST_SORT })
  const restartResults = () => navigateToSearch(commentListFiltersFromSearch(search), true)
  const openComment = (commentId: string) => navigateToSearch(selectCommentInSearch(search, commentId))
  const closeComment = () => navigateToSearch(selectCommentInSearch(search, undefined), true)
  const changeDrawerCursor = (field: CommentModerationDrawerCursor, cursor: string | undefined) => {
    void navigate({ search: (current) => ({ ...current, [field]: cursor }) })
  }
  const resetDrawerCursors = () => {
    navigateToSearch(
      {
        ...search,
        threadCursor: undefined,
        commentHistoryCursor: undefined,
        authorBanHistoryCursor: undefined,
      },
      true,
    )
  }
  const nextPage = () => {
    if (!comments.data?.nextCursor) return
    navigateToSearch({ ...search, cursor: comments.data.nextCursor })
  }

  return (
    <Stack className={classes.root} gap="xl">
      <Group align="flex-end" className={classes.intro} gap="lg" justify="space-between">
        <Text c="dimmed" maw={760}>
          {t('page.comments.description')}
        </Text>
        <OperationalRefresh
          dataUpdatedAt={comments.dataUpdatedAt}
          isFetching={comments.isFetching}
          onRefresh={comments.refetch}
        />
      </Group>

      <CommentSearchForm
        labels={{
          title: t('comments.search.title'),
          description: t('comments.search.description'),
          formLabel: t('comments.search.formLabel'),
          authorUserId: t('comments.search.authorUserId'),
          authorUserIdPlaceholder: t('comments.search.authorUserIdPlaceholder'),
          chartId: t('comments.search.chartId'),
          chartIdPlaceholder: t('comments.search.chartIdPlaceholder'),
          status: t('comments.search.status'),
          anyStatus: t('comments.search.anyStatus'),
          activeStatus: t('comments.list.activeStatus'),
          deletedStatus: t('comments.list.deletedStatus'),
          createdAtFromInclusive: t('comments.search.createdAtFromInclusive'),
          createdAtBeforeExclusive: t('comments.search.createdAtBeforeExclusive'),
          localTimeDescription: t('comments.search.localTimeDescription'),
          clear: t('comments.search.clear'),
          submit: t('comments.search.submit'),
          validation: {
            authorUserId: t('comments.search.validation.authorUserId'),
            chartId: t('comments.search.validation.chartId'),
            status: t('comments.search.validation.status'),
            createdAtFromInclusive: t('comments.search.validation.createdAtFromInclusive'),
            createdAtBeforeExclusive: t('comments.search.validation.createdAtBeforeExclusive'),
            dateOrder: t('comments.search.validation.dateOrder'),
          },
        }}
        onClear={clearFilters}
        onSubmit={applyFilters}
        search={search}
      />

      {comments.error ? (
        <Stack gap="sm">
          <AdminErrorNotice
            error={comments.error}
            onRefresh={search.cursor ? restartResults : undefined}
            onRetry={() => void comments.refetch()}
          />
          {search.cursor ? (
            <Group align="center" gap="sm">
              <Text c="dimmed" size="sm">
                {t('comments.list.cursorRecovery')}
              </Text>
              <Button
                leftSection={<IconRotateClockwise aria-hidden="true" size={17} />}
                onClick={restartResults}
                size="sm"
                variant="default"
              >
                {t('comments.list.restart')}
              </Button>
            </Group>
          ) : null}
        </Stack>
      ) : null}

      <section aria-labelledby="comment-results-title">
        <Stack gap="md">
          <Group align="center" className={classes.resultsHeader} gap="md" justify="space-between">
            <Text fw={700} id="comment-results-title" size="lg">
              {t('comments.list.caption')}
            </Text>
            {comments.data ? (
              <Text c="dimmed" size="sm">
                {t('comments.list.count', { count: rows.length })}
              </Text>
            ) : null}
          </Group>

          <Text aria-live="polite" className={classes.liveRegion} component="output">
            {comments.isPending
              ? t('comments.list.loading')
              : comments.isFetching
                ? t('comments.list.loadingNext')
                : ''}
          </Text>

          {comments.isPending || comments.data ? (
            <CommentSearchTable
              labels={{
                caption: t('comments.list.caption'),
                tableRegion: t('comments.list.tableRegion'),
                loading: t('comments.list.loading'),
                emptyTitle: t('comments.list.emptyTitle'),
                emptyDescription: t('comments.list.emptyDescription'),
                newestFirst: t('comments.list.newestFirst'),
                columns: {
                  preview: t('comments.list.columns.preview'),
                  author: t('comments.list.columns.author'),
                  chart: t('comments.list.columns.chart'),
                  thread: t('comments.list.columns.thread'),
                  createdAt: t('comments.list.columns.createdAt'),
                  status: t('comments.list.columns.status'),
                  action: t('comments.list.columns.action'),
                },
                activeStatus: t('comments.list.activeStatus'),
                deletedStatus: t('comments.list.deletedStatus'),
                rootComment: t('comments.list.rootComment'),
                reply: t('comments.list.reply'),
                previewTruncated: t('comments.list.previewTruncated'),
                bannedAuthor: t('comments.list.bannedAuthor'),
                currentChart: t('users.comments.currentChart'),
                historicalChart: t('users.comments.historicalChart'),
                unresolvedChart: t('users.comments.unresolvedChart'),
                commentId: t('users.comments.commentId'),
                userId: t('users.detail.userId'),
                chartId: t('users.comments.chartId'),
                rootId: t('comments.context.selected.rootId'),
                parentId: t('comments.context.selected.parentId'),
                openUser: t('comments.list.openUser'),
                openChart: t('comments.list.openChart'),
                openDrawer: t('comments.list.openDrawer'),
                dateTime: { local: t('users.datetime.local'), utc: t('users.datetime.utc') },
              }}
              loading={comments.isPending}
              locale={locale}
              onOpenComment={openComment}
              rows={rows}
            />
          ) : null}

          {comments.data && rows.length > 0 ? (
            <Group className={classes.pagination} gap="md" justify="flex-end">
              {comments.data.nextCursor ? (
                <Button
                  disabled={comments.isFetching}
                  loading={comments.isFetching}
                  onClick={nextPage}
                  rightSection={<IconArrowRight aria-hidden="true" size={17} />}
                  variant="default"
                >
                  {t('comments.list.next')}
                </Button>
              ) : (
                <Text c="dimmed" size="sm">
                  {t('comments.list.end')}
                </Text>
              )}
            </Group>
          ) : null}
        </Stack>
      </section>

      {search.commentId ? (
        <CommentModerationDrawer
          authorBanHistoryCursor={search.authorBanHistoryCursor}
          commentHistoryCursor={search.commentHistoryCursor}
          commentId={search.commentId}
          onClose={closeComment}
          onCursorChange={changeDrawerCursor}
          onResetCursors={resetDrawerCursors}
          threadCursor={search.threadCursor}
        />
      ) : null}
    </Stack>
  )
}