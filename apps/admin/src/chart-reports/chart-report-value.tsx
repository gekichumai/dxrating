import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Code, Text } from '@mantine/core'
import classes from './chart-report-value.module.css'

type ChartReportValue = AdminContractOutputs['getChartReportDetail']['report']['submittedCurrentValue']

export type ChartReportValueLabels = {
  readonly absent: string
  readonly emptyString: string
  readonly falseValue: string
  readonly nullValue: string
  readonly trueValue: string
}

export type ChartReportValueProps = {
  readonly labels: ChartReportValueLabels
  readonly present?: boolean
  readonly value?: ChartReportValue
}

const ExactCode = ({ children }: { readonly children: string }) => <Code className={classes.code}>{children}</Code>

export const ChartReportValue = ({ labels, present = true, value }: ChartReportValueProps) => {
  if (!present || value === undefined) {
    return (
      <span className={classes.value} data-value-kind="absent">
        <Text className={classes.semanticLabel} component="span">
          {labels.absent}
        </Text>
      </span>
    )
  }

  if (value === null) {
    return (
      <span className={classes.value} data-value-kind="null">
        <ExactCode>null</ExactCode>
        <Text className={classes.semanticLabel} component="span">
          {labels.nullValue}
        </Text>
      </span>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <span className={classes.value} data-value-kind="boolean">
        <ExactCode>{String(value)}</ExactCode>
        <Text className={classes.semanticLabel} component="span">
          {value ? labels.trueValue : labels.falseValue}
        </Text>
      </span>
    )
  }

  if (typeof value === 'number') {
    return (
      <span className={classes.value} data-value-kind="number">
        <ExactCode>{String(value)}</ExactCode>
      </span>
    )
  }

  if (typeof value === 'string') {
    return (
      <span className={classes.value} data-value-kind="string">
        <ExactCode>{JSON.stringify(value)}</ExactCode>
        {value.length === 0 ? (
          <Text className={classes.semanticLabel} component="span">
            {labels.emptyString}
          </Text>
        ) : null}
      </span>
    )
  }

  return (
    <Code block className={`${classes.code} ${classes.block}`} data-value-kind="object">
      {JSON.stringify(value, null, 2)}
    </Code>
  )
}