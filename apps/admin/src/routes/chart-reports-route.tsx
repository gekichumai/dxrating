import { Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowRight, IconRotateClockwise } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { chartReportCategoryLabels, chartReportFieldLabels } from '../chart-reports/chart-report-labels'
import { ChartReportQueueTable } from '../chart-reports/chart-report-queue-table'
import {
  chartReportListFiltersFromSearch,
  chartReportListQueryFromSearch,
  validateChartReportListSearch,
  type ChartReportListFilters,
  type ChartReportListSearch,
} from '../chart-reports/chart-report-route-search'
import { ChartReportSearchForm } from '../chart-reports/chart-report-search-form'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { chartReportsQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import classes from './chart-reports-route.module.css'

const chartReportsRouteApi = getRouteApi('/require-admin/workspace/admin-shell/chart-reports')

export const ChartReportsRoute = () => {
  const { locale, t } = useAdminTranslation()
  const data = useAdminData()
  const search = validateChartReportListSearch(chartReportsRouteApi.useSearch())
  const navigate = useNavigate({ from: '/chart-reports' })
  const reports = useQuery(chartReportsQueryOptions(data, chartReportListQueryFromSearch(search)))
  const rows = reports.data?.items ?? []
  const fieldLabels = chartReportFieldLabels(t)
  const categoryLabels = chartReportCategoryLabels(t)

  const navigateToSearch = (next: ChartReportListSearch | ChartReportListFilters, replace = false) => {
    void navigate({ search: next, replace })
  }

  const applyFilters = (filters: ChartReportListFilters) => navigateToSearch(filters)
  const clearFilters = () => navigateToSearch({})
  const restartResults = () => navigateToSearch(chartReportListFiltersFromSearch(search), true)
  const nextPage = () => {
    if (!reports.data?.nextCursor) return
    navigateToSearch({ ...search, cursor: reports.data.nextCursor })
  }

  return (
    <Stack className={classes.root} gap="xl">
      <Group align="flex-end" className={classes.intro} gap="lg" justify="space-between">
        <Text c="dimmed" maw={760}>
          {t('page.chartReports.description')}
        </Text>
        <OperationalRefresh
          dataUpdatedAt={reports.dataUpdatedAt}
          isFetching={reports.isFetching}
          onRefresh={reports.refetch}
        />
      </Group>

      <ChartReportSearchForm
        disabled={reports.isFetching}
        labels={{
          title: t('chartReports.search.title'),
          description: t('chartReports.search.description'),
          formLabel: t('chartReports.search.formLabel'),
          state: t('chartReports.search.state'),
          anyState: t('chartReports.search.anyState'),
          openState: t('chartReports.search.stateOpen'),
          closedState: t('chartReports.search.stateClosed'),
          chartId: t('chartReports.search.chartId'),
          chartIdPlaceholder: t('chartReports.search.chartIdPlaceholder'),
          fieldKey: t('chartReports.search.field'),
          anyField: t('chartReports.search.anyField'),
          fieldLabels,
          category: t('chartReports.search.category'),
          anyCategory: t('chartReports.search.anyCategory'),
          categoryLabels,
          reporterUserId: t('chartReports.search.reporterUserId'),
          reporterUserIdPlaceholder: t('chartReports.search.reporterUserIdPlaceholder'),
          submittedAtFromInclusive: t('chartReports.search.submittedAtFromInclusive'),
          submittedAtBeforeExclusive: t('chartReports.search.submittedAtBeforeExclusive'),
          localTimeDescription: t('chartReports.search.localTimeDescription'),
          publicationRevision: t('chartReports.search.publicationRevision'),
          publicationRevisionPlaceholder: t('chartReports.search.publicationRevisionPlaceholder'),
          clear: t('chartReports.search.clear'),
          submit: t('chartReports.search.submit'),
          validation: {
            state: t('chartReports.search.validation.state'),
            chartId: t('chartReports.search.validation.chartId'),
            fieldKey: t('chartReports.search.validation.field'),
            category: t('chartReports.search.validation.category'),
            reporterUserId: t('chartReports.search.validation.reporterUserId'),
            submittedAtFromInclusive: t('chartReports.search.validation.submittedAtFromInclusive'),
            submittedAtBeforeExclusive: t('chartReports.search.validation.submittedAtBeforeExclusive'),
            publicationRevision: t('chartReports.search.validation.publicationRevision'),
            dateOrder: t('chartReports.search.validation.dateOrder'),
          },
        }}
        onClear={clearFilters}
        onSubmit={applyFilters}
        search={search}
      />

      {reports.error ? (
        <Stack gap="sm">
          <AdminErrorNotice
            error={reports.error}
            onRefresh={search.cursor ? restartResults : undefined}
            onRetry={() => void reports.refetch()}
          />
          {search.cursor ? (
            <Group align="center" gap="sm">
              <Text c="dimmed" size="sm">
                {t('chartReports.list.cursorRecovery')}
              </Text>
              <Button
                leftSection={<IconRotateClockwise aria-hidden="true" size={17} />}
                onClick={restartResults}
                size="sm"
                variant="default"
              >
                {t('chartReports.list.restart')}
              </Button>
            </Group>
          ) : null}
        </Stack>
      ) : null}

      <section aria-labelledby="chart-report-results-title">
        <Stack gap="md">
          <Group align="center" className={classes.resultsHeader} gap="md" justify="space-between">
            <Text fw={700} id="chart-report-results-title" size="lg">
              {t('chartReports.list.caption')}
            </Text>
            {reports.data ? (
              <Text c="dimmed" size="sm">
                {t('chartReports.list.count', { count: rows.length })}
              </Text>
            ) : null}
          </Group>

          <Text aria-live="polite" className={classes.liveRegion} component="output">
            {reports.isPending
              ? t('chartReports.list.loading')
              : reports.isFetching
                ? t('chartReports.list.loadingNext')
                : ''}
          </Text>

          {reports.isPending || reports.data ? (
            <ChartReportQueueTable
              labels={{
                caption: t('chartReports.list.caption'),
                tableRegion: t('chartReports.list.tableRegion'),
                loading: t('chartReports.list.loading'),
                emptyTitle: t('chartReports.list.emptyTitle'),
                emptyDescription: t('chartReports.list.emptyDescription'),
                fixedOrder: t('chartReports.list.order'),
                columns: {
                  report: t('chartReports.list.columns.report'),
                  chart: t('chartReports.list.columns.chart'),
                  proposedChange: t('chartReports.list.columns.proposedChange'),
                  reporter: t('chartReports.list.columns.reporter'),
                  publication: t('chartReports.list.columns.publication'),
                  submittedAt: t('chartReports.list.columns.submittedAt'),
                  state: t('chartReports.list.columns.status'),
                  action: t('chartReports.list.columns.action'),
                },
                openState: t('chartReports.list.state.open'),
                closedState: t('chartReports.list.state.closed'),
                reportId: t('chartReports.detail.reportId'),
                songId: t('chartReports.detail.songId'),
                chartId: t('chartReports.detail.chartId'),
                currentValue: t('chartReports.list.valueFrom'),
                proposedValue: t('chartReports.list.valueTo'),
                previewTruncated: t('chartReports.list.previewTruncated'),
                explanationTruncated: t('chartReports.list.explanationTruncated'),
                publicationRevision: t('chartReports.detail.revision'),
                catalogRunId: t('chartReports.detail.catalogRunId'),
                reporterUserId: t('users.detail.userId'),
                verifiedEmail: t('chartReports.reporter.emailVerified'),
                unverifiedEmail: t('chartReports.reporter.emailNotVerified'),
                accountActive: t('chartReports.reporter.status.active'),
                accountTemporarilyBanned: t('chartReports.reporter.status.temporarilyBanned'),
                accountPermanentlyBanned: t('chartReports.reporter.status.permanentlyBanned'),
                fieldLabels,
                categoryLabels,
                openReporter: t('chartReports.actions.openReporter'),
                openReport: t('chartReports.list.openDetail'),
                dateTime: { local: t('users.datetime.local'), utc: t('users.datetime.utc') },
              }}
              loading={reports.isPending}
              locale={locale}
              rows={rows}
            />
          ) : null}

          {reports.data && rows.length > 0 ? (
            <Group className={classes.pagination} gap="md" justify="flex-end">
              {reports.data.nextCursor ? (
                <Button
                  disabled={reports.isFetching}
                  loading={reports.isFetching}
                  onClick={nextPage}
                  rightSection={<IconArrowRight aria-hidden="true" size={17} />}
                  variant="default"
                >
                  {t('chartReports.list.next')}
                </Button>
              ) : (
                <Text c="dimmed" size="sm">
                  {t('chartReports.list.end')}
                </Text>
              )}
            </Group>
          ) : null}
        </Stack>
      </section>
    </Stack>
  )
}