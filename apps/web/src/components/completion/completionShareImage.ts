import type { ConstantTable } from '@/components/chartDiscovery/constantTables'
import {
  coverImageUrl,
  drawRoundedImage,
  loadCanvasImage,
  roundedRectPath,
  type ShareImageSpec,
} from '@/utils/shareImage/shareImage'
import {
  achievementRankLabel,
  COMBO_LABELS,
  COMPLETION_TARGET_LABELS,
  type CompletionRecord,
  type CompletionSummary,
  type CompletionTarget,
  meetsTarget,
} from './completion'

const WIDTH = 1080
const PADDING = 40
const COLUMNS = 10
const GAP = 8
const CELL = (WIDTH - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS
const GROUP_LABEL_HEIGHT = 34
const HEADER_HEIGHT = 150
const FOOTER_HEIGHT = 56
const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans CJK JP", sans-serif'

export interface CompletionShareImageInput {
  table: ConstantTable
  target: CompletionTarget
  summary: CompletionSummary
  title: string
  summaryLine: string
  recordOf: (sheetId: string) => CompletionRecord | undefined
  imageNameOf: (sheetId: string) => string | undefined
}

/** A cover grid of the level's charts, grouped by internal level; charts not meeting the target are dimmed */
export function buildCompletionShareImage(input: CompletionShareImageInput): ShareImageSpec {
  const { table } = input
  const gridHeight = table.groups.reduce(
    (sum, group) => sum + GROUP_LABEL_HEIGHT + Math.ceil(group.charts.length / COLUMNS) * (CELL + GAP),
    0,
  )
  const height = HEADER_HEIGHT + gridHeight + FOOTER_HEIGHT

  return {
    width: WIDTH,
    height,
    draw: async (context) => {
      const images = new Map<string, HTMLImageElement | null>()
      await Promise.all(
        table.groups.flatMap((group) =>
          group.charts.map(async (chart) => {
            const imageName = input.imageNameOf(chart.sheetId)
            images.set(chart.sheetId, imageName ? await loadCanvasImage(coverImageUrl(imageName)) : null)
          }),
        ),
      )

      const background = context.createLinearGradient(0, 0, WIDTH, height)
      background.addColorStop(0, '#1e1b4b')
      background.addColorStop(1, '#0f172a')
      context.fillStyle = background
      context.fillRect(0, 0, WIDTH, height)

      context.fillStyle = '#ffffff'
      context.font = `700 44px ${FONT}`
      context.textBaseline = 'top'
      context.fillText(input.title, PADDING, PADDING)
      context.font = `500 24px ${FONT}`
      context.fillStyle = 'rgba(255,255,255,0.75)'
      context.fillText(input.summaryLine, PADDING, PADDING + 60)

      // Progress bar
      const barY = PADDING + 98
      const barWidth = WIDTH - PADDING * 2
      roundedRectPath(context, PADDING, barY, barWidth, 8, 4)
      context.fillStyle = 'rgba(255,255,255,0.15)'
      context.fill()
      if (input.summary.total > 0 && input.summary.done > 0) {
        roundedRectPath(context, PADDING, barY, (barWidth * input.summary.done) / input.summary.total, 8, 4)
        context.fillStyle = '#a78bfa'
        context.fill()
      }

      let y = HEADER_HEIGHT
      for (const group of table.groups) {
        context.font = `700 20px ${FONT}`
        context.fillStyle = 'rgba(255,255,255,0.9)'
        context.fillText(group.constant, PADDING, y + 6)
        y += GROUP_LABEL_HEIGHT
        group.charts.forEach((chart, index) => {
          const x = PADDING + (index % COLUMNS) * (CELL + GAP)
          const cellY = y + Math.floor(index / COLUMNS) * (CELL + GAP)
          const record = input.recordOf(chart.sheetId)
          const met = meetsTarget(record, input.target)
          drawRoundedImage(context, images.get(chart.sheetId) ?? null, x, cellY, CELL, 8)
          if (!met) {
            roundedRectPath(context, x, cellY, CELL, CELL, 8)
            context.fillStyle = 'rgba(15,23,42,0.68)'
            context.fill()
          }
          if (record) {
            const label = record.comboFlag
              ? `${achievementRankLabel(record.achievementRate)} ${COMBO_LABELS[record.comboFlag]}`
              : achievementRankLabel(record.achievementRate)
            context.font = `700 14px ${FONT}`
            const textWidth = context.measureText(label).width
            roundedRectPath(context, x + 4, cellY + CELL - 24, Math.min(CELL - 8, textWidth + 10), 20, 6)
            context.fillStyle = met ? 'rgba(124,58,237,0.85)' : 'rgba(0,0,0,0.6)'
            context.fill()
            context.fillStyle = '#ffffff'
            context.fillText(label, x + 9, cellY + CELL - 21, CELL - 18)
          }
        })
        y += Math.ceil(group.charts.length / COLUMNS) * (CELL + GAP)
      }

      context.font = `500 18px ${FONT}`
      context.fillStyle = 'rgba(255,255,255,0.6)'
      context.fillText(`dxrating.net · ${COMPLETION_TARGET_LABELS[input.target]}`, PADDING, height - FOOTER_HEIGHT + 16)
    },
  }
}