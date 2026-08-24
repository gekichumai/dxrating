import {
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import { Badge, Button, Code, Group, Paper, Skeleton, Stack, Table, Text, ThemeIcon } from '@mantine/core'
import { IconChevronRight, IconClipboardSearch, IconSearchOff } from '@tabler/icons-react'
import { AdminDateTime, type AdminDateTimeLabels } from '../components/admin-date-time'
import classes from './chart-report-queue-table.module.css'

export type ChartReportQueueRow = AdminContractOutputs['listChartReports']['items'][number]

export type ChartReportQueueTableLabels = {
  readonly caption: string
  readonly tableRegion: string
  readonly loading: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly fixedOrder: string
  readonly columns: {
    readonly report: string
    readonly chart: string
    readonly proposedChange: string
    readonly reporter: string
    readonly publication: string
    readonly submittedAt: string
    readonly state: string
    readonly action: string
  }
  readonly openState: string
  readonly closedState: string
  readonly reportId: string
  readonly songId: string
  readonly chartId: string
  readonly currentValue: string
  readonly proposedValue: string
  readonly previewTruncated: string
  readonly explanationTruncated: string
  readonly publicationRevision: string
  readonly catalogRunId: string
  readonly reporterUserId: string
  readonly verifiedEmail: string
  readonly unverifiedEmail: string
  readonly accountActive: string
  readonly accountTemporarilyBanned: string
  readonly accountPermanentlyBanned: string
  readonly fieldLabels: Readonly<Record<AdminChartReportFieldKey, string>>
  readonly categoryLabels: Readonly<Record<AdminChartReportCategoryKey, string>>
  readonly openReporter: string
  readonly openReport: string
  readonly dateTime: AdminDateTimeLabels
}

export type ChartReportQueueTableProps = {
  readonly loading?: boolean
  readonly rows: readonly ChartReportQueueRow[]
  readonly labels: ChartReportQueueTableLabels
  readonly locale: string
}

const reporterAccountPresentation = (
  reporter: ChartReportQueueRow['reporter'],
  labels: ChartReportQueueTableLabels,
) => {
  switch (reporter.accountStatus.status) {
    case 'active':
      return { color: 'green', label: labels.accountActive }
    case 'temporarily_banned':
      return { color: 'orange', label: labels.accountTemporarilyBanned }
    case 'permanently_banned':
      return { color: 'red', label: labels.accountPermanentlyBanned }
  }
}

const ValuePreview = ({
  label,
  preview,
  labels,
}: {
  readonly label: string
  readonly preview: ChartReportQueueRow['currentValuePreview']
  readonly labels: ChartReportQueueTableLabels
}) => (
  <Stack gap={3}>
    <Text c="dimmed" size="xs">
      {label}
    </Text>
    <Code className={classes.valuePreview}>{preview.text}</Code>
    {preview.truncated ? (
      <Text c="dimmed" size="xs">
        {labels.previewTruncated}
      </Text>
    ) : null}
  </Stack>
)

const ChartContext = ({ report, labels }: { report: ChartReportQueueRow; labels: ChartReportQueueTableLabels }) => (
  <Stack gap={6}>
    <Stack gap={3}>
      <Text fw={600} size="sm">
        {report.chart.songLabel}
      </Text>
      <Text c="dimmed" size="xs">
        {report.chart.chartLabel}
      </Text>
    </Stack>
    <Group gap={6} wrap="wrap">
      <Text c="dimmed" size="xs">
        {labels.songId}
      </Text>
      <Code className={classes.identifier}>{report.chart.songId}</Code>
    </Group>
    <Group gap={6} wrap="wrap">
      <Text c="dimmed" size="xs">
        {labels.chartId}
      </Text>
      <Code className={classes.identifier}>{report.chart.chartId}</Code>
    </Group>
  </Stack>
)

const ReporterContext = ({ report, labels }: { report: ChartReportQueueRow; labels: ChartReportQueueTableLabels }) => {
  const account = reporterAccountPresentation(report.reporter, labels)
  return (
    <Stack gap={6}>
      <a
        aria-label={`${labels.openReporter}: ${report.reporter.displayName}`}
        href={`/users/${encodeURIComponent(report.reporter.userId)}`}
      >
        {report.reporter.displayName}
      </a>
      <Group gap={6} wrap="wrap">
        <Text c="dimmed" size="xs">
          {labels.reporterUserId}
        </Text>
        <Code className={classes.identifier}>{report.reporter.userId}</Code>
      </Group>
      <Group gap={6} wrap="wrap">
        <Badge color={account.color} size="sm" variant="light">
          {account.label}
        </Badge>
        <Badge color={report.reporter.emailVerified ? 'green' : 'gray'} size="sm" variant="outline">
          {report.reporter.emailVerified ? labels.verifiedEmail : labels.unverifiedEmail}
        </Badge>
      </Group>
    </Stack>
  )
}

export const ChartReportQueueTable = ({ loading = false, rows, labels, locale }: ChartReportQueueTableProps) => {
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
        {labels.fixedOrder}
      </Text>
      <Table.ScrollContainer
        aria-label={labels.tableRegion}
        className={classes.scrollRegion}
        component="section"
        minWidth={1_420}
        tabIndex={0}
        type="native"
      >
        <Table aria-busy={loading} highlightOnHover horizontalSpacing="md" striped verticalSpacing="sm">
          <Table.Caption>{labels.caption}</Table.Caption>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{labels.columns.report}</Table.Th>
              <Table.Th>{labels.columns.chart}</Table.Th>
              <Table.Th>{labels.columns.proposedChange}</Table.Th>
              <Table.Th>{labels.columns.reporter}</Table.Th>
              <Table.Th>{labels.columns.publication}</Table.Th>
              <Table.Th>{labels.columns.submittedAt}</Table.Th>
              <Table.Th>{labels.columns.state}</Table.Th>
              <Table.Th>{labels.columns.action}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((report, index) => (
              <Table.Tr key={`${report.id}-${index}`}>
                <Table.Td>
                  <Stack gap={6}>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.reportId}
                      </Text>
                      <Code className={classes.identifier}>{report.id}</Code>
                    </Group>
                    <Text className={classes.explanationPreview} size="sm">
                      {report.explanationPreview}
                    </Text>
                    {report.explanationPreviewTruncated ? (
                      <Text c="dimmed" size="xs">
                        {labels.explanationTruncated}
                      </Text>
                    ) : null}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <ChartContext labels={labels} report={report} />
                </Table.Td>
                <Table.Td>
                  <Stack gap="sm">
                    <Group gap={6} wrap="wrap">
                      <Badge color="indigo" size="sm" variant="light">
                        {labels.fieldLabels[report.fieldKey]}
                      </Badge>
                      <Badge color="gray" size="sm" variant="outline">
                        {labels.categoryLabels[report.category]}
                      </Badge>
                    </Group>
                    <ValuePreview label={labels.currentValue} labels={labels} preview={report.currentValuePreview} />
                    <ValuePreview label={labels.proposedValue} labels={labels} preview={report.proposedValuePreview} />
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <ReporterContext labels={labels} report={report} />
                </Table.Td>
                <Table.Td>
                  <Stack gap={6}>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.publicationRevision}
                      </Text>
                      <Code className={classes.identifier}>{report.capturedPublication.revision}</Code>
                    </Group>
                    <Group gap={6} wrap="wrap">
                      <Text c="dimmed" size="xs">
                        {labels.catalogRunId}
                      </Text>
                      <Code className={classes.identifier}>{report.capturedPublication.catalogRunId}</Code>
                    </Group>
                  </Stack>
                </Table.Td>
                <Table.Td className={classes.timestamp}>
                  <AdminDateTime labels={labels.dateTime} locale={locale} value={report.createdAt} />
                </Table.Td>
                <Table.Td>
                  <Badge color={report.state === 'open' ? 'orange' : 'gray'} variant="light">
                    {report.state === 'open' ? labels.openState : labels.closedState}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    component="a"
                    href={`/chart-reports/${encodeURIComponent(report.id)}`}
                    leftSection={<IconClipboardSearch aria-hidden="true" size={16} />}
                    mih={40}
                    rightSection={<IconChevronRight aria-hidden="true" size={15} />}
                    variant="subtle"
                  >
                    {labels.openReport}
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