import { DifficultyEnum } from '@gekichumai/dxdata'
import type { PlateKind, PlateRecord } from '@gekichumai/maimai-domain'
import { DIFFICULTIES } from '@/models/difficulties'
import {
  coverImageUrl,
  drawRoundedImage,
  loadCanvasImage,
  roundedRectPath,
  type ShareImageSpec,
} from '@/utils/shareImage/shareImage'
import { drawShareFooter, loadShareLogo, SHARE_FOOTER_HEIGHT, type ShareLink } from '@/utils/shareImage/shareFooter'
import {
  paintShareBackground,
  paintSharePanel,
  readAccent,
  SHARE_FONT as FONT,
  SHARE_PADDING as PADDING,
} from '@/components/completion/shareImageTheme'
import { type PlateChartStatus, type PlateUserProgress, progressPercent } from './plateData'

const WIDTH = 1080
const COLUMNS = 2
const COLUMN_GAP = 24
const COLUMN_WIDTH = (WIDTH - PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS
const COVER = 64
const ROW_HEIGHT = COVER + 18
const CHIP_HEIGHT = 30
const CHIP_GAP = 6
/** Songs listed before the rest collapse into "+N"; the per-difficulty counts above always cover everything */
export const PLATE_SHARE_MAX_SONGS = 40

const ORDER: readonly DifficultyEnum[] = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
  DifficultyEnum.ReMaster,
]
const SHORT: Record<DifficultyEnum, string> = {
  [DifficultyEnum.Basic]: 'BAS',
  [DifficultyEnum.Advanced]: 'ADV',
  [DifficultyEnum.Expert]: 'EXP',
  [DifficultyEnum.Master]: 'MAS',
  [DifficultyEnum.ReMaster]: 'Re:M',
}

const COMBO_LABEL: Record<NonNullable<PlateRecord['comboFlag']>, string> = {
  fc: 'FC',
  fcp: 'FC+',
  ap: 'AP',
  app: 'AP+',
}
const SYNC_LABEL: Record<NonNullable<PlateRecord['syncFlag']>, string> = {
  sync: 'SYNC',
  fs: 'FS',
  fsp: 'FS+',
  fsd: 'FDX',
  fsdp: 'FDX+',
}

/** The achievement threshold a sheet is measured against when ranking how close a song is */
const TARGET_RATE: Record<PlateKind, number> = { hasha: 80, sho: 100, kiwami: 101, shin: 101, maimai: 101 }

/** Two decimals, rounded down like the game so 99.995% never reads 100.00% */
export const formatAchievement = (rate: number) => `${(Math.floor(rate * 100) / 100).toFixed(2)}%`

/** What the player has now on a sheet that is not yet met, in the terms of the plate's requirement */
export function describeSheetState(kind: PlateKind, record: PlateRecord | undefined): string | null {
  if (!record) return null
  if ((kind === 'kiwami' || kind === 'shin') && record.comboFlag) return COMBO_LABEL[record.comboFlag]
  if (kind === 'maimai' && record.syncFlag) return SYNC_LABEL[record.syncFlag]
  return formatAchievement(record.achievementRate)
}

export interface PlateShareEntry {
  status: PlateChartStatus
  missing: { id: string; difficulty: DifficultyEnum; level: string; state: string | null }[]
  /** Achievement points short of the target, summed over the missing sheets (unplayed counts as 0%) */
  gap: number
}

/** The songs still to do, nearest to done first: fewest missing sheets, then the smallest achievement gap */
export function rankRemainingSongs(
  progress: PlateUserProgress,
  kind: PlateKind,
  records: ReadonlyMap<string, PlateRecord>,
): PlateShareEntry[] {
  return progress.charts
    .filter((status) => !status.complete)
    .map((status) => {
      const missing = status.chart.sheets
        .filter((sheet) => !status.met.get(sheet.id))
        .map((sheet) => ({
          id: sheet.id,
          difficulty: sheet.difficulty,
          level: sheet.level,
          state: describeSheetState(kind, records.get(sheet.id)),
        }))
      const gap = missing.reduce(
        (sum, sheet) => sum + Math.max(0, TARGET_RATE[kind] - (records.get(sheet.id)?.achievementRate ?? 0)),
        0,
      )
      return { status, missing, gap }
    })
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        a.gap - b.gap ||
        b.status.chart.levelValue - a.status.chart.levelValue ||
        a.status.chart.title.localeCompare(b.status.chart.title),
    )
}

/** Sheets still missing, per difficulty, in game order (difficulties with none are left out) */
export function countMissingByDifficulty(entries: readonly PlateShareEntry[]) {
  const counts = new Map<DifficultyEnum, number>()
  for (const entry of entries) {
    for (const sheet of entry.missing) counts.set(sheet.difficulty, (counts.get(sheet.difficulty) ?? 0) + 1)
  }
  return ORDER.filter((difficulty) => counts.has(difficulty)).map((difficulty) => ({
    difficulty,
    count: counts.get(difficulty)!,
  }))
}

export interface PlateShareImageLabels {
  /** e.g. "PRiSM · 条件 SSS" */
  subtitle: string
  /** e.g. "40 / 284 譜面" */
  progress: string
  /** The headline percentage, formatted for the locale as on the page */
  percent: string
  /** e.g. "未達成 244 譜面" */
  remaining: string
  /** e.g. "達成に近い順" */
  order: string
  unplayed: string
  /** e.g. "ほか 120 曲" */
  more: (count: number) => string
  allDone: string
  /** The line under the footer URL, e.g. "Scan to open on DXRating" */
  footerCaption: string
}

export interface PlateShareImageInput {
  plateName: string
  kind: PlateKind
  progress: PlateUserProgress
  records: ReadonlyMap<string, PlateRecord>
  labels: PlateShareImageLabels
  /** Where a scan of the footer QR goes, and the short URL printed beside it */
  link: ShareLink
}

const truncate = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (context.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--
  return `${text.slice(0, end)}…`
}

/**
 * A plate progress card a player can act on: the headline, the missing sheets counted per difficulty, then the
 * songs still to do, nearest to done first, each with only its missing sheets as labelled chips that carry the
 * current score or lamp. Long lists stop at PLATE_SHARE_MAX_SONGS with "+N".
 */
export function buildPlateShareImage({
  plateName,
  kind,
  progress,
  records,
  labels,
  link,
}: PlateShareImageInput): ShareImageSpec {
  const entries = rankRemainingSongs(progress, kind, records)
  const shown = entries.slice(0, PLATE_SHARE_MAX_SONGS)
  const hidden = entries.length - shown.length
  const summary = countMissingByDifficulty(entries)

  const sectionTop = 262
  const listTop = sectionTop + 112
  const rows = Math.ceil(shown.length / COLUMNS)
  const contentBottom = entries.length === 0 ? sectionTop + 56 : listTop + rows * ROW_HEIGHT + (hidden > 0 ? 44 : 0)
  const height = contentBottom + SHARE_FOOTER_HEIGHT + PADDING

  return {
    width: WIDTH,
    height,
    draw: async (context) => {
      const logoPromise = loadShareLogo()
      const accent = readAccent()
      paintShareBackground(context, WIDTH, height, accent)
      paintSharePanel(context, WIDTH, height)
      context.textBaseline = 'top'

      // Headline: plate and requirement on the left, completion on the right
      context.textAlign = 'right'
      context.fillStyle = '#ffffff'
      context.font = `600 72px ${FONT}`
      context.fillText(labels.percent, WIDTH - PADDING, PADDING)
      const percentWidth = context.measureText(labels.percent).width
      context.font = `28px ${FONT}`
      context.fillStyle = 'rgba(255, 255, 255, 0.72)'
      context.fillText(labels.progress, WIDTH - PADDING, PADDING + 92)
      const progressWidth = context.measureText(labels.progress).width
      context.textAlign = 'left'

      context.fillStyle = '#ffffff'
      context.font = `600 72px ${FONT}`
      context.fillText(truncate(context, plateName, WIDTH - PADDING * 3 - percentWidth), PADDING, PADDING)
      context.font = `28px ${FONT}`
      context.fillStyle = 'rgba(255, 255, 255, 0.72)'
      context.fillText(truncate(context, labels.subtitle, WIDTH - PADDING * 3 - progressWidth), PADDING, PADDING + 92)

      const barY = PADDING + 150
      const barWidth = WIDTH - PADDING * 2
      const percent = progressPercent(progress.completedSheets, progress.totalSheets)
      context.fillStyle = 'rgba(255, 255, 255, 0.14)'
      roundedRectPath(context, PADDING, barY, barWidth, 16, 8)
      context.fill()
      if (percent > 0) {
        context.fillStyle = accent
        roundedRectPath(context, PADDING, barY, Math.max(16, (barWidth * percent) / 100), 16, 8)
        context.fill()
      }

      if (entries.length === 0) {
        context.font = `600 36px ${FONT}`
        context.fillStyle = '#ffffff'
        context.fillText(labels.allDone, PADDING, sectionTop)
      } else {
        context.font = `600 30px ${FONT}`
        context.fillStyle = '#ffffff'
        context.fillText(labels.remaining, PADDING, sectionTop)
        context.textAlign = 'right'
        context.font = `22px ${FONT}`
        context.fillStyle = 'rgba(255, 255, 255, 0.6)'
        context.fillText(labels.order, WIDTH - PADDING, sectionTop + 6)
        context.textAlign = 'left'

        // What is missing, counted per difficulty: the overview that still holds when the list is cut short
        let x = PADDING
        const summaryY = sectionTop + 48
        context.font = `600 20px ${FONT}`
        for (const { difficulty, count } of summary) {
          const label = `${DIFFICULTIES[difficulty].title}  ${count}`
          const width = context.measureText(label).width + 44
          context.fillStyle = 'rgba(255, 255, 255, 0.1)'
          roundedRectPath(context, x, summaryY, width, 40, 6)
          context.fill()
          context.fillStyle = DIFFICULTIES[difficulty].color
          context.beginPath()
          context.arc(x + 18, summaryY + 20, 6, 0, Math.PI * 2)
          context.fill()
          context.fillStyle = '#ffffff'
          context.textBaseline = 'middle'
          context.fillText(label, x + 32, summaryY + 21)
          context.textBaseline = 'top'
          x += width + 10
        }
      }

      const images = await Promise.all(
        shown.map((entry) => loadCanvasImage(coverImageUrl(entry.status.chart.imageName))),
      )
      shown.forEach((entry, index) => {
        const x = PADDING + (index % COLUMNS) * (COLUMN_WIDTH + COLUMN_GAP)
        const y = listTop + Math.floor(index / COLUMNS) * ROW_HEIGHT
        drawRoundedImage(context, images[index] ?? null, x, y, COVER, 6)

        const textX = x + COVER + 14
        const textWidth = COLUMN_WIDTH - COVER - 14
        context.font = `600 22px ${FONT}`
        context.fillStyle = '#ffffff'
        context.fillText(truncate(context, entry.status.chart.title, textWidth), textX, y + 2)

        // Only the missing sheets, each labelled; the current state is dropped when they would not fit
        context.font = `600 17px ${FONT}`
        const chipText = (sheet: PlateShareEntry['missing'][number], withState: boolean) => {
          const head = `${SHORT[sheet.difficulty]} ${sheet.level}`
          return withState ? `${head} · ${sheet.state ?? labels.unplayed}` : head
        }
        const widthOf = (withState: boolean) =>
          entry.missing.reduce(
            (sum, sheet) => sum + context.measureText(chipText(sheet, withState)).width + 20 + CHIP_GAP,
            -CHIP_GAP,
          )
        const withState = widthOf(true) <= textWidth
        let chipX = textX
        const chipY = y + COVER - CHIP_HEIGHT
        for (const sheet of entry.missing) {
          const text = chipText(sheet, withState)
          const width = context.measureText(text).width + 20
          context.fillStyle = DIFFICULTIES[sheet.difficulty].solid
          roundedRectPath(context, chipX, chipY, width, CHIP_HEIGHT, 5)
          context.fill()
          if (sheet.difficulty === DifficultyEnum.ReMaster) {
            context.strokeStyle = 'rgba(255, 255, 255, 0.7)'
            context.setLineDash([4, 3])
            context.lineWidth = 1.5
            context.stroke()
            context.setLineDash([])
          }
          context.fillStyle = '#ffffff'
          context.textBaseline = 'middle'
          context.fillText(text, chipX + 10, chipY + CHIP_HEIGHT / 2 + 1)
          context.textBaseline = 'top'
          chipX += width + CHIP_GAP
        }
      })

      context.font = `22px ${FONT}`
      if (hidden > 0) {
        context.fillStyle = 'rgba(255, 255, 255, 0.72)'
        context.fillText(labels.more(hidden), PADDING, listTop + rows * ROW_HEIGHT + 8)
      }
      drawShareFooter(
        context,
        { top: contentBottom, width: WIDTH, inset: PADDING },
        { link, caption: labels.footerCaption, logo: await logoPromise, font: FONT },
      )
    },
  }
}