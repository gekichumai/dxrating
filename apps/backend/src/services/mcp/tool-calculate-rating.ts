import type { ComboFlag } from '@gekichumai/maimai-domain'
import { z } from 'zod'
import type { McpCatalog } from './catalog'
import { catalogInfo, catalogInfoSchema, sheetTypeSchema, structured, toolError } from './output'
import { achievementSchema, comboSchema, minAchievementFor, ratingOf, thresholdsOf } from './rating'
import { isRatingEligible, resolveSheets, sheetOnServer } from './sheets'

export const calculateRatingInput = {
  song: z
    .string()
    .max(200)
    .optional()
    .describe('The chart: a sheet ID (dsht_…), or a song ID or name with type and difficulty. Or give internal_level.'),
  type: sheetTypeSchema.optional().describe('Type of the chart of song: dx or std'),
  difficulty: z.string().max(40).optional().describe('Difficulty of the chart of song: basic … remaster'),
  server: z
    .string()
    .max(20)
    .optional()
    .describe('Game server (jp, intl, usa, cn), whose internal level is used where it differs. Default jp.'),
  internal_level: z.number().min(1).max(15).optional().describe('Internal level (譜面定数) instead of a chart: 13.7'),
  achievement: achievementSchema.optional(),
  combo: comboSchema,
  target_rating: z
    .number()
    .int()
    .min(1)
    .max(400)
    .optional()
    .describe('A rating of the chart to reach: the lowest achievement that gives it'),
}

const chartSchema = z.object({
  sheetId: z.string(),
  songId: z.string(),
  title: z.string(),
  type: z.string(),
  difficulty: z.string(),
  level: z.string(),
})

export const calculateRatingOutput = {
  chart: chartSchema.nullable().describe('The chart, when one was given'),
  server: z.string().nullable(),
  internalLevel: z.number(),
  result: z
    .object({
      achievement: z.number().int().describe('In 1/10000 of a percent'),
      combo: z.string().nullable(),
      rank: z.string().describe('SSS+, SSS, SS+, … D'),
      coefficient: z.number(),
      rating: z.number().int(),
    })
    .nullable()
    .describe('The rating of achievement, when one was given'),
  target: z
    .object({
      rating: z.number().int(),
      minAchievement: z
        .number()
        .int()
        .nullable()
        .describe('Lowest achievement that gives target_rating (without the AP bonus); null if none does'),
    })
    .nullable(),
  thresholds: z
    .array(z.object({ rank: z.string(), achievement: z.number().int(), rating: z.number().int() }))
    .describe('The rating at the lowest achievement of each rank from S to SSS+'),
  ...catalogInfoSchema,
}

export const calculateRatingTool = {
  name: 'calculate_rating',
  config: {
    title: 'Calculate chart rating',
    description:
      'The rating a maimai DX chart gives for an achievement, the achievement a rating needs, and the rating of ' +
      'each rank (S to SSS+). Give a chart (looked up with its current internal level) or an internal level. ' +
      'Achievements are integers in 1/10000 of a percent: 100.7543% is 1007543.',
    inputSchema: calculateRatingInput,
    outputSchema: calculateRatingOutput,
  },
}

export function runCalculateRating(
  catalog: McpCatalog,
  input: {
    song?: string
    type?: z.infer<typeof sheetTypeSchema>
    difficulty?: string
    server?: string
    internal_level?: number
    achievement?: number
    combo?: ComboFlag
    target_rating?: number
  },
) {
  if ((input.song === undefined) === (input.internal_level === undefined)) {
    return toolError('Give either a chart (song, with type and difficulty unless it is a sheet ID) or internal_level.')
  }

  let chart: z.infer<typeof chartSchema> | null = null
  let internalLevel = input.internal_level
  let server: string | undefined
  if (input.song !== undefined) {
    const resolved = resolveSheets(catalog, { ...input, song: input.song, server: input.server ?? 'jp' })
    if (!resolved.ok) return toolError(resolved.error)
    const sheets = resolved.sheets.filter(isRatingEligible)
    if (sheets.length !== 1) {
      const charts = (sheets.length > 0 ? sheets : resolved.sheets).map((s) => `${s.type} ${s.difficulty}`).join(', ')
      return toolError(
        sheets.length > 1
          ? `${resolved.entry.song.title} has several charts: ${charts}. Give type and difficulty, or a sheet ID.`
          : `${resolved.entry.song.title} has no chart that counts in ratings (utage charts do not): ${charts}.`,
      )
    }
    const [sheet] = sheets
    server = resolved.server
    const onServer = sheetOnServer(sheet, server)
    internalLevel = onServer.internalLevel
    chart = {
      sheetId: sheet.id,
      songId: resolved.entry.song.id,
      title: resolved.entry.song.title,
      type: sheet.type,
      difficulty: sheet.difficulty,
      level: onServer.level,
    }
  }
  const level = internalLevel!

  return structured({
    chart,
    server: server ?? null,
    internalLevel: level,
    result:
      input.achievement === undefined
        ? null
        : {
            achievement: input.achievement,
            combo: input.combo ?? null,
            ...ratingOf(level, input.achievement, input.combo),
          },
    target:
      input.target_rating === undefined
        ? null
        : { rating: input.target_rating, minAchievement: minAchievementFor(level, input.target_rating) },
    thresholds: thresholdsOf(level).filter((threshold) => threshold.rank.startsWith('S')),
    ...catalogInfo(catalog),
  })
}