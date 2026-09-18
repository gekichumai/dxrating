import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import {
  calculateBest50,
  calculateRatingAward,
  getDxdataSongCatalog,
  type Best50Bucket,
  type RatingAward,
  type VersionedSheet,
} from '@gekichumai/maimai-domain'
import type { Context } from 'hono'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { type Scope, Sentry } from '../../../lib/functions/sentry.js'
import { fetchAsset, fetchImageAsset, getAssetSourceKey } from './assetFetcher.js'
import { calculateDXScoreStars } from './calculateDXScore.js'
import { demo } from './demo.js'
import {
  createOneshotRenderer,
  createRenderService,
  RenderQueueFullError,
  type Region,
} from '@gekichumai/oneshot-renderer'

export { ONESHOT_HEIGHT, ONESHOT_WIDTH } from '@gekichumai/oneshot-renderer'
export type { PlayerCollection, Region } from '@gekichumai/oneshot-renderer'

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

export interface RenderData extends PlayEntry {
  sheet: FlattenedSheet
  rating: RatingAward
  dxScore?: {
    achieved: number
    total: number
    stars: number
  }
  playCount: number
  allPerfectPlusCount: number
}

type FlattenedSheet = Omit<VersionedSheet, 'type' | 'difficulty' | 'isTypeUtage' | 'isRatingEligible'> & {
  type: TypeEnum.DX | TypeEnum.STD
  difficulty: DifficultyEnum
  isTypeUtage: false
  isRatingEligible: true
}

const RENDERABLE_DIFFICULTIES = new Set<string>(Object.values(DifficultyEnum))

export const isRenderableRatingSheet = (sheet: VersionedSheet): sheet is FlattenedSheet => {
  return (
    sheet.isRatingEligible &&
    !sheet.isTypeUtage &&
    (sheet.type === TypeEnum.DX || sheet.type === TypeEnum.STD) &&
    RENDERABLE_DIFFICULTIES.has(sheet.difficulty)
  )
}

const getFlattenedSheet = (version: VersionEnum, sheetId: string): FlattenedSheet | null => {
  const sheet = getDxdataSongCatalog(version).getById(sheetId)
  return sheet && isRenderableRatingSheet(sheet) ? sheet : null
}

export const enrichEntries = (entries: PlayEntry[], version: VersionEnum): RenderData[] => {
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

    const sheet = getFlattenedSheet(version, entry.sheetId)
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
        rating: calculateRatingAward(
          entry.sheetOverrides?.internalLevelValue ?? sheet.internalLevelValue ?? 0,
          entry.achievementRate,
          entry.achievementAccuracy ?? null,
        ),
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

export const prepareCalculatedEntries = (
  calculatedEntries: {
    b15: PlayEntry[]
    b35: PlayEntry[]
  },
  version: VersionEnum,
): { b15: RenderData[]; b35: RenderData[] } => {
  const prepared = {
    b15: enrichEntries(calculatedEntries.b15, version),
    b35: enrichEntries(calculatedEntries.b35, version),
  }

  prepared.b15.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })

  prepared.b35.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue
  })

  return prepared
}

interface RawBest50Candidate {
  bucket: Best50Bucket
  index: number
  renderData: RenderData
}

const compareRawBest50Candidates = (a: RawBest50Candidate, b: RawBest50Candidate): number => {
  return (
    b.renderData.rating.ratingAwardValue - a.renderData.rating.ratingAwardValue ||
    b.renderData.achievementRate - a.renderData.achievementRate ||
    a.index - b.index
  )
}

const deduplicateRawBest50Candidates = (candidates: RawBest50Candidate[]): RawBest50Candidate[] => {
  const bestBySheetId = new Map<string, RawBest50Candidate>()
  for (const candidate of candidates) {
    const existing = bestBySheetId.get(candidate.renderData.sheetId)
    if (!existing || compareRawBest50Candidates(candidate, existing) < 0) {
      bestBySheetId.set(candidate.renderData.sheetId, candidate)
    }
  }
  return Array.from(bestBySheetId.values())
}

export const calculateEntries = (
  entries: PlayEntry[],
  version: VersionEnum,
  region: Region,
): { b15: RenderData[]; b35: RenderData[] } => {
  const catalog = getDxdataSongCatalog(version)
  const candidates = deduplicateRawBest50Candidates(
    entries.flatMap((entry, index): RawBest50Candidate[] => {
      const renderData = enrichEntries([entry], version)[0]
      if (!renderData) return []

      const best50 = calculateBest50({
        catalog,
        version,
        region,
        entries: [
          {
            sheetId: renderData.sheetId,
            identity: renderData.sheet.identity,
            achievementRate: renderData.achievementRate,
            comboFlag: renderData.achievementAccuracy ?? null,
          },
        ],
      })
      const bucket = match({ hasB15: best50.b15.length > 0, hasB35: best50.b35.length > 0 })
        .with({ hasB15: true }, () => 'b15' as const)
        .with({ hasB35: true }, () => 'b35' as const)
        .otherwise(() => null)
      return bucket ? [{ bucket, index, renderData }] : []
    }),
  )

  const b15Ids = new Set(
    candidates
      .filter((entry) => entry.bucket === 'b15')
      .sort(compareRawBest50Candidates)
      .slice(0, 15)
      .map((entry) => entry.renderData.sheetId),
  )

  return {
    b15: candidates
      .filter((entry) => b15Ids.has(entry.renderData.sheetId))
      .sort(compareRawBest50Candidates)
      .map((entry) => entry.renderData),
    b35: candidates
      .filter((entry) => !b15Ids.has(entry.renderData.sheetId))
      .filter((entry) => entry.bucket === 'b35')
      .sort(compareRawBest50Candidates)
      .slice(0, 35)
      .map((entry) => entry.renderData),
  }
}

type OneshotRequest = z.infer<typeof requestBodySchema>
let service: { source: string; render: ReturnType<typeof createRenderService<OneshotRequest>> } | undefined

const getRenderService = () => {
  const source = getAssetSourceKey()
  if (!service || service.source !== source) {
    const draw = createOneshotRenderer({
      loadAsset: fetchAsset,
      loadImage: fetchImageAsset,
      revision: process.env.GIT_COMMIT ?? 'unknown',
    })
    service = {
      source,
      render: createRenderService(async (body: OneshotRequest, options) => {
        const start = performance.now()
        const data = body.calculatedEntries
          ? prepareCalculatedEntries(body.calculatedEntries, body.version)
          : calculateEntries(body.entries ?? [], body.version, body.region)
        const calc = performance.now() - start
        const result = await draw(
          { data, version: body.version, region: body.region, playerCollection: body.playerCollection },
          options,
        )
        return { ...result, timings: { calc, ...result.timings } }
      }),
    }
  }
  return service.render
}

export const handler = async (c: Context): Promise<Response> => {
  return Sentry.startSpan({ name: 'renderOneshot', op: 'function' }, async () => {
    const queryDemo = c.req.query('demo')
    const queryPixelated = c.req.query('pixelated')
    const queryFormat = c.req.query('format')
    const queryWidth = c.req.query('width')
    const format = queryPixelated ? (queryFormat === 'png' ? 'png' : 'jpeg') : 'svg'

    try {
      const body = queryDemo
        ? {
            entries: demo,
            version: VersionEnum.PRiSMPLUS,
            region: 'jp' as const,
            playerCollection: { name: 'お友達', icon: 0 },
            calculatedEntries: undefined,
          }
        : requestBodySchema.parse(await c.req.json())
      const result = await getRenderService()(body, {
        format,
        width: queryWidth === undefined ? undefined : Number.parseInt(queryWidth),
      })

      if (result.cache === 'MISS') {
        const observations = result.timings
        c.header(
          'Server-Timing',
          Object.entries(observations)
            .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
            .join(', '),
        )
        for (const [name, duration] of Object.entries(observations)) {
          Sentry.metrics.distribution(`oneshot_render.stage.${name}`, duration, {
            unit: 'millisecond',
            attributes: { format },
          })
        }
      } else {
        c.header('Server-Timing', `cache;desc="${result.cache.toLowerCase()}"`)
      }
      c.header('Content-Type', result.contentType)
      c.header('X-Cache', result.cache)
      return c.body(result.body)
    } catch (error) {
      if (error instanceof RenderQueueFullError) {
        c.header('Retry-After', '1')
        return c.text(error.message, 503)
      }
      Sentry.withScope((scope: Scope) => {
        scope.setContext('function', { name: 'renderOneshot' })
        scope.setContext('parameters', { demo: !!queryDemo, format, width: queryWidth })
        Sentry.captureException(error)
      })
      throw error
    }
  })
}