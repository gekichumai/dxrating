import {
  coverImageUrl,
  drawRoundedImage,
  loadCanvasImage,
  roundedRectPath,
  type ShareImageSpec,
} from '@/utils/shareImage/shareImage'
import type { ToplistRow } from './toplistData'

/** The share image shows at most a top 50, like the B50 */
export const SHARE_IMAGE_LIMIT = 50

const COLUMNS = 5
const CELL_WIDTH = 200
const CELL_HEIGHT = 72
const GAP = 8
const PADDING = 24
const HEADER = 76

const COMBO_LABELS: Record<string, string> = { fc: 'FC', fcp: 'FC+', ap: 'AP', app: 'AP+' }

export function drawToplistShareImage(
  rows: readonly ToplistRow[],
  { title, subtitle }: { title: string; subtitle?: string },
): ShareImageSpec {
  const shown = rows.slice(0, SHARE_IMAGE_LIMIT)
  const lineCount = Math.max(1, Math.ceil(shown.length / COLUMNS))
  const width = PADDING * 2 + COLUMNS * CELL_WIDTH + (COLUMNS - 1) * GAP
  const height = PADDING * 2 + HEADER + lineCount * CELL_HEIGHT + (lineCount - 1) * GAP

  return {
    width,
    height,
    draw: async (context) => {
      const covers = await Promise.all(shown.map((row) => loadCanvasImage(coverImageUrl(row.sheet.imageName))))

      const background = context.createLinearGradient(0, 0, width, height)
      background.addColorStop(0, '#1e1b4b')
      background.addColorStop(1, '#0f172a')
      context.fillStyle = background
      context.fillRect(0, 0, width, height)

      context.fillStyle = '#ffffff'
      context.font = 'bold 28px Torus, system-ui, sans-serif'
      context.textBaseline = 'top'
      context.fillText(title, PADDING, PADDING)
      context.font = '14px Torus, system-ui, sans-serif'
      context.fillStyle = 'rgba(255, 255, 255, 0.7)'
      context.fillText([subtitle, `${rows.length}`, 'dxrating.net'].filter(Boolean).join(' · '), PADDING, PADDING + 38)

      shown.forEach((row, index) => {
        const x = PADDING + (index % COLUMNS) * (CELL_WIDTH + GAP)
        const y = PADDING + HEADER + Math.floor(index / COLUMNS) * (CELL_HEIGHT + GAP)
        // Translucent card on the gradient
        roundedRectPath(context, x, y, CELL_WIDTH, CELL_HEIGHT, 10)
        context.fillStyle = 'rgba(255, 255, 255, 0.08)'
        context.fill()
        context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
        context.lineWidth = 1
        context.stroke()

        drawRoundedImage(context, covers[index] ?? null, x + 8, y + 8, 56, 8)

        const textX = x + 72
        const textWidth = CELL_WIDTH - 80
        context.fillStyle = '#ffffff'
        context.font = 'bold 13px Torus, system-ui, sans-serif'
        context.fillText(fitText(context, row.sheet.title, textWidth), textX, y + 10)
        context.font = '12px Torus, system-ui, sans-serif'
        context.fillStyle = 'rgba(255, 255, 255, 0.7)'
        const comboLabel = row.entry.comboFlag ? COMBO_LABELS[row.entry.comboFlag] : undefined
        const flag = comboLabel ? ` ${comboLabel}` : ''
        context.fillText(
          `${row.sheet.type.toUpperCase()} ${row.sheet.internalLevelValue.toFixed(1)}${flag}`,
          textX,
          y + 30,
        )
        context.fillStyle = '#ffffff'
        context.font = 'bold 13px Torus, system-ui, sans-serif'
        context.fillText(`${row.entry.achievementRate.toFixed(4)}%`, textX, y + 48)
      })
    },
  }
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--
  return `${text.slice(0, end)}…`
}