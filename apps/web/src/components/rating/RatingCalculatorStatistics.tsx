import clsx from 'clsx'
import * as d3 from 'd3'
import { Button } from '@mui/material'
import compact from 'lodash-es/compact'
import { type FC, type HTMLAttributes, useEffect, useRef, useState } from 'react'
import { useMeasure } from 'react-use'
import { makeId } from '../../utils/random'
import { estimateLabelWidth, placeAverageLabel } from './averageLabel'
import { useRatingEntries } from './useRatingEntries'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

/**
 * The bucket colours, the same hues as the B15/B35 pills and row tints in the table. Palette variables, so the SVG
 * follows the theme without a redraw. Bars use the 600 step for at least 3:1 against the glass (1.4.11); the average
 * lines use a deeper step (both lighten on the dark theme).
 */
const BUCKET_COLORS = {
  b15: { bar: 'rgb(var(--c-amber-600))', line: 'rgb(var(--c-amber-800))', swatch: 'bg-amber-600' },
  b35: { bar: 'rgb(var(--c-cyan-600))', line: 'rgb(var(--c-cyan-800))', swatch: 'bg-cyan-600' },
} as const

const RatingCalculatorStatisticsFactItem: FC<{
  size: 'lg' | 'md'
  label: string
  value: number | string
  className?: string
}> = ({ size, label, value, className }) => (
  <div className={clsx('flex flex-col items-start gap-1 min-w-0', className)}>
    <div
      className={clsx('display-num font-semibold leading-[1.1] tracking-[-0.01em]', {
        'text-4xl': size === 'lg',
        'text-3xl': size === 'md',
      })}
    >
      {value}
    </div>
    <div className="text-sm font-semibold leading-tight text-secondary">{label}</div>
  </div>
)

const formatNumber = (value: number) => {
  if (Number.isFinite(value)) {
    return value.toFixed(0)
  }
  return '—'
}

interface RatingCalculatorStatisticsOverviewProps {
  className?: string
  style?: React.CSSProperties
  ref?: React.Ref<HTMLDivElement>
}

const BucketStatistics: FC<{
  title: string
  count: string
  subtotal: number | string
  min: number
  avg: number
  max: number
}> = ({ title, count, subtotal, min, avg, max }) => {
  const locale = useLocale()
  return (
    // Its columns come from BUCKET_STATISTICS_GRID, so the B15 and B35 figures line up whatever their digit counts
    <div className="col-span-full grid [grid-template-columns:subgrid] items-end gap-y-2 min-w-0">
      <h3 className="col-span-full m-0 flex flex-wrap items-baseline gap-x-1 leading-tight">
        <span className="text-lg font-semibold">{title}</span>
        <span className="text-sm font-normal text-secondary num">{count}</span>
      </h3>

      <RatingCalculatorStatisticsFactItem
        size="md"
        label={m.ratingCalculator_statistics_subtotal({}, { locale })}
        value={subtotal}
        className="pe-2"
      />
      <div className="h-12 w-px self-center bg-gray-300" aria-hidden="true" />
      <RatingCalculatorStatisticsFactItem
        size="md"
        label={m.ratingCalculator_statistics_min({}, { locale })}
        value={formatNumber(min)}
      />
      <RatingCalculatorStatisticsFactItem
        size="md"
        label={m.ratingCalculator_statistics_avg({}, { locale })}
        value={formatNumber(avg)}
      />
      <RatingCalculatorStatisticsFactItem
        size="md"
        label={m.ratingCalculator_statistics_max({}, { locale })}
        value={formatNumber(max)}
      />
    </div>
  )
}

// Subtotal, a divider, then min / avg / max: the trio is spaced tighter than its gap to the subtotal. Both buckets
// share these columns (BucketStatistics is a subgrid of them)
const BUCKET_STATISTICS_GRID = 'grid w-full grid-cols-[auto_1px_repeat(3,minmax(0,1fr))] gap-x-4 gap-y-4'

function RatingCalculatorStatisticsOverview({ className, style, ref }: RatingCalculatorStatisticsOverviewProps) {
  const { b35Entries, b15Entries, statistics } = useRatingEntries()
  const { b15Average, b35Average, b15Min, b35Min, b15Max, b35Max, b15Sum, b35Sum, b50Sum } = statistics
  const locale = useLocale()

  return (
    <div
      ref={ref}
      className={clsx('flex flex-col justify-center gap-4 text-fg-1 py-2 w-full', className)}
      style={style}
    >
      <RatingCalculatorStatisticsFactItem
        size="lg"
        label={m.ratingCalculator_statistics_total({}, { locale })}
        value={b50Sum}
      />

      <div className={BUCKET_STATISTICS_GRID}>
        <BucketStatistics
          title={m.ratingCalculator_statistics_best15({}, { locale })}
          count={m.ratingCalculator_statistics_entries({ current: b15Entries.length, total: 15 }, { locale })}
          subtotal={formatNumber(b15Sum)}
          min={b15Min}
          avg={b15Average}
          max={b15Max}
        />
        <BucketStatistics
          title={m.ratingCalculator_statistics_best35({}, { locale })}
          count={m.ratingCalculator_statistics_entries({ current: b35Entries.length, total: 35 }, { locale })}
          subtotal={formatNumber(b35Sum)}
          min={b35Min}
          avg={b35Average}
          max={b35Max}
        />
      </div>
    </div>
  )
}

const Histogram: FC<{
  b15Values: number[]
  b35Values: number[]
}> = ({ b15Values, b35Values }) => {
  const locale = useLocale()
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>()
  const id = useRef(makeId(12)).current

  const b15Avg = d3.mean(b15Values) ?? 0
  const b35Avg = d3.mean(b35Values) ?? 0

  const draw = () => {
    // The top margin holds the two average labels, one row each, above the bars and their count labels
    const margin = { top: 44, right: 10, bottom: 20, left: 25 }
    const width = containerRect.width - margin.left - margin.right
    const height = 300 - margin.top - margin.bottom

    const ticksIntervalRatio = width > 500 ? 1 : 2

    const root = d3
      .select(`#${id}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .attr('role', 'img')
      .attr(
        'aria-label',
        m.ratingCalculator_statistics_histogramLabel({ b15: b15Avg.toFixed(2), b35: b35Avg.toFixed(2) }, { locale }),
      )
    const svg = root.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)

    const min = Math.min(d3.min(b15Values) ?? 0, d3.min(b35Values) ?? 0) ?? 0
    const max = Math.max(d3.max(b15Values) ?? 0, d3.max(b35Values) ?? 0) ?? 0

    // snap xDomain to the interval of ticks, calculated from the min, max and ticksIntervalRatio values
    const xDomain = [
      (Math.floor(min / ticksIntervalRatio) - 1) * ticksIntervalRatio,
      (Math.ceil(max / ticksIntervalRatio) + 1) * ticksIntervalRatio,
    ]

    // X axis: scale and draw:
    const x = d3.scaleLinear().domain(xDomain).range([0, width])
    svg
      .append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks((max - min) / ticksIntervalRatio))

    // Create the histogram bins for both datasets
    const histogram = d3
      .histogram()
      .domain(x.domain() as [number, number])
      .thresholds(x.ticks((max - min) / ticksIntervalRatio))

    const bins1 = histogram(b15Values)
    const bins2 = histogram(b35Values)

    // Prepare bins for stacking
    const bins = bins1.map((bin, i) => ({
      x0: bin?.x0 ?? 0,
      x1: bin?.x1 ?? 0,
      y1: bin?.length ?? 0, // Count for b15Values
      y2: (bin?.length ?? 0) + (bins2[i]?.length ?? 0), // Stack count of b35Values on top of b15Values
    }))

    // Y axis: scale and draw:
    const y = d3
      .scaleLinear()
      .range([height, 0])
      .domain([0, d3.max(bins, (d) => d.y2) ?? 0]) // Use the max of y2 to include stacked height

    svg.append('g').call(
      d3.axisLeft(y).tickFormat((d) => {
        if (typeof d !== 'number') return ''
        if (d % 1 === 0) {
          return (d as number).toFixed(0)
        }
        return ''
      }),
    )

    // Tick labels in the page font at the caption size, not d3's 10px sans-serif
    svg.selectAll('.tick text').style('font-family', 'inherit').style('font-size', '0.75rem')

    // Draw bars for b15Values
    svg
      .selectAll('.bar1')
      .data(bins)
      .join('rect')
      .attr('class', 'bar1')
      .attr('x', (d) => x(d.x0 ?? 0) - Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2)
      .attr('y', (d) => y(d.y1) - 0.5)
      .attr('width', (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
      .attr('height', (d) => Math.max(0, height - y(d.y1)))
      .style('fill', BUCKET_COLORS.b15.bar)

    // Draw bars for b35Values stacked on top of b15Values
    svg
      .selectAll('.bar2')
      .data(bins)
      .join('rect')
      .attr('class', 'bar2')
      .attr('x', (d) => x(d.x0 ?? 0) - Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2)
      .attr('y', (d) => y(d.y2) - 0.5)
      .attr('width', (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
      .attr('height', (d) => Math.max(0, y(d.y1) - y(d.y2)))
      .style('fill', BUCKET_COLORS.b35.bar)

    // Add labels on the top center of the bars
    svg
      .selectAll('.label')
      .data(bins)
      .join('text')
      .attr('class', 'label')
      .attr('x', (d) => x((d.x1 + d.x0) / 2) - Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2)
      .attr('y', (d) => y(d.y2) - 5)
      .text((d) => (d.y2 === 0 ? '' : d.y2))
      .style('text-anchor', 'middle')
      .style('font-size', '0.75rem')
      .style('fill', 'currentColor')

    // A dashed vertical line at the average, labelled in its own row above the chart so the labels never overlap the
    // bars, their counts or each other
    const drawAverageLine = (avg: number, text: string, color: string, labelY: number) => {
      svg
        .append('line')
        .attr('x1', x(avg))
        .attr('x2', x(avg))
        .attr('y1', y(0) + 6)
        .attr('y2', labelY + 4)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3 2')
      const label = svg
        .append('text')
        .attr('y', labelY)
        .text(text)
        .style('text-anchor', 'start')
        .style('font-size', '0.75rem')
        .style('fill', 'currentColor')
      // Measure the rendered label so it flips or clamps to stay inside the SVG, whatever the width or locale
      const node = label.node()
      const measured = node?.getComputedTextLength?.() ?? 0
      const labelWidth = measured > 0 ? measured : estimateLabelWidth(text, 12)
      label.attr('x', placeAverageLabel(x(avg), labelWidth, -margin.left, width + margin.right))
    }

    drawAverageLine(
      b15Avg,
      m.ratingCalculator_statistics_b15Avg({ value: b15Avg.toFixed(2) }, { locale }),
      BUCKET_COLORS.b15.line,
      -32,
    )
    drawAverageLine(
      b35Avg,
      m.ratingCalculator_statistics_b35Avg({ value: b35Avg.toFixed(2) }, { locale }),
      BUCKET_COLORS.b35.line,
      -18,
    )
  }

  useEffect(() => {
    draw()

    return () => {
      d3.select(`#${id}`).selectAll('*').remove()
    }
  }, [id, containerRect, b15Values, b35Values])

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      {/* The legend: bucket is told by colour and by name, never colour alone */}
      <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-xs text-secondary">
        <li className="flex items-center gap-1.5">
          <span className={clsx('size-3 rounded-[var(--radius-xs)]', BUCKET_COLORS.b15.swatch)} aria-hidden="true" />
          {m.ratingCalculator_statistics_best15({}, { locale })}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={clsx('size-3 rounded-[var(--radius-xs)]', BUCKET_COLORS.b35.swatch)} aria-hidden="true" />
          {m.ratingCalculator_statistics_best35({}, { locale })}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-3 border-t-2 border-dashed border-current" aria-hidden="true" />
          {m.ratingCalculator_statistics_legendAverage({}, { locale })}
        </li>
      </ul>
      <div className="relative w-full select-none text-fg-1" id={id} />
    </div>
  )
}

function RatingCalculatorStatisticsDetails({
  className,
  ref,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  const locale = useLocale()
  const { b35Entries, b15Entries } = useRatingEntries()

  return (
    <div ref={ref} className={clsx('flex flex-col justify-center gap-4 text-fg-1 w-full', className)} {...rest}>
      <Histogram
        b35Values={compact(b35Entries.map((i) => i.rating?.ratingAwardValue))}
        b15Values={compact(b15Entries.map((i) => i.rating?.ratingAwardValue))}
      />
      <span className="text-secondary text-xs text-center select-none">
        {m.ratingCalculator_statistics_histogramHint({}, { locale })}
      </span>
    </div>
  )
}

export const RatingCalculatorStatistics: FC<{ titleId: string }> = ({ titleId }) => {
  const locale = useLocale()
  const [showHistogram, setShowHistogram] = useState(false)
  const { statistics } = useRatingEntries()
  const detailsVisible = showHistogram && statistics.b50Sum > 0

  return (
    <div className="rating-statistics">
      {/* The toggle sits on the title row in normal flow, so it never covers the total on narrow screens */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="section-title m-0">
          {m.ratingCalculator_breakdown_title({}, { locale })}
        </h2>
        {statistics.b50Sum > 0 && (
          <Button
            size="small"
            className="rating-statistics-toggle"
            aria-expanded={detailsVisible}
            onClick={() => setShowHistogram(!showHistogram)}
          >
            {detailsVisible
              ? m.ratingCalculator_statistics_showSummary({}, { locale })
              : m.ratingCalculator_statistics_histogramAvailable({}, { locale })}
          </Button>
        )}
      </div>
      {detailsVisible ? (
        <RatingCalculatorStatisticsDetails className="pt-2" />
      ) : (
        <RatingCalculatorStatisticsOverview className="rating-statistics-overview" />
      )}
    </div>
  )
}