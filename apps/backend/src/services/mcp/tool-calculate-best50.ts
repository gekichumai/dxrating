import type { VersionEnum } from '@gekichumai/dxdata'
import { isB15Sheet, isB35Sheet, type ComboFlag } from '@gekichumai/maimai-domain'
import { z } from 'zod'
import type { McpCatalog } from './catalog'
import { catalogInfo, catalogInfoSchema, sheetTypeSchema, structured, toolError } from './output'
import { achievementSchema, comboSchema, RANK_THRESHOLDS, ratingOf } from './rating'
import { currentVersion, isRatingEligible, parseServer, resolveSheets, sheetOnServer, versionOrder } from './sheets'

const MAX_SCORES = 300
const BUCKET_SIZES = { b15: 15, b35: 35 } as const
type Bucket = keyof typeof BUCKET_SIZES
const DEFAULT_SUGGESTIONS = 10

export const calculateBest50Input = {
  scores: z
    .array(
      z.object({
        song: z.string().min(1).max(200).describe('Sheet ID (dsht_…), or song ID or name with type and difficulty'),
        type: sheetTypeSchema.optional().describe('dx or std'),
        difficulty: z.string().max(40).optional().describe('basic, advanced, expert, master or remaster'),
        achievement: achievementSchema,
        combo: comboSchema,
      }),
    )
    .min(1)
    .max(MAX_SCORES)
    .describe(`The scores of the player, up to ${MAX_SCORES}; of a chart given twice the better one counts`),
  server: z.string().max(20).optional().describe('Game server the player plays on: jp (default), intl, usa or cn'),
  version: z
    .string()
    .max(40)
    .optional()
    .describe('Game version whose new charts make the new 15 (b15): PRiSM PLUS. Default: the newest on the server.'),
  suggestions: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(`Most suggestions of scores to improve, 0 to 50. Default ${DEFAULT_SUGGESTIONS}.`),
}

const entrySchema = z.object({
  sheetId: z.string(),
  songId: z.string(),
  title: z.string(),
  type: z.string(),
  difficulty: z.string(),
  level: z.string(),
  internalLevel: z.number(),
  version: z.string(),
  achievement: z.number().int().describe('In 1/10000 of a percent'),
  combo: z.string().nullable(),
  rank: z.string(),
  rating: z.number().int(),
})

const bucketSchema = z.object({
  total: z.number().int(),
  count: z.number().int(),
  min: z.number().int().nullable().describe('Rating of the lowest entry, which a new score must beat once it is full'),
  entries: z.array(entrySchema),
})

export const calculateBest50Output = {
  server: z.string(),
  version: z.string().describe('Game version of the new 15'),
  rating: z.number().int().describe('The rating of the player: the total of b15 and b35'),
  b15: bucketSchema.describe('Best 15 of the charts of the current version (and, since CiRCLE, the version before)'),
  b35: bucketSchema.describe('Best 35 of the older charts'),
  suggestions: z
    .array(
      entrySchema.pick({ sheetId: true, title: true, type: true, difficulty: true, internalLevel: true }).extend({
        achievement: z.number().int(),
        targetRank: z.string(),
        targetAchievement: z.number().int(),
        ratingGain: z.number().int().describe('What the rating of the player would gain'),
      }),
    )
    .describe('Scores to improve, by the gain of the next rank that raises the rating, highest first'),
  unmatched: z
    .array(z.object({ index: z.number().int(), song: z.string(), reason: z.string() }))
    .describe('Scores not counted, with why'),
  ...catalogInfoSchema,
}

export const calculateBest50Tool = {
  name: 'calculate_best50',
  config: {
    title: 'Calculate Best 50 rating',
    description:
      "A maimai DX player's rating from their scores: the new 15 (b15) and old 35 (b35), with each chart's rating, " +
      'and the scores whose next rank would raise the rating most. Achievements are integers in 1/10000 of a ' +
      'percent: 100.7543% is 1007543.',
    inputSchema: calculateBest50Input,
    outputSchema: calculateBest50Output,
  },
}

type Entry = z.infer<typeof entrySchema> & { bucket: Bucket; comboFlag: ComboFlag | undefined }

const byRating = (a: Entry, b: Entry) => b.rating - a.rating || b.achievement - a.achievement

export function runCalculateBest50(
  catalog: McpCatalog,
  input: {
    scores: {
      song: string
      type?: z.infer<typeof sheetTypeSchema>
      difficulty?: string
      achievement: number
      combo?: ComboFlag
    }[]
    server?: string
    version?: string
    suggestions?: number
  },
) {
  const parsedServer = parseServer(catalog, input.server ?? 'jp')
  if (!parsedServer.ok) return toolError(parsedServer.error)
  const server = parsedServer.server!
  const version = input.version?.trim() ?? currentVersion(catalog, server)
  if (version === undefined || versionOrder(version) === undefined) {
    return toolError(`Unknown game version ${JSON.stringify(input.version)}: PRiSM, PRiSM PLUS, CiRCLE, …`)
  }

  const unmatched: { index: number; song: string; reason: string }[] = []
  const best = new Map<string, Entry>()
  input.scores.forEach((score, index) => {
    const skip = (reason: string) => unmatched.push({ index, song: score.song, reason })
    const resolved = resolveSheets(catalog, { ...score, server })
    if (!resolved.ok) return skip(resolved.error)
    const sheets = resolved.sheets.filter(isRatingEligible)
    if (sheets.length !== 1) {
      return skip(
        sheets.length > 1
          ? `Several charts: ${sheets.map((s) => `${s.type} ${s.difficulty}`).join(', ')}. Give type and difficulty.`
          : 'Utage charts do not count in ratings.',
      )
    }
    const [sheet] = sheets
    const onServer = sheetOnServer(sheet, server)
    const bucket = isB15Sheet(onServer.version as VersionEnum, version as VersionEnum, 'jp')
      ? 'b15'
      : isB35Sheet(onServer.version as VersionEnum, version as VersionEnum, 'jp')
        ? 'b35'
        : undefined
    if (!bucket) return skip(`The chart is of ${onServer.version}, newer than ${version}.`)
    const entry: Entry = {
      sheetId: sheet.id,
      songId: resolved.entry.song.id,
      title: resolved.entry.song.title,
      type: sheet.type,
      difficulty: sheet.difficulty,
      level: onServer.level,
      internalLevel: onServer.internalLevel,
      version: onServer.version,
      achievement: score.achievement,
      combo: score.combo ?? null,
      ...ratingOf(onServer.internalLevel, score.achievement, score.combo),
      bucket,
      comboFlag: score.combo,
    }
    const existing = best.get(sheet.id)
    if (!existing || byRating(entry, existing) < 0) best.set(sheet.id, entry)
  })

  const all = [...best.values()].sort(byRating)
  const buckets = Object.fromEntries(
    (Object.keys(BUCKET_SIZES) as Bucket[]).map((bucket) => {
      const entries = all.filter((entry) => entry.bucket === bucket).slice(0, BUCKET_SIZES[bucket])
      return [bucket, entries]
    }),
  ) as Record<Bucket, Entry[]>
  const counted = new Set([...buckets.b15, ...buckets.b35])

  const suggestions = all
    .flatMap((entry) => {
      const entries = buckets[entry.bucket]
      // a score in its bucket gains its own increase; one outside it replaces the lowest once the bucket is full
      const floor = counted.has(entry)
        ? entry.rating
        : entries.length < BUCKET_SIZES[entry.bucket]
          ? 0
          : entries.at(-1)!.rating
      for (const threshold of RANK_THRESHOLDS) {
        if (threshold.achievement <= entry.achievement) continue
        const gain = ratingOf(entry.internalLevel, threshold.achievement, entry.comboFlag).rating - floor
        if (gain > 0) {
          return [
            {
              sheetId: entry.sheetId,
              title: entry.title,
              type: entry.type,
              difficulty: entry.difficulty,
              internalLevel: entry.internalLevel,
              achievement: entry.achievement,
              targetRank: threshold.rank,
              targetAchievement: threshold.achievement,
              ratingGain: gain,
            },
          ]
        }
      }
      return []
    })
    .sort(
      (a, b) =>
        b.ratingGain - a.ratingGain || a.targetAchievement - a.achievement - (b.targetAchievement - b.achievement),
    )
    .slice(0, input.suggestions ?? DEFAULT_SUGGESTIONS)

  const summary = (entries: Entry[]) => ({
    total: entries.reduce((sum, entry) => sum + entry.rating, 0),
    count: entries.length,
    min: entries.at(-1)?.rating ?? null,
    entries: entries.map(({ bucket: _bucket, comboFlag: _comboFlag, ...entry }) => entry),
  })
  const b15 = summary(buckets.b15)
  const b35 = summary(buckets.b35)
  return structured({
    server,
    version,
    rating: b15.total + b35.total,
    b15,
    b35,
    suggestions,
    unmatched,
    ...catalogInfo(catalog),
  })
}