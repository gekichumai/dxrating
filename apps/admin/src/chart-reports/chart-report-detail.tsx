import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Alert, Badge, Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'
import { useId } from 'react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import { ChartReportEvidenceLinks, type ChartReportEvidenceLabels } from './chart-report-evidence-links'
import { ChartReportValue, type ChartReportValueLabels } from './chart-report-value'
import classes from './chart-report-detail.module.css'

type ChartReportDetailOutput = AdminContractOutputs['getChartReportDetail']
type ChartReportPublication = ChartReportDetailOutput['report']['capturedContext']['publication']
type ChartReportChart = ChartReportDetailOutput['report']['capturedContext']['chart']
type PublicChartReference = NonNullable<ChartReportDetailOutput['publicChartReference']>

const DEFAULT_PUBLIC_CHART_ORIGIN = 'https://dxrating.net'

export const buildPublicChartUrl = (reference: PublicChartReference, origin = DEFAULT_PUBLIC_CHART_ORIGIN): string =>
  new URL(
    `/songs/${encodeURIComponent(reference.legacySongId)}/${encodeURIComponent(reference.sheetType)}/${encodeURIComponent(reference.sheetDifficulty)}`,
    origin,
  ).href

export type ChartReportDetailLabels = {
  readonly accountStatus: string
  readonly actions: {
    readonly openPublicChart: string
    readonly openReporter: string
  }
  readonly capturedChart: string
  readonly capturedContext: string
  readonly capturedContextDescription: string
  readonly capturedPublication: string
  readonly catalogRunId: string
  readonly category: string
  readonly categoryLabel: (category: ChartReportDetailOutput['report']['category']) => string
  readonly chartId: string
  readonly chartLabel: string
  readonly channel: string
  readonly closedAt: string
  readonly closedBy: string
  readonly closedState: string
  readonly closureEvent: string
  readonly closureNote: string
  readonly currentContext: string
  readonly currentContextDescription: string
  readonly currentPublication: string
  readonly currentValue: string
  readonly dateTime: AdminDateTimeLabels
  readonly displayName: string
  readonly emailVerification: string
  readonly emailNotVerified: string
  readonly emailVerified: string
  readonly evidence: ChartReportEvidenceLabels
  readonly explanation: string
  readonly field: string
  readonly fieldLabel: (field: ChartReportDetailOutput['report']['fieldKey']) => string
  readonly fingerprint: string
  readonly history: string
  readonly immutableNotice: string
  readonly internalNoteAbsent: string
  readonly openState: string
  readonly publicChartUnavailable: string
  readonly reportId: string
  readonly reporter: string
  readonly reporterRole: string
  readonly reporterRoles: {
    readonly admin: string
    readonly superAdmin: string
    readonly user: string
  }
  readonly reporterStatuses: {
    readonly active: string
    readonly banExpires: string
    readonly permanentlyBanned: string
    readonly temporarilyBanned: string
  }
  readonly retiredContext: string
  readonly retiredContextDescription: string
  readonly revision: string
  readonly songId: string
  readonly songLabel: string
  readonly sourceUrls: string
  readonly submission: string
  readonly submissionEvent: string
  readonly submittedAt: string
  readonly submittedCurrentValue: string
  readonly submittedProposedValue: string
  readonly timelineDescription: string
  readonly title: string
  readonly userId: string
  readonly values: ChartReportValueLabels
}

export type ChartReportDetailProps = {
  readonly detail: ChartReportDetailOutput
  readonly labels: ChartReportDetailLabels
  readonly locale: string
  readonly publicChartOrigin?: string
}

const PublicationDescription = ({
  labels,
  publication,
}: {
  readonly labels: ChartReportDetailLabels
  readonly publication: ChartReportPublication
}) => (
  <dl className={classes.descriptionList}>
    <dt>{labels.channel}</dt>
    <dd>{publication.channel}</dd>
    <dt>{labels.catalogRunId}</dt>
    <dd>
      <Code className={classes.identifier}>{publication.catalogRunId}</Code>
    </dd>
    <dt>{labels.revision}</dt>
    <dd>
      <Code className={classes.identifier}>{publication.revision}</Code>
    </dd>
    <dt>{labels.fingerprint}</dt>
    <dd>
      <Code className={classes.identifier}>{publication.fingerprintSha256}</Code>
    </dd>
  </dl>
)

const ChartDescription = ({
  chart,
  labels,
}: {
  readonly chart: ChartReportChart
  readonly labels: ChartReportDetailLabels
}) => (
  <dl className={classes.descriptionList}>
    <dt>{labels.songLabel}</dt>
    <dd>{chart.songLabel}</dd>
    <dt>{labels.chartLabel}</dt>
    <dd>{chart.chartLabel}</dd>
    <dt>{labels.songId}</dt>
    <dd>
      <Code className={classes.identifier}>{chart.songId}</Code>
    </dd>
    <dt>{labels.chartId}</dt>
    <dd>
      <Code className={classes.identifier}>{chart.chartId}</Code>
    </dd>
  </dl>
)

const ReporterStatus = ({
  detail,
  labels,
  locale,
}: {
  readonly detail: ChartReportDetailOutput
  readonly labels: ChartReportDetailLabels
  readonly locale: string
}) => {
  const status = detail.reporter.accountStatus
  if (status.status === 'active') return <Badge color="teal">{labels.reporterStatuses.active}</Badge>
  if (status.status === 'permanently_banned') {
    return <Badge color="red">{labels.reporterStatuses.permanentlyBanned}</Badge>
  }
  return (
    <Stack gap={4}>
      <Badge color="orange">{labels.reporterStatuses.temporarilyBanned}</Badge>
      <Text c="dimmed" size="xs">
        {labels.reporterStatuses.banExpires}
      </Text>
      <AdminDateTime labels={labels.dateTime} locale={locale} value={status.expiresAt} />
    </Stack>
  )
}

const reporterRole = (detail: ChartReportDetailOutput, labels: ChartReportDetailLabels): string => {
  switch (detail.reporter.effectiveRole) {
    case 'user':
      return labels.reporterRoles.user
    case 'admin':
      return labels.reporterRoles.admin
    case 'super_admin':
      return labels.reporterRoles.superAdmin
  }
}

export const ChartReportDetail = ({
  detail,
  labels,
  locale,
  publicChartOrigin = DEFAULT_PUBLIC_CHART_ORIGIN,
}: ChartReportDetailProps) => {
  const titleId = useId()
  const report = detail.report
  const captured = report.capturedContext
  const current = detail.currentContext
  const publicChartUrl = detail.publicChartReference
    ? buildPublicChartUrl(detail.publicChartReference, publicChartOrigin)
    : null

  return (
    <Paper aria-labelledby={titleId} className={classes.root} component="article" p="lg" radius="lg" withBorder>
      <Stack gap="xl">
        <Group align="flex-start" justify="space-between" wrap="wrap">
          <Stack gap={5}>
            <Title className={classes.heading} id={titleId} order={2} size="h3">
              {labels.title}
            </Title>
            <Group gap="xs" wrap="wrap">
              <Text c="dimmed" size="sm">
                {labels.reportId}
              </Text>
              <Code className={classes.identifier}>{report.id}</Code>
            </Group>
          </Stack>
          <Badge color={report.state === 'open' ? 'blue' : 'gray'} size="lg" variant="light">
            {report.state === 'open' ? labels.openState : labels.closedState}
          </Badge>
        </Group>

        <Alert color="blue" role="note">
          <Text className={classes.description} size="sm">
            {labels.immutableNotice}
          </Text>
        </Alert>

        <section className={classes.section}>
          <Stack gap="lg">
            <Title className={classes.heading} order={3} size="h4">
              {labels.submission}
            </Title>
            <dl className={classes.descriptionList}>
              <dt>{labels.field}</dt>
              <dd>
                <Stack gap={4}>
                  <Text component="span">{labels.fieldLabel(report.fieldKey)}</Text>
                  <Code className={classes.identifier}>{report.fieldKey}</Code>
                </Stack>
              </dd>
              <dt>{labels.category}</dt>
              <dd>
                <Stack gap={4}>
                  <Text component="span">{labels.categoryLabel(report.category)}</Text>
                  <Code className={classes.identifier}>{report.category}</Code>
                </Stack>
              </dd>
              <dt>{labels.submittedAt}</dt>
              <dd>
                <AdminDateTime labels={labels.dateTime} locale={locale} value={report.createdAt} />
              </dd>
            </dl>
            <div className={classes.values}>
              <Stack className={classes.valueCard} gap="xs">
                <Text fw={600} size="sm">
                  {labels.submittedCurrentValue}
                </Text>
                <ChartReportValue labels={labels.values} value={report.submittedCurrentValue} />
              </Stack>
              <Stack className={classes.valueCard} gap="xs">
                <Text fw={600} size="sm">
                  {labels.submittedProposedValue}
                </Text>
                <ChartReportValue labels={labels.values} value={report.submittedProposedValue} />
              </Stack>
              <Stack className={classes.valueCard} gap="xs">
                <Text fw={600} size="sm">
                  {labels.currentValue}
                </Text>
                {current.availability === 'current' ? (
                  <ChartReportValue labels={labels.values} value={current.currentValue} />
                ) : (
                  <ChartReportValue labels={labels.values} present={false} />
                )}
              </Stack>
            </div>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {labels.explanation}
              </Text>
              <Text className={`${classes.description} ${classes.bodyText}`}>{report.explanation}</Text>
            </Stack>
          </Stack>
        </section>

        <section className={classes.section}>
          <Stack gap="md">
            <Title className={classes.heading} order={3} size="h4">
              {labels.sourceUrls}
            </Title>
            <ChartReportEvidenceLinks labels={labels.evidence} urls={report.sourceUrls} />
          </Stack>
        </section>

        <section className={classes.section}>
          <Stack gap="lg">
            <Stack gap={4}>
              <Title className={classes.heading} order={3} size="h4">
                {labels.capturedContext}
              </Title>
              <Text className={classes.description} c="dimmed" size="sm">
                {labels.capturedContextDescription}
              </Text>
            </Stack>
            <Stack gap="sm">
              <Text fw={600}>{labels.capturedChart}</Text>
              <ChartDescription chart={captured.chart} labels={labels} />
            </Stack>
            <Stack gap="sm">
              <Text fw={600}>{labels.capturedPublication}</Text>
              <PublicationDescription labels={labels} publication={captured.publication} />
            </Stack>
          </Stack>
        </section>

        <section className={classes.section}>
          <Stack gap="lg">
            <Stack gap={4}>
              <Title className={classes.heading} order={3} size="h4">
                {labels.currentContext}
              </Title>
              <Text className={classes.description} c="dimmed" size="sm">
                {labels.currentContextDescription}
              </Text>
            </Stack>
            {current.availability === 'current' ? (
              <>
                <ChartDescription chart={current.chart} labels={labels} />
                <Stack gap="sm">
                  <Text fw={600}>{labels.currentPublication}</Text>
                  <PublicationDescription labels={labels} publication={current.publication} />
                </Stack>
              </>
            ) : (
              <>
                <Alert color="gray" title={labels.retiredContext}>
                  <Text className={classes.description} size="sm">
                    {labels.retiredContextDescription}
                  </Text>
                </Alert>
                <dl className={classes.descriptionList}>
                  <dt>{labels.songId}</dt>
                  <dd>
                    <Code className={classes.identifier}>{current.songId}</Code>
                  </dd>
                  <dt>{labels.chartId}</dt>
                  <dd>
                    <Code className={classes.identifier}>{current.chartId}</Code>
                  </dd>
                </dl>
                <Stack gap="sm">
                  <Text fw={600}>{labels.currentPublication}</Text>
                  <PublicationDescription labels={labels} publication={current.publication} />
                </Stack>
              </>
            )}
            {publicChartUrl ? (
              <Button
                className={classes.trustedAction}
                component="a"
                href={publicChartUrl}
                leftSection={<IconExternalLink aria-hidden size={16} />}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                size="md"
                target="_blank"
                variant="light"
              >
                {labels.actions.openPublicChart}
              </Button>
            ) : (
              <Alert color="gray" role="note">
                {labels.publicChartUnavailable}
              </Alert>
            )}
          </Stack>
        </section>

        <section className={classes.section}>
          <Stack gap="lg">
            <Title className={classes.heading} order={3} size="h4">
              {labels.reporter}
            </Title>
            <dl className={classes.descriptionList}>
              <dt>{labels.displayName}</dt>
              <dd>{detail.reporter.displayName}</dd>
              <dt>{labels.userId}</dt>
              <dd>
                <Code className={classes.identifier}>{detail.reporter.userId}</Code>
              </dd>
              <dt>{labels.emailVerification}</dt>
              <dd>
                <Badge color={detail.reporter.emailVerified ? 'teal' : 'gray'}>
                  {detail.reporter.emailVerified ? labels.emailVerified : labels.emailNotVerified}
                </Badge>
              </dd>
              <dt>{labels.reporterRole}</dt>
              <dd>{reporterRole(detail, labels)}</dd>
              <dt>{labels.accountStatus}</dt>
              <dd>
                <ReporterStatus detail={detail} labels={labels} locale={locale} />
              </dd>
            </dl>
            <Button
              className={classes.trustedAction}
              component="a"
              href={`/users/${encodeURIComponent(detail.reporter.userId)}`}
              size="md"
              variant="default"
            >
              {labels.actions.openReporter}
            </Button>
          </Stack>
        </section>

        <section className={classes.section}>
          <Stack gap="md">
            <Stack gap={4}>
              <Title className={classes.heading} order={3} size="h4">
                {labels.history}
              </Title>
              <Text className={classes.description} c="dimmed" size="sm">
                {labels.timelineDescription}
              </Text>
            </Stack>
            <ol className={classes.timeline}>
              <li className={classes.timelineItem}>
                <Stack gap={4}>
                  <Text fw={600}>{labels.submissionEvent}</Text>
                  <AdminDateTime labels={labels.dateTime} locale={locale} value={report.createdAt} />
                </Stack>
              </li>
              {report.closure ? (
                <li className={classes.timelineItem}>
                  <Stack gap="xs">
                    <Text fw={600}>{labels.closureEvent}</Text>
                    <dl className={classes.descriptionList}>
                      <dt>{labels.closedAt}</dt>
                      <dd>
                        <AdminDateTime labels={labels.dateTime} locale={locale} value={report.closure.closedAt} />
                      </dd>
                      <dt>{labels.closedBy}</dt>
                      <dd>
                        <Code className={classes.identifier}>{report.closure.actorUserId}</Code>
                      </dd>
                      <dt>{labels.closureNote}</dt>
                      <dd>{report.closure.internalNote ?? labels.internalNoteAbsent}</dd>
                    </dl>
                  </Stack>
                </li>
              ) : null}
            </ol>
          </Stack>
        </section>
      </Stack>
    </Paper>
  )
}