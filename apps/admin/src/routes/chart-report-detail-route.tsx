import { Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ChartReportCloseControls } from '../chart-reports/chart-report-close-controls'
import { ChartReportDetail } from '../chart-reports/chart-report-detail'
import { chartReportCategoryLabels, chartReportFieldLabels } from '../chart-reports/chart-report-labels'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { chartReportDetailQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import classes from './chart-report-detail-route.module.css'

const chartReportDetailRouteApi = getRouteApi('/require-admin/workspace/admin-shell/chart-reports/$reportId')

export const ChartReportDetailRoute = () => {
  const { locale, t } = useAdminTranslation()
  const data = useAdminData()
  const { reportId } = chartReportDetailRouteApi.useParams()
  const detail = useQuery(chartReportDetailQueryOptions(data, reportId))
  const fieldLabels = chartReportFieldLabels(t)
  const categoryLabels = chartReportCategoryLabels(t)
  const dateTime = { local: t('users.datetime.local'), utc: t('users.datetime.utc') }

  return (
    <Stack className={classes.route} gap="lg">
      <Group className={classes.header} justify="space-between" wrap="wrap">
        <Button
          component={Link}
          leftSection={<IconArrowLeft aria-hidden="true" size={17} />}
          to="/chart-reports"
          variant="subtle"
        >
          {t('chartReports.actions.backToQueue')}
        </Button>
        <OperationalRefresh
          dataUpdatedAt={detail.dataUpdatedAt}
          isFetching={detail.isFetching}
          onRefresh={detail.refetch}
        />
      </Group>

      {detail.error ? <AdminErrorNotice error={detail.error} onRetry={() => void detail.refetch()} /> : null}

      {detail.isPending ? (
        <Paper aria-live="polite" component="output" p="lg" radius="lg" withBorder>
          <Text>{t('chartReports.detail.loading')}</Text>
        </Paper>
      ) : null}

      {detail.data ? (
        <SimpleGrid
          className={classes.contentGrid}
          cols={detail.data.report.state === 'open' ? { base: 1, xl: 2 } : 1}
          spacing="lg"
          verticalSpacing="lg"
        >
          <ChartReportDetail
            detail={detail.data}
            labels={{
              title: t('chartReports.detail.title'),
              accountStatus: t('chartReports.detail.accountStatus'),
              actions: {
                openPublicChart: t('chartReports.actions.openPublicChart'),
                openReporter: t('chartReports.actions.openReporter'),
              },
              capturedChart: t('chartReports.detail.capturedChart'),
              capturedContext: t('chartReports.detail.capturedContext'),
              capturedContextDescription: t('chartReports.detail.capturedContextDescription'),
              capturedPublication: t('chartReports.detail.capturedPublication'),
              catalogRunId: t('chartReports.detail.catalogRunId'),
              category: t('chartReports.detail.category'),
              categoryLabel: (category) => categoryLabels[category],
              chartId: t('chartReports.detail.chartId'),
              chartLabel: t('chartReports.detail.chartLabel'),
              channel: t('chartReports.detail.channel'),
              closedAt: t('chartReports.detail.closedAt'),
              closedBy: t('chartReports.detail.closedBy'),
              closedState: t('chartReports.detail.closedState'),
              closureEvent: t('chartReports.detail.closureEvent'),
              closureNote: t('chartReports.detail.closureNote'),
              currentContext: t('chartReports.detail.currentContext'),
              currentContextDescription: t('chartReports.detail.currentContextDescription'),
              currentPublication: t('chartReports.detail.currentPublication'),
              currentValue: t('chartReports.detail.currentValue'),
              dateTime,
              displayName: t('chartReports.detail.displayName'),
              emailVerification: t('chartReports.detail.emailVerification'),
              emailNotVerified: t('chartReports.detail.emailNotVerified'),
              emailVerified: t('chartReports.detail.emailVerified'),
              evidence: {
                cancel: t('chartReports.evidence.cancel'),
                copied: t('chartReports.evidence.copied'),
                copy: t('chartReports.evidence.copy'),
                copyUnavailable: t('chartReports.evidence.copyUnavailable'),
                description: t('chartReports.evidence.description'),
                domain: t('chartReports.evidence.domain'),
                invalid: t('chartReports.evidence.invalid'),
                leave: t('chartReports.evidence.leave'),
                none: t('chartReports.evidence.none'),
                open: t('chartReports.evidence.open'),
                url: t('chartReports.evidence.url'),
                warningDescription: t('chartReports.evidence.warningDescription'),
                warningTitle: t('chartReports.evidence.warningTitle'),
              },
              explanation: t('chartReports.detail.explanation'),
              field: t('chartReports.detail.field'),
              fieldLabel: (field) => fieldLabels[field],
              fingerprint: t('chartReports.detail.fingerprint'),
              history: t('chartReports.detail.history'),
              immutableNotice: t('chartReports.detail.immutableNotice'),
              internalNoteAbsent: t('chartReports.detail.internalNoteAbsent'),
              openState: t('chartReports.detail.openState'),
              publicChartUnavailable: t('chartReports.detail.publicChartUnavailable'),
              reportId: t('chartReports.detail.reportId'),
              reporter: t('chartReports.detail.reporter'),
              reporterRole: t('chartReports.detail.reporterRole'),
              reporterRoles: {
                user: t('chartReports.reporter.role.user'),
                admin: t('chartReports.reporter.role.admin'),
                superAdmin: t('chartReports.reporter.role.superAdmin'),
              },
              reporterStatuses: {
                active: t('chartReports.reporter.status.active'),
                banExpires: t('chartReports.reporter.status.banExpires'),
                permanentlyBanned: t('chartReports.reporter.status.permanentlyBanned'),
                temporarilyBanned: t('chartReports.reporter.status.temporarilyBanned'),
              },
              retiredContext: t('chartReports.detail.retiredContext'),
              retiredContextDescription: t('chartReports.detail.retiredContextDescription'),
              revision: t('chartReports.detail.revision'),
              songId: t('chartReports.detail.songId'),
              songLabel: t('chartReports.detail.songLabel'),
              sourceUrls: t('chartReports.detail.sourceUrls'),
              submission: t('chartReports.detail.submission'),
              submissionEvent: t('chartReports.detail.submissionEvent'),
              submittedAt: t('chartReports.detail.submittedAt'),
              submittedCurrentValue: t('chartReports.detail.submittedCurrentValue'),
              submittedProposedValue: t('chartReports.detail.submittedProposedValue'),
              timelineDescription: t('chartReports.detail.timelineDescription'),
              userId: t('users.detail.userId'),
              values: {
                absent: t('chartReports.values.absent'),
                emptyString: t('chartReports.values.emptyString'),
                falseValue: t('chartReports.values.false'),
                nullValue: t('chartReports.values.null'),
                trueValue: t('chartReports.values.true'),
              },
            }}
            locale={locale}
          />

          <ChartReportCloseControls
            detail={detail.data}
            labels={{
              cancel: t('chartReports.close.cancel'),
              confirm: t('chartReports.close.confirm'),
              confirmDescription: t('chartReports.close.confirmDescription'),
              confirmTitle: t('chartReports.close.confirmTitle'),
              description: t('chartReports.close.description'),
              errors: {
                conflict: t('chartReports.close.errors.conflict'),
                forbidden: t('chartReports.close.errors.forbidden'),
                generic: t('chartReports.close.errors.generic'),
              },
              noteDescription: t('chartReports.close.noteDescription'),
              noteLabel: t('chartReports.close.noteLabel'),
              notePlaceholder: t('chartReports.close.notePlaceholder'),
              noteTooLong: t('chartReports.close.noteTooLong'),
              openAction: t('chartReports.close.openAction'),
              refresh: t('actions.refreshCurrentState'),
              retry: t('chartReports.close.retry'),
              success: t('chartReports.close.success'),
              target: t('chartReports.close.target'),
              title: t('chartReports.close.title'),
            }}
          />
        </SimpleGrid>
      ) : null}
    </Stack>
  )
}