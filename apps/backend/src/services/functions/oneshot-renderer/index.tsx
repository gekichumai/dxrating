import { type Sheet, type Song, VersionEnum, dxdata } from '@gekichumai/dxdata'
import { Resvg } from '@resvg/resvg-js'
import type { Context } from 'hono'
import fs from 'node:fs/promises'
import satori, { type Font } from 'satori'
import sharp from 'sharp'
import { z } from 'zod'
import { type Scope, Sentry } from '../../../lib/functions/sentry'
import { calculateDXScoreStars } from './calculateDXScore'
import { type Rating, calculateRating } from './calculateRating'
import { demo } from './demo'
import { renderContent } from './renderContent'

export const ONESHOT_HEIGHT = 1300
export const ONESHOT_WIDTH = 1500

export const ASSETS_BASE_DIR = process.env.ASSETS_BASE_DIR

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export type PlayerCollection = {
  name: string
  icon: number
}

export const playEntrySchema = z.object({
  sheetId: z.string(),
  sheetOverrides: z
    .object({
      internalLevelValue: z.number().optional(),
    })
    .optional(),
  achievementRate: z.number().min(0).max(101),
  playCount: z.number().min(0).optional(),
  allPerfectPlusCount: z.number().min(0).optional(),
  achievementAccuracy: z.enum(['fc', 'fcp', 'ap', 'app']).optional(),
  achievementSync: z.enum(['sp', 'fs', 'fsp', 'fsd', 'fsdp']).optional(),
  achievementDXScore: z
    .object({
      achieved: z.number(),
      total: z.number(),
    })
    .optional(),
})

export type PlayEntry = z.infer<typeof playEntrySchema>

export const requestBodySchema = z.object({
  entries: z.array(playEntrySchema).optional(),
  version: z.nativeEnum(VersionEnum),
  region: z.enum(['jp', 'intl', 'cn', '_generic']),
  playerCollection: z
    .object({
      name: z.string(),
      icon: z.number(),
    })
    .optional(),
  calculatedEntries: z
    .object({
      b15: z.array(playEntrySchema),
      b35: z.array(playEntrySchema),
    })
    .optional(),
})

// declare a new attribute `tw` for JSX elements
declare module 'react' {
  interface HTMLAttributes<T> {
    tw?: string
  }
}

export interface RenderData extends PlayEntry {
  sheet: FlattenedSheet
  rating: Rating
  dxScore?: {
    achieved: number
    total: number
    stars: number
  }
  playCount: number
  allPerfectPlusCount: number
}
const CANONICAL_ID_PARTS_SEPARATOR = '__dxrt__'

const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join(CANONICAL_ID_PARTS_SEPARATOR)
}

const getFlattenedSheetsMap = () => {
  const calcFlattenedSheets = (version: VersionEnum): FlattenedSheet[] => {
    const songs = dxdata.songs
    const flattenedSheets = songs.flatMap((song) => {
      return song.sheets.map((sheet) => {
        return {
          ...song,
          ...sheet,
          id: canonicalId(song, sheet),
          internalLevelValue: sheet.multiverInternalLevelValue
            ? (sheet.multiverInternalLevelValue[version] ?? sheet.internalLevelValue)
            : sheet.internalLevelValue,
        }
      })
    })
    return flattenedSheets as FlattenedSheet[]
  }

  const cachedFlattenedSheets: Map<VersionEnum, Map<string, FlattenedSheet>> = new Map()
  for (const version of Object.values(VersionEnum)) {
    const calc = calcFlattenedSheets(version)
    const map = new Map<string, FlattenedSheet>()
    for (const sheet of calc) {
      map.set(sheet.id, sheet)
    }
    cachedFlattenedSheets.set(version, map)
  }
  return cachedFlattenedSheets
}

const flattenedSheets = getFlattenedSheetsMap()

const fetchFontPack = async (): Promise<Font[]> => {
  const fontConfig = [
    {
      name: 'NewRodinProDB',
      file: 'NewRodinProDB.otf',
      weight: 400 as const,
    },
    {
      name: 'SeuratProDB',
      file: 'SeuratProDB.otf',
      weight: 400 as const,
    },
    {
      name: 'Source Han Sans',
      file: 'SourceHanSansJP-Regular.otf',
      weight: 400 as const,
    },
    {
      name: 'Source Han Sans',
      file: 'SourceHanSansJP-Medium.otf',
      weight: 500 as const,
    },
    {
      name: 'Source Han Sans',
      file: 'SourceHanSansJP-Bold.otf',
      weight: 700 as const,
    },
  ]
  const fonts = await Promise.all(fontConfig.map(async (font) => fs.readFile(`${ASSETS_BASE_DIR}/fonts/${font.file}`)))
  if (!fonts.every((font) => font instanceof Buffer)) {
    console.error('Failed to load at least one font')
    return []
  }
  return fontConfig.map((font, i) => ({
    name: font.name,
    data: fonts[i],
    weight: font.weight,
    style: 'normal',
  }))
}

let cachedFonts: Font[] | null = null

type FlattenedSheet = Song &
  Sheet & {
    id: string
    isTypeUtage: boolean
    isRatingEligible: boolean
    tags: number[]
    releaseDateTimestamp: number
  }

const enrichEntries = (entries: PlayEntry[], version: VersionEnum) => {
  return entries.flatMap((entry) => {
    // check data validity
    if (
      !entry.sheetId ||
      typeof entry.achievementRate !== 'number' ||
      entry.achievementRate < 0 ||
      entry.achievementRate > 101 ||
      (entry.achievementAccuracy && !['fc', 'fcp', 'ap', 'app'].includes(entry.achievementAccuracy)) ||
      (entry.achievementSync && !['sp', 'fs', 'fsp', 'fsd', 'fsdp'].includes(entry.achievementSync)) ||
      (entry.playCount && (typeof entry.playCount !== 'number' || entry.playCount < 0)) ||
      (entry.allPerfectPlusCount && (typeof entry.allPerfectPlusCount !== 'number' || entry.allPerfectPlusCount < 0)) ||
      (entry.achievementDXScore &&
        (typeof entry.achievementDXScore.achieved !== 'number' ||
          typeof entry.achievementDXScore.total !== 'number' ||
          entry.achievementDXScore.achieved < 0 ||
          entry.achievementDXScore.total < 0))
    ) {
      return []
    }

    const sheet = flattenedSheets.get(version)?.get(entry.sheetId)
    if (!sheet) {
      return []
    }
    return [
      {
        ...entry,
        sheet: {
          ...sheet,
          internalLevelValue: entry.sheetOverrides?.internalLevelValue ?? sheet.internalLevelValue,
        },
        rating: sheet
          ? calculateRating(
              entry.sheetOverrides?.internalLevelValue ?? sheet.internalLevelValue ?? 0,
              entry.achievementRate,
            )
          : undefined,
        dxScore: entry.achievementDXScore
          ? {
              achieved: entry.achievementDXScore.achieved,
              total: entry.achievementDXScore.total,
              stars: calculateDXScoreStars(entry.achievementDXScore.achieved, entry.achievementDXScore.total),
            }
          : undefined,
        playCount: entry.playCount ?? 0,
        allPerfectPlusCount: entry.allPerfectPlusCount ?? 0,
      },
    ]
  })
}

const prepareCalculatedEntries = (
  calculatedEntries: {
    b15: PlayEntry[]
    b35: PlayEntry[]
  },
  version: VersionEnum,
): { b15: RenderData[]; b35: RenderData[] } => {
  const prepared = {
    b15: enrichEntries(calculatedEntries.b15, version).filter((entry) => entry.sheet && entry.rating) as RenderData[],
    b35: enrichEntries(calculatedEntries.b35, version).filter((entry) => entry.sheet && entry.rating) as RenderData[],
  }

  prepared.b15.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })

  prepared.b35.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })

  return prepared
}

const calculateEntries = (entries: PlayEntry[], version: VersionEnum): { b15: RenderData[]; b35: RenderData[] } => {
  const mapped = enrichEntries(entries, version).filter((entry) => entry.sheet && entry.rating) as RenderData[]

  const b15 = mapped
    .filter((entry) => entry.sheet.version === version)
    .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
    .slice(0, 15)

  const b35 = mapped
    .filter((entry) => entry.sheet.version !== version)
    .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
    .slice(0, 35)

  b15.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })

  b35.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })
  return {
    b15,
    b35,
  }
}

interface ServerTimingTimerObservation {
  name: string
  duration: number
}

const createServerTimingTimer = () => {
  const observations: ServerTimingTimerObservation[] = []
  return {
    start: (name: string) => {
      observations.push({
        name,
        duration: Date.now(),
      })
    },
    stop: (name: string) => {
      const obs = observations.find((o) => o.name === name)
      if (obs) {
        obs.duration = Date.now() - obs.duration
      }
    },
    get: () => {
      return observations.map((obs) => `${obs.name};dur=${obs.duration}`)
    },
  }
}

export const handler = async (c: Context): Promise<Response> => {
  return await Sentry.startSpan({ name: 'renderOneshot', op: 'function' }, async () => {
    const queryDemo = c.req.query('demo')
    const queryPixelated = c.req.query('pixelated')
    const queryFormat = c.req.query('format')
    const queryWidth = c.req.query('width')

    Sentry.addBreadcrumb({
      message: 'Starting oneshot render',
      category: 'init',
      data: {
        demo: !!queryDemo,
        pixelated: !!queryPixelated,
        format: queryFormat || 'svg',
      },
      level: 'info',
    })

    const body = queryDemo
      ? ({
          entries: demo,
          version: VersionEnum.PRiSMPLUS,
          region: 'jp' as const,
          playerCollection: {
            name: 'お友達',
            icon: 0,
          },
          calculatedEntries: undefined,
        } as const)
      : requestBodySchema.parse(await c.req.json())

    const version = body.version
    const region = body.region
    const playerCollection = body.playerCollection

    Sentry.addBreadcrumb({
      message: 'Parsed request body',
      category: 'validation',
      data: {
        version,
        region,
        hasPlayerCollection: !!playerCollection,
        entryCount: body.entries?.length || 0,
        hasCalculatedEntries: !!body.calculatedEntries,
      },
      level: 'info',
    })

    const timer = createServerTimingTimer()

    timer.start('font')
    Sentry.addBreadcrumb({
      message: 'Loading fonts',
      category: 'resource',
      level: 'info',
    })
    if (!cachedFonts) {
      cachedFonts = await fetchFontPack()
    }
    const fonts = cachedFonts
    timer.stop('font')

    timer.start('calc')
    Sentry.addBreadcrumb({
      message: 'Calculating entries',
      category: 'processing',
      level: 'info',
    })
    const data = body.calculatedEntries
      ? prepareCalculatedEntries(body.calculatedEntries, version)
      : calculateEntries(body.entries ?? [], version)
    timer.stop('calc')

    Sentry.addBreadcrumb({
      message: 'Entries calculated',
      category: 'success',
      data: {
        b15Count: data.b15.length,
        b35Count: data.b35.length,
      },
      level: 'info',
    })

    timer.start('jsx')
    Sentry.addBreadcrumb({
      message: 'Rendering JSX content',
      category: 'render',
      level: 'info',
    })
    const content = await renderContent({ data, version, region, playerCollection })
    timer.stop('jsx')

    timer.start('satori')
    Sentry.addBreadcrumb({
      message: 'Converting JSX to SVG',
      category: 'render',
      level: 'info',
    })
    const svg = await satori(content, {
      width: ONESHOT_WIDTH,
      height: ONESHOT_HEIGHT,
      fonts,
      tailwindConfig: {
        theme: {
          fontFamily: {
            sans: 'Source Han Sans, sans-serif',
            newrodin: 'NewRodinProDB, sans-serif',
            seurat: 'SeuratProDB, sans-serif',
          },
        },
      },
    })
    timer.stop('satori')

    if (queryPixelated) {
      Sentry.addBreadcrumb({
        message: 'Starting pixelated rendering',
        category: 'render',
        level: 'info',
      })

      timer.start('resvg_init')
      const resvg = new Resvg(svg, {
        languages: ['en', 'ja'],
        shapeRendering: 2,
        textRendering: 2,
        imageRendering: 0,
        fitTo: {
          mode: 'width',
          value: ONESHOT_WIDTH * 2,
        },
      })
      timer.stop('resvg_init')

      timer.start('resvg_render')
      const pngData = resvg.render()
      timer.stop('resvg_render')

      timer.start('resvg_as_png')
      const pngBuffer = pngData.asPng()
      timer.stop('resvg_as_png')

      let width = typeof queryWidth === 'string' ? Number.parseInt(queryWidth) : ONESHOT_WIDTH * 2
      if (Number.isNaN(width) || !Number.isFinite(width) || width < 1 || width > 3000) {
        width = ONESHOT_WIDTH * 2
      }

      timer.start('result_buffer')
      Sentry.addBreadcrumb({
        message: 'Processing final image',
        category: 'render',
        data: { width, format: queryFormat },
        level: 'info',
      })
      const { buffer, type } = await (async () => {
        let s = sharp(pngBuffer)
        if (width !== ONESHOT_WIDTH * 2) {
          s = s.resize({ width })
        }

        if (queryFormat === 'png') {
          return { buffer: await s.png().toBuffer(), type: 'image/png' }
        }

        return {
          buffer: await s.jpeg({ quality: 90, progressive: true }).toBuffer(),
          type: 'image/jpeg',
        }
      })()
      timer.stop('result_buffer')

      Sentry.addBreadcrumb({
        message: 'Successfully rendered pixelated image',
        category: 'success',
        data: {
          type,
          bufferSize: buffer.length,
          width,
        },
        level: 'info',
      })

      c.header('Server-Timing', timer.get().join(', '))
      c.header('Content-Type', type)
      return c.body(buffer as any)
    }

    Sentry.addBreadcrumb({
      message: 'Successfully rendered SVG',
      category: 'success',
      data: {
        svgSize: svg.length,
      },
      level: 'info',
    })

    c.header('Server-Timing', timer.get().join(', '))
    c.header('Content-Type', 'image/svg+xml')
    try {
      return c.body(svg)
    } catch (error) {
      if (error instanceof Error) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'renderOneshot' })
          scope.setContext('parameters', {
            demo: !!queryDemo,
            pixelated: !!queryPixelated,
            format: queryFormat,
            width: queryWidth,
          })
          Sentry.captureException(error)
        })
      }
      throw error
    }
  })
}
