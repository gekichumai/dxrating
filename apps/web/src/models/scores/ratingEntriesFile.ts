import { z } from 'zod'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'

/**
 * The rating files DXRating exports ("all records" and "Best 50" JSON): an array of saved entries. Files of every
 * past version import as they did. Unknown fields are kept; a malformed optional field (an unknown FC/FS flag, a
 * broken identity or source) is dropped instead of failing the whole file, as the calculator never relied on it.
 */

const COMBO_FLAGS = ['fc', 'fcp', 'ap', 'app'] as const
const SYNC_FLAGS = ['fs', 'fsp', 'fsd', 'fsdp', 'sync'] as const

const optionalDropped = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

const IdentitySchema = z.looseObject({
  songId: z.string().min(1),
  type: z.string().min(1),
  difficulty: z.string().min(1),
})

const SourceSchema = z.looseObject({
  provider: z.string().min(1),
  providerId: z.union([z.string(), z.number()]).optional(),
  providerSongName: z.string().optional(),
  best50Bucket: z.enum(['b15', 'b35']).optional(),
})

const ProviderConfigSchema = z.looseObject({
  divingFish: z
    .looseObject({
      ratingEligibility: z.enum(['b15', 'b35']).nullable(),
    })
    .optional(),
})

export const RatingFileEntrySchema = z.looseObject({
  sheetId: z.string().min(1),
  achievementRate: z.number().min(0).max(101),
  identity: optionalDropped(IdentitySchema),
  comboFlag: optionalDropped(z.enum(COMBO_FLAGS).nullable()),
  syncFlag: optionalDropped(z.enum(SYNC_FLAGS).nullable()),
  dxScore: optionalDropped(z.number().int().nonnegative()),
  source: optionalDropped(SourceSchema),
  providerConfig: optionalDropped(ProviderConfigSchema),
})

export const RatingFileSchema = z.array(RatingFileEntrySchema)

export type RatingFileParseResult =
  | { success: true; entries: PlayEntry[] }
  | { success: false; reason: 'invalid-json' | 'invalid-structure'; error: unknown }

/** Parses the text of a rating file. Nothing of an invalid file is used */
export function parseRatingFile(text: string): RatingFileParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { success: false, reason: 'invalid-json', error }
  }

  const result = RatingFileSchema.safeParse(json)
  if (!result.success) return { success: false, reason: 'invalid-structure', error: result.error }

  // Fields the schema dropped come out as `undefined`: leave them out, as `JSON.stringify` would
  const entries = result.data.map(
    (entry) =>
      Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as unknown as PlayEntry,
  )
  return { success: true, entries }
}