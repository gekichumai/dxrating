import { DIFFICULTIES } from '@/models/difficulties'
import {
  coverImageUrl,
  drawRoundedImage,
  loadCanvasImage,
  roundedRectPath,
  type ShareImageSpec,
} from '@/utils/shareImage/shareImage'
import {
  paintShareBackground,
  paintSharePanel,
  readAccent,
  SHARE_FONT as FONT,
  SHARE_PADDING as PADDING,
} from '@/components/completion/shareImageTheme'
import { type PlateUserProgress, progressPercent } from './plateData'

const WIDTH = 1080
const COLUMNS = 10
const GAP = 12
const MAX_COVERS = 80

export interface PlateShareImageInput {
  plateName: string
  subtitle: string
  progressLabel: string
  remainingLabel: string
  /** The headline percentage, formatted for the locale as on the page */
  percentLabel: string
  progress: PlateUserProgress
}

/** A share card: plate name, completion bar and the covers of the songs still remaining */
export function buildPlateShareImage({
  plateName,
  subtitle,
  progressLabel,
  remainingLabel,
  percentLabel,
  progress,
}: PlateShareImageInput): ShareImageSpec {
  const remaining = progress.charts.filter((chart) => !chart.complete)
  const shown = remaining.slice(0, MAX_COVERS)
  const cell = (WIDTH - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS
  const rows = Math.ceil(shown.length / COLUMNS)
  const gridTop = 300
  const height = gridTop + (rows > 0 ? rows * (cell + 10 + GAP) : 0) + PADDING + 24

  return {
    width: WIDTH,
    height,
    draw: async (context) => {
      const accent = readAccent()
      paintShareBackground(context, WIDTH, height, accent)
      paintSharePanel(context, WIDTH, height)

      context.fillStyle = '#ffffff'
      context.font = `600 72px ${FONT}`
      context.textBaseline = 'top'
      context.fillText(plateName, PADDING, PADDING)
      context.font = `28px ${FONT}`
      context.fillStyle = 'rgba(255, 255, 255, 0.7)'
      context.fillText(subtitle, PADDING, PADDING + 92)

      // By chart (sheet), matching the page headline
      const percent = progressPercent(progress.completedSheets, progress.totalSheets)
      context.textAlign = 'right'
      context.fillStyle = '#ffffff'
      context.font = `600 72px ${FONT}`
      context.fillText(percentLabel, WIDTH - PADDING, PADDING)
      context.font = `28px ${FONT}`
      context.fillStyle = 'rgba(255, 255, 255, 0.7)'
      context.fillText(progressLabel, WIDTH - PADDING, PADDING + 92)
      context.textAlign = 'left'

      const barY = PADDING + 150
      const barWidth = WIDTH - PADDING * 2
      context.fillStyle = 'rgba(255, 255, 255, 0.14)'
      roundedRectPath(context, PADDING, barY, barWidth, 16, 8)
      context.fill()
      if (percent > 0) {
        context.fillStyle = accent
        roundedRectPath(context, PADDING, barY, Math.max(16, (barWidth * percent) / 100), 16, 8)
        context.fill()
      }

      if (shown.length > 0) {
        context.font = `600 28px ${FONT}`
        context.fillStyle = '#ffffff'
        context.fillText(remainingLabel, PADDING, gridTop - 52)
      }

      const images = await Promise.all(shown.map((status) => loadCanvasImage(coverImageUrl(status.chart.imageName))))
      shown.forEach((status, index) => {
        const x = PADDING + (index % COLUMNS) * (cell + GAP)
        const y = gridTop + Math.floor(index / COLUMNS) * (cell + 10 + GAP)
        drawRoundedImage(context, images[index] ?? null, x, y, cell, 8)
        // One pip per required sheet: solid when met, faint when not
        const pipWidth = cell / status.chart.sheets.length
        status.chart.sheets.forEach((sheet, pipIndex) => {
          context.fillStyle = DIFFICULTIES[sheet.difficulty]?.color ?? '#888'
          context.globalAlpha = status.met.get(sheet.id) ? 1 : 0.25
          context.fillRect(x + pipIndex * pipWidth + 1, y + cell + 4, pipWidth - 2, 5)
        })
        context.globalAlpha = 1
      })

      context.font = `22px ${FONT}`
      context.fillStyle = 'rgba(255, 255, 255, 0.5)'
      context.textAlign = 'right'
      const more = remaining.length - shown.length
      context.fillText(more > 0 ? `+${more} · dxrating.net` : 'dxrating.net', WIDTH - PADDING, height - PADDING - 8)
      context.textAlign = 'left'
    },
  }
}