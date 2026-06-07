import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import type { NoteCounts } from '@gekichumai/dxdata'
import type { SheetDifficulty } from '@gekichumai/maimai-domain'
import { ImageResponse } from '@takumi-rs/image-response'
import type { Handler } from 'hono'
import { createHash } from 'node:crypto'
import type { CSSProperties, ReactNode } from 'react'
import { fetchAsset, fetchImageAsset } from '../oneshot-renderer/assetFetcher.js'

export const CHART_OG_IMAGE_WIDTH = 1200
export const CHART_OG_IMAGE_HEIGHT = 630
const ASSET_ORIGIN = 'https://shama.dxrating.net'
const FRONTEND_ORIGIN = 'https://dxrating.net'

export const CHART_OG_IMAGE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
const CHART_OG_IMAGE_CONTENT_TYPE = 'image/png'
const CHART_OG_IMAGE_CONTENT_DISPOSITION = 'inline; filename="chart-og.png"; filename*=utf-8\'\'chart-og.png'

type DifficultyDisplay = {
  title: string
  color: string
  textColor: string
}

const DIFFICULTY_DISPLAY: Record<DifficultyEnum, DifficultyDisplay> = {
  [DifficultyEnum.Basic]: { title: 'BASIC', color: '#22bb5b', textColor: '#ffffff' },
  [DifficultyEnum.Advanced]: { title: 'ADVANCED', color: '#fb9c2d', textColor: '#111827' },
  [DifficultyEnum.Expert]: { title: 'EXPERT', color: '#f64861', textColor: '#ffffff' },
  [DifficultyEnum.Master]: { title: 'MASTER', color: '#9e45e2', textColor: '#ffffff' },
  [DifficultyEnum.ReMaster]: { title: 'Re:MASTER', color: '#ba67f8', textColor: '#ffffff' },
}

const UTAGE_DIFFICULTY_COLORS = {
  color: '#ef4444',
  textColor: '#ffffff',
} satisfies Pick<DifficultyDisplay, 'color' | 'textColor'>

const TYPE_DISPLAY: Record<TypeEnum, string> = {
  [TypeEnum.DX]: 'DX',
  [TypeEnum.STD]: 'Standard',
  [TypeEnum.UTAGE]: 'Utage',
  [TypeEnum.UTAGE2P]: 'Utage',
}

export type ChartOgImageData = {
  songId: string
  title: string
  artist: string
  category: string
  imageName: string
  coverUrl: string
  detailUrl: string
  type: TypeEnum
  typeLabel: string
  difficulty: SheetDifficulty
  difficultyLabel: string
  difficultyColor: string
  difficultyTextColor: string
  level: string
  levelLabel: string
  internalLevelValue: number
  noteDesigner: string | null
  noteCounts: NoteCounts
  version: string
}

export type RenderChartOgImage = (data: ChartOgImageData) => Promise<ArrayBuffer | Uint8Array>

export type ChartOgImageOutput = {
  headers: Record<string, string>
  body: Blob
}

export function buildChartOgDetailUrl(songId: string, type: string, difficulty: string) {
  return `${FRONTEND_ORIGIN}/songs/${encodeURIComponent(songId)}/${encodeURIComponent(type)}/${encodeURIComponent(difficulty)}`
}

export function formatInternalLevelLabelParts(internalLevelValue: number) {
  const [integer = '0', fraction = '0'] = internalLevelValue.toFixed(1).split('.')
  return {
    prefix: 'Lv ',
    integer,
    fraction: `.${fraction}`,
  }
}

export function resolveChartOgImageData(songId: string, type: string, difficulty: string): ChartOgImageData | null {
  const song = dxdata.songs.find((candidate) => candidate.songId === songId)
  if (!song) return null

  const sheet = song.sheets.find((candidate) => candidate.type === type && candidate.difficulty === difficulty)
  if (!sheet) return null

  const sheetDifficulty = sheet.difficulty as SheetDifficulty
  const difficultyDisplay = resolveDifficultyDisplay(sheet.type, sheetDifficulty)
  if (!difficultyDisplay) return null

  const levelParts = formatInternalLevelLabelParts(sheet.internalLevelValue)

  return {
    songId: song.songId,
    title: song.title,
    artist: song.artist,
    category: song.category,
    imageName: song.imageName,
    coverUrl: `${ASSET_ORIGIN}/images/cover/v2/${song.imageName}.jpg`,
    detailUrl: buildChartOgDetailUrl(song.songId, sheet.type, sheet.difficulty),
    type: sheet.type,
    typeLabel: TYPE_DISPLAY[sheet.type],
    difficulty: sheetDifficulty,
    difficultyLabel: difficultyDisplay.title,
    difficultyColor: difficultyDisplay.color,
    difficultyTextColor: difficultyDisplay.textColor,
    level: sheet.level,
    levelLabel: `${levelParts.prefix}${levelParts.integer}${levelParts.fraction}`,
    internalLevelValue: sheet.internalLevelValue,
    noteDesigner: sheet.noteDesigner,
    noteCounts: sheet.noteCounts,
    version: sheet.version,
  }
}

function resolveDifficultyDisplay(type: TypeEnum, difficulty: SheetDifficulty): DifficultyDisplay | null {
  const standardDifficultyDisplay = DIFFICULTY_DISPLAY[difficulty as DifficultyEnum]
  if (standardDifficultyDisplay) return standardDifficultyDisplay

  if (isUtageType(type)) {
    return {
      title: difficulty,
      ...UTAGE_DIFFICULTY_COLORS,
    }
  }

  return null
}

function isUtageType(type: TypeEnum) {
  return type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
}

export function createChartOgImageHandler(renderImage: RenderChartOgImage = renderChartOgImage): Handler {
  return async (c) => {
    const songId = c.req.param('songId')
    const type = c.req.param('type')
    const difficulty = c.req.param('difficulty')
    if (!songId || !type || !difficulty) return c.text('Chart not found', 404)

    const output = await renderChartOgImageOutput({ songId, type, difficulty }, renderImage)
    if (!output) return c.text('Chart not found', 404)

    return new Response(output.body, {
      headers: {
        ...output.headers,
        'Content-Length': String(output.body.size),
      },
    })
  }
}

export async function renderChartOgImageOutput(
  input: { songId: string; type: string; difficulty: string },
  renderImage: RenderChartOgImage = renderChartOgImage,
): Promise<ChartOgImageOutput | null> {
  const data = resolveChartOgImageData(input.songId, input.type, input.difficulty)
  if (!data) return null

  const image = await renderImage(data)
  const body = toArrayBuffer(image)

  return {
    headers: {
      'Cache-Control': CHART_OG_IMAGE_CACHE_CONTROL,
      'Content-Disposition': CHART_OG_IMAGE_CONTENT_DISPOSITION,
      'Content-Type': CHART_OG_IMAGE_CONTENT_TYPE,
      ETag: createChartOgImageEtag(body),
      'X-Content-Type-Options': 'nosniff',
    },
    body: new Blob([body], { type: CHART_OG_IMAGE_CONTENT_TYPE }),
  }
}

function createChartOgImageEtag(image: ArrayBuffer) {
  return `"sha256-${createHash('sha256').update(Buffer.from(image)).digest('hex')}"`
}

function toArrayBuffer(image: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (image instanceof ArrayBuffer) return image
  return image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer
}

type TakumiFont = {
  name: string
  data: Buffer
  weight: number
  style: 'normal'
}

const fontConfig = [
  { name: 'Source Han Sans', file: 'SourceHanSansJP-Regular.otf', weight: 400 },
  { name: 'Source Han Sans', file: 'SourceHanSansJP-Bold.otf', weight: 700 },
] as const

let cachedFonts: TakumiFont[] | null = null

async function loadFonts(): Promise<TakumiFont[]> {
  if (cachedFonts) return cachedFonts

  cachedFonts = await Promise.all(
    fontConfig.map(async (font) => ({
      name: font.name,
      data: await fetchAsset(`/fonts/${font.file}`),
      weight: font.weight,
      style: 'normal' as const,
    })),
  )
  return cachedFonts
}

function dataUri(mimeType: 'image/jpeg' | 'image/png', data: Buffer) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}

async function loadCoverDataUri(imageName: string) {
  const cover = await fetchImageAsset(`/images/cover/v2/${imageName}.jpg`)
  return dataUri('image/jpeg', cover)
}

async function loadTypeBadgeDataUri(type: TypeEnum) {
  if (type !== TypeEnum.DX) return null

  const typeImage = await fetchImageAsset('/images/type_dx.png')
  return dataUri('image/png', typeImage)
}

export async function renderChartOgImage(data: ChartOgImageData): Promise<Uint8Array> {
  const [fonts, coverSrc, typeBadgeSrc] = await Promise.all([
    loadFonts(),
    loadCoverDataUri(data.imageName),
    loadTypeBadgeDataUri(data.type),
  ])
  const response = new ImageResponse(<ChartOgCard data={data} coverSrc={coverSrc} typeBadgeSrc={typeBadgeSrc} />, {
    width: CHART_OG_IMAGE_WIDTH,
    height: CHART_OG_IMAGE_HEIGHT,
    format: 'png',
    fonts,
    emoji: 'twemoji',
  })

  await response.ready
  return new Uint8Array(await response.arrayBuffer())
}

function ChartOgCard({
  data,
  coverSrc,
  typeBadgeSrc,
}: {
  data: ChartOgImageData
  coverSrc: string
  typeBadgeSrc: string | null
}) {
  const titleLayout = getTitleLayout(data.title)

  return (
    <div style={styles.canvas}>
      <div style={styles.accentBar} />
      <div style={styles.coverFrame}>
        <img alt="" src={coverSrc} width={440} height={440} style={styles.coverImage} />
      </div>

      <div style={styles.content}>
        <div style={styles.category}>{data.category}</div>
        <div style={{ ...styles.title, ...titleLayout }}>{data.title}</div>
        <div style={styles.artist}>{data.artist}</div>

        <div style={styles.badges}>
          {typeBadgeSrc ? (
            <img alt="" src={typeBadgeSrc} height={45} style={styles.typeImage} />
          ) : (
            <Badge background="#111827" color="#ffffff">
              {data.typeLabel}
            </Badge>
          )}
          <DifficultyBadge
            background={data.difficultyColor}
            color={data.difficultyTextColor}
            difficultyLabel={data.difficultyLabel}
            internalLevelValue={data.internalLevelValue}
          />
        </div>

        <div style={styles.statsGrid}>
          <Stat label="Version" value={data.version} />
          <Stat label="Designer" value={data.noteDesigner ?? 'Unknown'} />
        </div>

        <div style={styles.noteCounts}>
          <NoteCount label="TAP" value={data.noteCounts.tap} />
          <NoteCount label="HOLD" value={data.noteCounts.hold} />
          <NoteCount label="SLIDE" value={data.noteCounts.slide} />
          <NoteCount label="TOUCH" value={data.noteCounts.touch} />
          <NoteCount label="BREAK" value={data.noteCounts.break} />
        </div>
      </div>
    </div>
  )
}

function Badge({ background, color, children }: { background: string; color: string; children: ReactNode }) {
  return <div style={{ ...styles.badge, backgroundColor: background, color }}>{children}</div>
}

function DifficultyBadge({
  background,
  color,
  difficultyLabel,
  internalLevelValue,
}: {
  background: string
  color: string
  difficultyLabel: string
  internalLevelValue: number
}) {
  const level = formatInternalLevelLabelParts(internalLevelValue)

  return (
    <div style={{ ...styles.badge, ...styles.difficultyBadge, backgroundColor: background, color }}>
      <span style={styles.difficultyText}>{difficultyLabel}</span>
      <hr style={styles.difficultyDivider} />
      <span style={styles.levelPrefix}>{level.prefix}</span>
      <span style={styles.levelInteger}>{level.integer}</span>
      <span style={styles.levelFraction}>{level.fraction}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

function NoteCount({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={styles.noteCount}>
      <span style={styles.noteCountLabel}>{label}</span>
      <span style={styles.noteCountValue}>{value ?? '-'}</span>
    </div>
  )
}

export function getTitleLayout(title: string): Pick<CSSProperties, 'fontSize' | 'lineHeight' | 'maxHeight'> {
  if (title.length > 120) return { fontSize: 25, lineHeight: 1.1, maxHeight: 150 }
  if (title.length > 96) return { fontSize: 28, lineHeight: 1.12, maxHeight: 142 }
  if (title.length > 64) return { fontSize: 31, lineHeight: 1.14, maxHeight: 136 }
  if (title.length > 48) return { fontSize: 36, lineHeight: 1.18, maxHeight: 132 }
  if (title.length > 34) return { fontSize: 42, lineHeight: 1.2, maxHeight: 132 }
  return { fontSize: 50, lineHeight: 1.22, maxHeight: 132 }
}

const styles = {
  canvas: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontFamily: 'Source Han Sans',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 14,
    background: 'linear-gradient(180deg, #8b5cf6 0%, #06b6d4 100%)',
  },
  coverFrame: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 534,
    height: '100%',
    paddingLeft: 70,
    paddingRight: 24,
  },
  coverImage: {
    width: 440,
    height: 440,
    objectFit: 'cover',
    borderRadius: 40,
    boxShadow:
      '0 1px 1px rgba(17, 24, 39, 0.06), 0 4px 8px rgba(17, 24, 39, 0.08), 0 12px 24px rgba(17, 24, 39, 0.10), 0 28px 56px rgba(17, 24, 39, 0.14), 0 48px 96px rgba(17, 24, 39, 0.10), inset 0 0 0 1px rgba(0, 0, 0, 0.10)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    width: 610,
    height: '100%',
    paddingTop: 95,
    paddingRight: 62,
    paddingBottom: 42,
    paddingLeft: 20,
  },
  category: {
    color: '#6b7280',
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    marginBottom: 12,
  },
  title: {
    color: '#111827',
    fontWeight: 700,
    marginBottom: 12,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  },
  artist: {
    color: '#4b5563',
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.2,
    marginBottom: 20,
    maxHeight: 58,
    overflow: 'hidden',
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
  },
  difficultyBadge: {
    fontSize: 19,
    padding: '6px 15px 8px',
    boxShadow: '3px 3px 0 rgba(11, 56, 113, 0.30)',
    transform: 'translateY(-3px)',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 999,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    padding: '8px 16px',
  },
  typeImage: {
    height: 45,
    width: 102,
    objectFit: 'contain',
  },
  difficultyText: {
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1,
  },
  difficultyDivider: {
    width: 1,
    height: 16,
    border: 0,
    backgroundColor: '#ffffff',
    opacity: 0.62,
    marginTop: 0,
    marginRight: 11,
    marginBottom: 0,
    marginLeft: 11,
  },
  levelPrefix: {
    fontSize: 19,
    fontWeight: 400,
    lineHeight: 1,
  },
  levelInteger: {
    fontSize: 19,
    fontWeight: 400,
    lineHeight: 1,
  },
  levelFraction: {
    fontSize: 19,
    fontWeight: 400,
    lineHeight: 1,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 18,
    marginBottom: 20,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    padding: 0,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    marginBottom: 7,
  },
  statValue: {
    color: '#111827',
    fontSize: 21,
    fontWeight: 400,
    lineHeight: 1.16,
    maxHeight: 50,
    overflow: 'hidden',
  },
  noteCounts: {
    display: 'flex',
    gap: 10,
  },
  noteCount: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    color: '#312e81',
    lineHeight: 1,
    padding: '7px 10px',
    boxShadow: '3px 3px 0 rgba(49, 46, 129, 0.10)',
  },
  noteCountLabel: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    marginRight: 7,
  },
  noteCountValue: {
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1,
  },
} satisfies Record<string, CSSProperties>

export const handler = createChartOgImageHandler()