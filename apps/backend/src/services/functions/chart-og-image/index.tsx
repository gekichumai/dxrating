import { Effect, Data } from 'effect'
import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SheetDifficulty } from '@gekichumai/maimai-domain'
import { ImageResponse } from '@takumi-rs/image-response'
import type { Handler } from 'hono'
import { createHash } from 'node:crypto'
import type { ReactElement } from 'react'
import sharp from 'sharp'
import { Sentry } from '../../../lib/functions/sentry'
import type { PublishedSong } from '../../mcp/catalog'
import { fetchAssetEffect } from '../oneshot-renderer/assetFetcher'
import { ChartOgCard, OG_FONT, OG_HEIGHT, OG_WIDTH, SongOgCard, type OgCardImages, type OgSheetBadge } from './card'
import { resolveOgLocale, type OgLocale } from './labels'

export { getTitleLayout } from './card'
export { OG_LOCALES, resolveOgLocale, type OgLocale } from './labels'

export class ChartOgRenderError extends Data.TaggedError('ChartOgRenderError')<{
  readonly operation: string
  readonly cause: unknown
}> {
  get message() {
    return this.cause instanceof Error ? this.cause.message : this.operation + ' failed'
  }
}

export const CHART_OG_IMAGE_WIDTH = OG_WIDTH
export const CHART_OG_IMAGE_HEIGHT = OG_HEIGHT
const ASSET_ORIGIN = 'https://shama.dxrating.net'
const FRONTEND_ORIGIN = 'https://dxrating.net'

export const CHART_OG_IMAGE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
const CHART_OG_IMAGE_CONTENT_TYPE = 'image/png'
const CHART_OG_IMAGE_CONTENT_DISPOSITION = 'inline; filename="chart-og.png"; filename*=utf-8\'\'chart-og.png'
const SONG_OG_IMAGE_CONTENT_DISPOSITION = 'inline; filename="song-og.png"; filename*=utf-8\'\'song-og.png'
/** The edge `Cache-Tag` of every OG image, purged at startup so a deploy that changes the card replaces cached ones */
export const OG_IMAGE_CACHE_TAG = 'og-image'

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

type ChartOgNoteCounts = Record<'tap' | 'hold' | 'slide' | 'touch' | 'break' | 'total', number | null>

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
  noteCounts: ChartOgNoteCounts
  version: string
  bpm: number | null
}

export type RenderChartOgImage = (data: ChartOgImageData, locale: OgLocale) => Promise<ArrayBuffer | Uint8Array>

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

/**
 * Finds the published song a path segment names: a public song ID (dsng_…) or a legacy song ID, as indexed pages and
 * crawlers still request both. Returns null when no published song has it.
 */
export type ChartOgSongLookup<E = never, R = never> = (songId: string) => Effect.Effect<PublishedSong | null, E, R>

export function resolveChartOgImageData(
  song: PublishedSong,
  type: string,
  difficulty: string,
): ChartOgImageData | null {
  const sheet = song.sheets.find((candidate) => candidate.type === type && candidate.difficulty === difficulty)
  if (!sheet || !isSheetType(sheet.type)) return null

  const sheetDifficulty = sheet.difficulty as SheetDifficulty
  const difficultyDisplay = resolveDifficultyDisplay(sheet.type, sheetDifficulty)
  if (!difficultyDisplay) return null

  const levelParts = formatInternalLevelLabelParts(sheet.internalLevelValue)

  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    category: song.category,
    imageName: song.imageName,
    coverUrl: `${ASSET_ORIGIN}/images/cover/v2/${song.imageName}.jpg`,
    detailUrl: buildChartOgDetailUrl(song.id, sheet.type, sheet.difficulty),
    type: sheet.type,
    typeLabel: TYPE_DISPLAY[sheet.type],
    difficulty: sheetDifficulty,
    difficultyLabel: difficultyDisplay.title,
    difficultyColor: difficultyDisplay.color,
    difficultyTextColor: difficultyDisplay.textColor,
    level: sheet.level,
    levelLabel: `${levelParts.prefix}${levelParts.integer}${levelParts.fraction}`,
    internalLevelValue: sheet.internalLevelValue,
    noteDesigner: sheet.noteDesigner ?? null,
    noteCounts: {
      tap: sheet.noteCounts.tap ?? null,
      hold: sheet.noteCounts.hold ?? null,
      slide: sheet.noteCounts.slide ?? null,
      touch: sheet.noteCounts.touch ?? null,
      break: sheet.noteCounts.break ?? null,
      total: sheet.noteCounts.total ?? null,
    },
    version: sheet.version,
    bpm: song.bpm ?? null,
  }
}

/** The chart a request names, trying each path parameter as given and then decoded once (crawlers double-encode) */
export const resolveChartOgImageDataEffect = <E, R>(
  input: { songId: string; type: string; difficulty: string },
  lookupSong: ChartOgSongLookup<E, R>,
) =>
  Effect.gen(function* () {
    const decodedSongId = decodePathParameterOnce(input.songId)
    const song =
      (yield* lookupSong(input.songId)) ?? (decodedSongId === input.songId ? null : yield* lookupSong(decodedSongId))
    if (!song) return null

    return (
      resolveChartOgImageData(song, input.type, input.difficulty) ??
      resolveChartOgImageData(song, decodePathParameterOnce(input.type), decodePathParameterOnce(input.difficulty))
    )
  })

const SHEET_TYPES = new Set<string>(Object.values(TypeEnum))

function isSheetType(type: string): type is TypeEnum {
  return SHEET_TYPES.has(type)
}

function decodePathParameterOnce(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
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

export function createChartOgImageHandler(lookupSong: ChartOgSongLookup, renderImage?: RenderChartOgImage): Handler {
  return (c) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const songId = c.req.param('songId')
          const type = c.req.param('type')
          const difficulty = c.req.param('difficulty')
          if (!songId || !type || !difficulty) return c.text('Chart not found', 404)

          const output = yield* renderChartOgImageOutputEffect(
            { songId, type, difficulty, locale: c.req.query('locale') },
            lookupSong,
            renderImage,
          )
          if (!output) return c.text('Chart not found', 404)

          return new Response(output.body, {
            headers: {
              ...output.headers,
              'Content-Length': String(output.body.size),
            },
          })
        }),
      ),
      { signal: c.req.raw.signal },
    )
}

export const renderChartOgImageOutputEffect = <E, R>(
  input: { songId: string; type: string; difficulty: string; locale?: string | undefined },
  lookupSong: ChartOgSongLookup<E, R>,
  renderImage?: RenderChartOgImage,
) =>
  Effect.gen(function* () {
    const data = yield* resolveChartOgImageDataEffect(input, lookupSong)
    if (!data) return null
    const locale = resolveOgLocale(input.locale)

    const image = yield* renderImage
      ? Effect.tryPromise({
          try: () => renderImage(data, locale),
          catch: (cause) => new ChartOgRenderError({ operation: 'render chart OG image', cause }),
        })
      : renderChartOgImageEffect(data, locale)
    return toImageOutput(image, CHART_OG_IMAGE_CONTENT_DISPOSITION)
  })

export const renderSongOgImageOutputEffect = <E, R>(
  input: { songId: string; locale?: string | undefined },
  lookupSong: ChartOgSongLookup<E, R>,
) =>
  Effect.gen(function* () {
    const song = yield* lookupSongDecodingOnce(input.songId, lookupSong)
    const data = song ? resolveSongOgImageData(song) : null
    if (!song || !data) return null
    const locale = resolveOgLocale(input.locale)

    // A song with one chart (most Utage songs) shows that chart's card rather than a row of one chip
    const onlySheet = song.sheets.length === 1 ? song.sheets[0] : undefined
    const chart = onlySheet ? resolveChartOgImageData(song, onlySheet.type, onlySheet.difficulty) : null
    const image = yield* chart ? renderChartOgImageEffect(chart, locale) : renderSongOgImageEffect(data, locale)
    return toImageOutput(image, SONG_OG_IMAGE_CONTENT_DISPOSITION)
  })

function toImageOutput(image: ArrayBuffer | Uint8Array, contentDisposition: string): ChartOgImageOutput {
  const body = toArrayBuffer(image)
  return {
    headers: {
      'Cache-Control': CHART_OG_IMAGE_CACHE_CONTROL,
      'Cache-Tag': OG_IMAGE_CACHE_TAG,
      'Content-Disposition': contentDisposition,
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

// ---------------------------------------------------------------------------------------------------------------------
// Song page (no chart selected): every chart's internal level

export type SongOgImageData = {
  songId: string
  title: string
  artist: string
  category: string
  imageName: string
  bpm: number | null
  version: string
  groups: Array<{ type: TypeEnum; sheets: OgSheetBadge[] }>
}

const TYPE_ORDER: readonly TypeEnum[] = [TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE, TypeEnum.UTAGE2P]
const DIFFICULTY_ORDER: readonly string[] = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
  DifficultyEnum.ReMaster,
]

export function resolveSongOgImageData(song: PublishedSong): SongOgImageData | null {
  const groups = TYPE_ORDER.map((type) => ({
    type,
    sheets: song.sheets
      .filter((sheet) => sheet.type === type)
      .map((sheet) => toSheetBadge(type, sheet.difficulty as SheetDifficulty, sheet.level, sheet.internalLevelValue))
      .filter((sheet): sheet is OgSheetBadge & { order: number } => sheet !== null)
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...sheet }) => sheet),
  })).filter((group) => group.sheets.length > 0)
  if (groups.length === 0) return null

  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    category: song.category,
    imageName: song.imageName,
    bpm: song.bpm ?? null,
    version: song.version,
    groups,
  }
}

function toSheetBadge(type: TypeEnum, difficulty: SheetDifficulty, level: string, internalLevelValue: number) {
  const display = resolveDifficultyDisplay(type, difficulty)
  if (!display) return null
  const order = DIFFICULTY_ORDER.indexOf(difficulty)
  return {
    type,
    difficultyLabel: display.title,
    difficultyColor: display.color,
    difficultyTextColor: display.textColor,
    level,
    internalLevelValue,
    order: order === -1 ? DIFFICULTY_ORDER.length : order,
  }
}

const lookupSongDecodingOnce = <E, R>(songId: string, lookupSong: ChartOgSongLookup<E, R>) =>
  Effect.gen(function* () {
    const decodedSongId = decodePathParameterOnce(songId)
    return (yield* lookupSong(songId)) ?? (decodedSongId === songId ? null : yield* lookupSong(decodedSongId))
  })

// ---------------------------------------------------------------------------------------------------------------------
// Rendering

type TakumiFont = {
  name: string
  data: Buffer
  weight: number
  style: 'normal'
}

/**
 * The region-neutral Source Han Sans files carry every CJK region's glyphs, so Simplified and Traditional Chinese
 * titles render as well as Japanese ones; the JP subset the player card uses lacks many Simplified characters.
 */
const fontConfig = [
  { name: OG_FONT.text, file: 'SourceHanSans-Regular.otf', weight: 400 },
  { name: OG_FONT.text, file: 'SourceHanSans-Bold.otf', weight: 700 },
  { name: OG_FONT.display, file: 'NewRodinProDB.otf', weight: 400 },
] as const

let cachedFonts: TakumiFont[] | null = null

const loadFonts = Effect.gen(function* () {
  if (cachedFonts) return cachedFonts
  const fonts = yield* Effect.all(
    fontConfig.map((font) =>
      fetchAssetEffect(`/fonts/${font.file}`).pipe(
        Effect.map((data): TakumiFont => ({ name: font.name, data, weight: font.weight, style: 'normal' })),
      ),
    ),
    { concurrency: 'unbounded' },
  )
  cachedFonts = fonts
  return fonts
})

function dataUri(mimeType: 'image/jpeg' | 'image/png', data: Buffer) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}

/** The jacket, or null when the asset server has none (new songs can be published before their jacket) */
const loadCover = (imageName: string) =>
  fetchAssetEffect(`/images/cover/v2/${imageName}.jpg`).pipe(
    Effect.map((cover): Buffer | null => cover),
    Effect.catch((error) =>
      Effect.sync(() => {
        Sentry.captureException(error.cause, { level: 'warning', extra: { imageName } })
        return null
      }),
    ),
  )

const loadLogo = fetchAssetEffect('/favicon/pack/v1/apple-touch-icon.png').pipe(
  Effect.map((logo): string | null => dataUri('image/png', logo)),
  Effect.catch(() => Effect.succeed(null)),
)

/**
 * The jacket as a soft, darkened backdrop. Blurring a small copy is cheap and leaves no detail to compete with the
 * text; the renderer scales it back up.
 */
const createBackdrop = (cover: Buffer) =>
  Effect.tryPromise({
    try: () =>
      sharp(cover)
        .resize(240, 126, { fit: 'cover' })
        .blur(9)
        .modulate({ brightness: 0.62, saturation: 1.35 })
        .jpeg({ quality: 82 })
        .toBuffer(),
    catch: (cause) => new ChartOgRenderError({ operation: 'blur OG backdrop', cause }),
  })

const loadImages = (imageName: string) =>
  Effect.gen(function* () {
    const [cover, logo] = yield* Effect.all([loadCover(imageName), loadLogo], { concurrency: 'unbounded' })
    const backdrop = cover ? yield* createBackdrop(cover) : null
    return {
      cover: cover ? dataUri('image/jpeg', cover) : null,
      backdrop: backdrop ? dataUri('image/jpeg', backdrop) : null,
      logo,
    } satisfies OgCardImages
  })

const renderCard = (element: ReactElement, fonts: TakumiFont[]) =>
  Effect.gen(function* () {
    const response = yield* Effect.try({
      try: () =>
        new ImageResponse(element, {
          width: OG_WIDTH,
          height: OG_HEIGHT,
          format: 'png',
          fonts,
          emoji: 'twemoji',
        }),
      catch: (cause) => new ChartOgRenderError({ operation: 'initialize OG renderer', cause }),
    })
    // Native rendering has no cancellation API; interruption only stops waiting for its result.
    yield* Effect.tryPromise({
      try: () => response.ready,
      catch: (cause) => new ChartOgRenderError({ operation: 'render OG image', cause }),
    })
    const image = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) => new ChartOgRenderError({ operation: 'read OG image', cause }),
    })
    // A 256-colour palette keeps the image near a quarter of its size (about 250 KB) with no visible change; some
    // previewers (WhatsApp, LINE) skip images over about 600 KB. The quantizer is deterministic.
    const compressed = yield* Effect.tryPromise({
      try: () =>
        sharp(Buffer.from(image)).png({ palette: true, quality: 95, colors: 256, compressionLevel: 9 }).toBuffer(),
      catch: (cause) => new ChartOgRenderError({ operation: 'compress OG image', cause }),
    })
    return new Uint8Array(compressed)
  })

export const renderChartOgImageEffect = (data: ChartOgImageData, locale: OgLocale = 'en') =>
  Effect.gen(function* () {
    const [fonts, images] = yield* Effect.all([loadFonts, loadImages(data.imageName)], { concurrency: 'unbounded' })
    const designer = data.noteDesigner && data.noteDesigner !== '-' ? data.noteDesigner : null
    return yield* renderCard(
      <ChartOgCard
        title={data.title}
        artist={data.artist}
        sheet={{
          type: data.type,
          difficultyLabel: data.difficultyLabel,
          difficultyColor: data.difficultyColor,
          difficultyTextColor: data.difficultyTextColor,
          level: data.level,
          internalLevelValue: data.internalLevelValue,
        }}
        facts={{ notes: data.noteCounts.total, bpm: data.bpm, version: data.version, designer }}
        locale={locale}
        images={images}
      />,
      fonts,
    )
  })

export const renderSongOgImageEffect = (data: SongOgImageData, locale: OgLocale = 'en') =>
  Effect.gen(function* () {
    const [fonts, images] = yield* Effect.all([loadFonts, loadImages(data.imageName)], { concurrency: 'unbounded' })
    return yield* renderCard(
      <SongOgCard
        title={data.title}
        artist={data.artist}
        groups={data.groups}
        facts={{ bpm: data.bpm, version: data.version, category: data.category }}
        locale={locale}
        images={images}
      />,
      fonts,
    )
  })