import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChartReportValue, type ChartReportValueLabels } from './chart-report-value'

const labels: ChartReportValueLabels = {
  absent: 'Value absent',
  emptyString: 'Empty string',
  falseValue: 'False',
  nullValue: 'Null',
  trueValue: 'True',
}

const renderValue = (props: Omit<React.ComponentProps<typeof ChartReportValue>, 'labels'>) =>
  render(
    <MantineProvider>
      <ChartReportValue labels={labels} {...props} />
    </MantineProvider>,
  )

describe('chart-report exact value renderer', () => {
  it.each([
    ['false', { value: false }, 'boolean', 'false', labels.falseValue],
    ['zero', { value: 0 }, 'number', '0', null],
    ['empty string', { value: '' }, 'string', '""', labels.emptyString],
    ['null', { value: null }, 'null', 'null', labels.nullValue],
    ['absent', { present: false }, 'absent', labels.absent, null],
  ] as const)('distinguishes %s without truthiness coercion', (_name, props, kind, exact, semantic) => {
    const { container } = renderValue(props)

    expect(container.querySelector(`[data-value-kind="${kind}"]`)).toBeTruthy()
    expect(screen.getByText(exact)).toBeTruthy()
    if (semantic) expect(screen.getByText(semantic)).toBeTruthy()
  })

  it('quotes non-empty strings and renders numeric maps as exact JSON', () => {
    const { rerender } = renderValue({ value: 'false' })
    expect(screen.getByText('"false"')).toBeTruthy()
    expect(screen.queryByText(labels.falseValue)).toBeNull()

    rerender(
      <MantineProvider>
        <ChartReportValue labels={labels} value={{ intl: 12.7, jp: 0 }} />
      </MantineProvider>,
    )
    expect(screen.getByText(/"intl": 12\.7/)).toBeTruthy()
    expect(screen.getByText(/"jp": 0/)).toBeTruthy()
  })
})