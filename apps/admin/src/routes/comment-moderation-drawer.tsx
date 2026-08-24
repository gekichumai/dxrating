import { Drawer, Group, Skeleton, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useAdminAuth } from '../auth/admin-auth-context'
import { CommentModerationContext } from '../comments/comment-moderation-context'
import { CommentModerationControls } from '../comments/comment-moderation-controls'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { commentModerationDetailQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'

export type CommentModerationDrawerCursor = 'authorBanHistoryCursor' | 'commentHistoryCursor' | 'threadCursor'

export type CommentModerationDrawerProps = {
  readonly authorBanHistoryCursor?: string
  readonly commentHistoryCursor?: string
  readonly commentId: string
  readonly onClose: () => void
  readonly onCursorChange: (field: CommentModerationDrawerCursor, cursor: string | undefined) => void
  readonly onResetCursors: () => void
  readonly threadCursor?: string
}

export const CommentModerationDrawer = ({
  authorBanHistoryCursor,
  commentHistoryCursor,
  commentId,
  onClose,
  onCursorChange,
  onResetCursors,
  threadCursor,
}: CommentModerationDrawerProps) => {
  const { locale, t } = useAdminTranslation()
  const auth = useAdminAuth()
  const data = useAdminData()
  const parameters = {
    ...(threadCursor ? { threadCursor } : {}),
    ...(commentHistoryCursor ? { commentHistoryCursor } : {}),
    ...(authorBanHistoryCursor ? { authorBanHistoryCursor } : {}),
  }
  const detail = useQuery(commentModerationDetailQueryOptions(data, commentId, parameters))
  const hasContinuation = Boolean(threadCursor || commentHistoryCursor || authorBanHistoryCursor)
  const dateTime = { local: t('users.datetime.local'), utc: t('users.datetime.utc') }

  return (
    <Drawer
      closeButtonProps={{ 'aria-label': t('comments.drawer.close') }}
      onClose={onClose}
      opened
      position="right"
      size="xl"
      title={t('comments.drawer.title', { commentId })}
    >
      <Stack gap="lg">
        <Group justify="flex-end">
          <OperationalRefresh
            dataUpdatedAt={detail.dataUpdatedAt}
            isFetching={detail.isFetching}
            onRefresh={detail.refetch}
          />
        </Group>

        {detail.isPending ? (
          <Stack aria-live="polite" component="output" gap="sm">
            <Text size="sm">{t('comments.drawer.loading')}</Text>
            <Skeleton height={180} radius="md" />
            <Skeleton height={240} radius="md" />
          </Stack>
        ) : detail.error ? (
          <AdminErrorNotice
            error={detail.error}
            onRefresh={hasContinuation ? onResetCursors : undefined}
            onRetry={() => void detail.refetch()}
          />
        ) : detail.data && auth.status === 'authenticated' ? (
          <CommentModerationContext
            actionContent={
              <CommentModerationControls
                detail={detail.data}
                labels={{
                  title: t('comments.actions.title'),
                  deleteAction: t('comments.actions.delete'),
                  restoreAction: t('comments.actions.restore'),
                  reasonLabel: t('comments.actions.reason.label'),
                  reasonDescription: t('comments.actions.reason.description'),
                  reasonRequired: t('comments.actions.reason.required'),
                  reasonTooLong: t('comments.actions.reason.tooLong'),
                  deleteWarning: t('comments.actions.deleteWarning'),
                  restoreWarning: t('comments.actions.restoreWarning'),
                  targetCommentLabel: t('comments.actions.targetComment'),
                  targetAuthorLabel: t('comments.actions.targetAuthor'),
                  confirmDeleteTitle: t('comments.actions.confirmDeleteTitle'),
                  confirmDeleteDescription: t('comments.actions.confirmDeleteDescription'),
                  confirmDeleteAction: t('comments.actions.confirmDelete'),
                  confirmRestoreTitle: t('comments.actions.confirmRestoreTitle'),
                  confirmRestoreDescription: t('comments.actions.confirmRestoreDescription'),
                  confirmRestoreAction: t('comments.actions.confirmRestore'),
                  cancelAction: t('comments.actions.cancel'),
                  verificationRequired: t('comments.actions.verification.required'),
                  verificationCancelled: t('comments.actions.verification.cancelled'),
                  verificationCompleteRetry: t('comments.actions.verification.completeRetry'),
                  verifyIdentityAction: t('comments.actions.verifyIdentity'),
                  retryAction: t('comments.actions.retry'),
                  conflictError: t('comments.actions.errors.conflict'),
                  forbiddenError: t('comments.actions.errors.forbidden'),
                  genericError: t('comments.actions.errors.generic'),
                  refreshAction: t('comments.actions.refresh'),
                  disabledSelf: t('comments.actions.disabledSelf'),
                  disabledHierarchy: t('comments.actions.disabledHierarchy'),
                  disabledSuperAdmin: t('comments.actions.disabledSuperAdmin'),
                  disabledCapability: t('comments.actions.disabledCapability'),
                  successNotification: t('comments.actions.success'),
                }}
                principal={auth.principal}
              />
            }
            authorBanHistoryCursor={authorBanHistoryCursor}
            commentHistoryCursor={commentHistoryCursor}
            detail={detail.data}
            labels={{
              title: t('comments.context.title'),
              actionsTitle: t('comments.context.actionsTitle'),
              dateTime,
              selected: {
                title: t('comments.context.selected.title'),
                readOnly: t('comments.context.selected.readOnly'),
                originalBody: t('comments.context.selected.originalBody'),
                commentId: t('comments.context.selected.commentId'),
                parentId: t('comments.context.selected.parentId'),
                noParent: t('comments.context.selected.noParent'),
                rootId: t('comments.context.selected.rootId'),
                authorUserId: t('comments.context.selected.authorUserId'),
                createdAt: t('comments.context.selected.createdAt'),
              },
              state: {
                title: t('comments.context.state.title'),
                status: t('comments.context.state.status'),
                visible: t('comments.context.state.visible'),
                deleted: t('comments.context.state.deleted'),
                neverModerated: t('comments.context.state.neverModerated'),
                stateVersion: t('comments.context.state.stateVersion'),
                actorUserId: t('comments.context.state.actorUserId'),
                moderatedAt: t('comments.context.state.moderatedAt'),
                reason: t('comments.context.state.reason'),
              },
              chart: {
                title: t('comments.context.chart.title'),
                current: t('users.comments.currentChart'),
                historical: t('users.comments.historicalChart'),
                unresolved: t('users.comments.unresolvedChart'),
                song: t('users.comments.song'),
                chart: t('users.comments.chart'),
                songId: t('users.comments.songId'),
                chartId: t('users.comments.chartId'),
                legacyReference: t('users.comments.legacyReference'),
                legacySongId: t('users.comments.legacySongId'),
                sheetType: t('users.comments.sheetType'),
                sheetDifficulty: t('users.comments.sheetDifficulty'),
                openContext: t('comments.context.chart.openContext'),
                publication: t('comments.context.chart.publication'),
                publicationChannel: t('comments.context.chart.publicationChannel'),
                catalogRunId: t('comments.context.chart.catalogRunId'),
                revision: t('comments.context.chart.revision'),
              },
              author: {
                title: t('comments.context.author.title'),
                displayName: t('users.detail.displayName'),
                userId: t('users.detail.userId'),
                email: t('users.detail.email'),
                emailVerification: t('users.detail.emailVerification'),
                verified: t('users.detail.verified'),
                unverified: t('users.detail.unverified'),
                effectiveRole: t('users.detail.effectiveRole'),
                roles: {
                  user: t('users.role.user'),
                  admin: t('users.role.admin'),
                  superAdmin: t('users.role.superAdmin'),
                },
                banState: t('users.detail.currentBan'),
                banStatuses: {
                  unbanned: t('users.detail.banStatus.unbanned'),
                  expired: t('users.detail.banStatus.expired'),
                  temporary: t('users.detail.banStatus.temporary'),
                  permanent: t('users.detail.banStatus.permanent'),
                },
                noActiveBan: t('users.detail.noActiveBan'),
                reason: t('users.detail.reason'),
                actorUserId: t('users.detail.actorUserId'),
                banStartedAt: t('users.detail.banStartedAt'),
                expiresAt: t('users.detail.expiresAt'),
                evaluatedAt: t('users.detail.evaluatedAt'),
                openModeration: t('comments.context.author.openModeration'),
              },
              thread: {
                title: t('comments.context.thread.title'),
                empty: t('comments.context.thread.empty'),
                partial: t('comments.context.thread.partial'),
                complete: t('comments.context.thread.complete'),
                deletedTombstone: t('comments.context.thread.deletedTombstone'),
                visible: t('comments.context.state.visible'),
                root: t('users.comments.root'),
                reply: t('users.comments.reply'),
                depth: t('comments.context.thread.depth'),
                parentId: t('comments.context.selected.parentId'),
                author: t('comments.context.thread.author'),
                createdAt: t('users.comments.createdAt'),
                selected: t('comments.context.thread.selected'),
                restart: t('comments.context.pagination.restartThread'),
                continue: t('comments.context.pagination.continueThread'),
              },
              commentHistory: {
                title: t('comments.context.commentHistory.title'),
                empty: t('comments.context.commentHistory.empty'),
                delete: t('comments.context.commentHistory.delete'),
                restore: t('comments.context.commentHistory.restore'),
                reason: t('users.history.reason'),
                noReason: t('users.history.noReason'),
                actorUserId: t('users.history.actorUserId'),
                occurredAt: t('users.history.occurredAt'),
                eventId: t('comments.context.eventId'),
                restart: t('comments.context.pagination.restartCommentHistory'),
                continue: t('comments.context.pagination.continueCommentHistory'),
              },
              authorBanHistory: {
                title: t('comments.context.authorBanHistory.title'),
                empty: t('users.history.empty'),
                temporaryBan: t('users.history.temporaryBan'),
                permanentBan: t('users.history.permanentBan'),
                unban: t('users.history.unban'),
                reason: t('users.history.reason'),
                noReason: t('users.history.noReason'),
                actorUserId: t('users.history.actorUserId'),
                occurredAt: t('users.history.occurredAt'),
                banStartedAt: t('users.history.banStartedAt'),
                expiresAt: t('users.history.expiresAt'),
                eventId: t('comments.context.eventId'),
                restart: t('comments.context.pagination.restartBanHistory'),
                continue: t('comments.context.pagination.continueBanHistory'),
              },
            }}
            locale={locale}
            onAuthorBanHistoryCursorChange={(cursor) => onCursorChange('authorBanHistoryCursor', cursor)}
            onCommentHistoryCursorChange={(cursor) => onCursorChange('commentHistoryCursor', cursor)}
            onThreadCursorChange={(cursor) => onCursorChange('threadCursor', cursor)}
            threadCursor={threadCursor}
          />
        ) : null}
      </Stack>
    </Drawer>
  )
}