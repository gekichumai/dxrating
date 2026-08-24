import { Alert, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconArrowLeft, IconMessageCircle } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useAdminAuth } from '../auth/admin-auth-context'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { userModerationDetailQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import { UserBanControls } from '../users/user-ban-controls'
import { UserBanHistory } from '../users/user-ban-history'
import { UserModerationSummary } from '../users/user-moderation-summary'
import { UserRecentComments } from '../users/user-recent-comments'
import { validateUserDetailSearch } from '../users/user-route-search'
import classes from './user-detail-route.module.css'

const userDetailRouteApi = getRouteApi('/require-admin/workspace/admin-shell/users/$userId')

export const UserDetailRoute = () => {
  const { locale, t } = useAdminTranslation()
  const auth = useAdminAuth()
  const data = useAdminData()
  const { userId } = userDetailRouteApi.useParams()
  const search = validateUserDetailSearch(userDetailRouteApi.useSearch())
  const navigate = useNavigate({ from: '/users/$userId' })
  const detail = useQuery(userModerationDetailQueryOptions(data, userId))
  const dateTimeLabels = { local: t('users.datetime.local'), utc: t('users.datetime.utc') }

  const changeCursor = (field: 'banHistoryCursor' | 'commentsCursor', cursor: string | undefined) => {
    void navigate({
      search: (current) => ({ ...current, [field]: cursor }),
    })
  }

  return (
    <Stack className={classes.route} gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Button
          component={Link}
          leftSection={<IconArrowLeft aria-hidden="true" size={17} />}
          to="/users"
          variant="subtle"
        >
          {t('users.detail.backToResults')}
        </Button>
        <OperationalRefresh
          dataUpdatedAt={detail.dataUpdatedAt}
          isFetching={detail.isFetching}
          onRefresh={detail.refetch}
        />
      </Group>

      {search.sourceCommentId ? (
        <Alert color="blue" icon={<IconMessageCircle aria-hidden="true" size={18} />} variant="light">
          <Group gap="sm" justify="space-between" wrap="wrap">
            <Text size="sm">{t('users.detail.sourceComment', { commentId: search.sourceCommentId })}</Text>
            <Button
              component="a"
              href={`/comments?commentId=${encodeURIComponent(search.sourceCommentId)}`}
              size="xs"
              variant="default"
            >
              {t('users.comments.viewContext')}
            </Button>
          </Group>
        </Alert>
      ) : null}

      <SimpleGrid className={classes.primaryGrid} cols={{ base: 1, lg: 2 }} spacing="lg" verticalSpacing="lg">
        <UserModerationSummary
          labels={{
            title: t('users.detail.summaryTitle'),
            loading: t('users.detail.loading'),
            displayName: t('users.detail.displayName'),
            userId: t('users.detail.userId'),
            email: t('users.detail.email'),
            emailVerification: t('users.detail.emailVerification'),
            effectiveRole: t('users.detail.effectiveRole'),
            verified: t('users.detail.verified'),
            unverified: t('users.detail.unverified'),
            roles: {
              user: t('users.role.user'),
              admin: t('users.role.admin'),
              superAdmin: t('users.role.superAdmin'),
            },
            currentBan: t('users.detail.currentBan'),
            banStatus: t('users.detail.banStatus'),
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
            dateTime: dateTimeLabels,
          }}
          locale={locale}
          userId={userId}
        />

        {detail.data && auth.status === 'authenticated' ? (
          <UserBanControls
            labels={{
              title: t('users.actions.title'),
              permanentOption: t('users.actions.kind.permanent'),
              temporaryOption: t('users.actions.kind.temporary'),
              reasonLabel: t('users.actions.reason.label'),
              reasonDisclosure: t('users.actions.reason.disclosure'),
              reasonRequired: t('users.actions.reason.required'),
              reasonTooLong: t('users.actions.reason.tooLong'),
              localTimeLabel: t('users.datetime.local'),
              utcTimeLabel: t('users.datetime.utc'),
              temporaryExpiryLabel: t('users.actions.expiry.label'),
              temporaryExpiryDescription: t('users.actions.expiry.description'),
              temporaryExpiryRequired: t('users.actions.expiry.required'),
              temporaryExpiryInvalid: t('users.actions.expiry.invalid'),
              temporaryExpiryNotFuture: t('users.actions.expiry.notFuture'),
              temporaryExpiryTooFar: t('users.actions.expiry.tooFar'),
              sessionRevocationWarning: t('users.actions.sessionRevocationWarning'),
              contentRetentionWarning: t('users.actions.contentRetentionWarning'),
              banAction: t('users.actions.ban'),
              unbanAction: t('users.actions.unban'),
              confirmBanTitle: t('users.actions.confirmBanTitle'),
              confirmBanDescription: t('users.actions.confirmBanDescription'),
              confirmBanAction: t('users.actions.confirmBan'),
              confirmUnbanTitle: t('users.actions.confirmUnbanTitle'),
              confirmUnbanDescription: t('users.actions.confirmUnbanDescription'),
              confirmUnbanAction: t('users.actions.confirmUnban'),
              cancelAction: t('users.actions.cancel'),
              verificationRequired: t('users.actions.verification.required'),
              verificationCancelled: t('users.actions.verification.cancelled'),
              verificationCompleteRetry: t('users.actions.verification.completeRetry'),
              verifyIdentityAction: t('users.actions.verifyIdentity'),
              retryAction: t('users.actions.retry'),
              conflictError: t('users.actions.errors.conflict'),
              forbiddenError: t('users.actions.errors.forbidden'),
              genericError: t('users.actions.errors.generic'),
              refreshAction: t('users.actions.refresh'),
              disabledSelf: t('users.actions.disabledSelf'),
              disabledHierarchy: t('users.actions.disabledHierarchy'),
              disabledSuperAdmin: t('users.actions.disabledSuperAdmin'),
              disabledCapability: t('users.actions.disabledCapability'),
              banSuccessNotification: t('users.actions.success.ban'),
              unbanSuccessNotification: t('users.actions.success.unban'),
            }}
            principal={auth.principal}
            user={detail.data}
          />
        ) : null}
      </SimpleGrid>

      {detail.error ? null : (
        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg" verticalSpacing="lg">
          <UserRecentComments
            cursor={search.commentsCursor}
            labels={{
              title: t('users.comments.title'),
              loading: t('users.comments.loading'),
              empty: t('users.comments.empty'),
              active: t('users.comments.active'),
              deleted: t('users.comments.deleted'),
              root: t('users.comments.root'),
              reply: t('users.comments.reply'),
              currentChart: t('users.comments.currentChart'),
              historicalChart: t('users.comments.historicalChart'),
              unresolvedChart: t('users.comments.unresolvedChart'),
              commentId: t('users.comments.commentId'),
              song: t('users.comments.song'),
              chart: t('users.comments.chart'),
              songId: t('users.comments.songId'),
              chartId: t('users.comments.chartId'),
              legacyReference: t('users.comments.legacyReference'),
              legacySongId: t('users.comments.legacySongId'),
              sheetType: t('users.comments.sheetType'),
              sheetDifficulty: t('users.comments.sheetDifficulty'),
              createdAt: t('users.comments.createdAt'),
              viewContext: t('users.comments.viewContext'),
              previewTruncated: t('users.comments.previewTruncated'),
              backToNewest: t('users.comments.backToNewest'),
              older: t('users.comments.older'),
              dateTime: dateTimeLabels,
            }}
            locale={locale}
            onCursorChange={(cursor) => changeCursor('commentsCursor', cursor)}
            userId={userId}
          />

          <UserBanHistory
            cursor={search.banHistoryCursor}
            labels={{
              title: t('users.history.title'),
              loading: t('users.history.loading'),
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
              backToNewest: t('users.history.backToNewest'),
              older: t('users.history.older'),
              dateTime: dateTimeLabels,
            }}
            locale={locale}
            onCursorChange={(cursor) => changeCursor('banHistoryCursor', cursor)}
            userId={userId}
          />
        </SimpleGrid>
      )}
    </Stack>
  )
}