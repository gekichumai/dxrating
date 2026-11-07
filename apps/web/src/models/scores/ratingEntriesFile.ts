import {
  ACHIEVEMENT_INT_MAX,
  ACHIEVEMENT_INT_MIN,
  fromAchievementInt,
  type ImportProvider,
  ScoreSourceSchema,
} from '@gekichumai/maimai-domain'
import { z } from 'zod'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { providerOfSource } from './cloudScoreMapping'

/**
 * The rating files DXRating exports ("all records" and "Best 50" JSON): an array of saved entries. Files of every
 * past version import as they did. Unknown fields are kept; a malformed optional field (an unknown FC/FS flag, a
 * broken identity or source) is dropped instead of failing the whole file, as the calculator never relied on it.
 *
 * The achievement must be a number, but its range is not checked: earlier versions of the add form saved what was
 * typed (an empty field as `NaN`, written as `null`, and values outside 0..101), and the "all records" export writes
 * the save as it is. Such entries import unchanged, as before, so a save and its export keep round-tripping; they
 * never make a valid record (`LocalScoreRepository` leaves them out of `list()`).
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
  achievementRate: z.number().nullable(),
  identity: optionalDropped(IdentitySchema),
  comboFlag: optionalDropped(z.enum(COMBO_FLAGS).nullable()),
  syncFlag: optionalDropped(z.enum(SYNC_FLAGS).nullable()),
  dxScore: optionalDropped(z.number().int().nonnegative()),
  source: optionalDropped(SourceSchema),
  providerConfig: optionalDropped(ProviderConfigSchema),
})

export const RatingFileSchema = z.array(RatingFileEntrySchema)

/**
 * "Download my data" (`GET /me/export`, design §11.3): `{ format, version, exportedAt, saves: [{ id, name, region,
 * records: [...] }] }`. Each save's records are a superset of rating file entries, with the record's `provenance`.
 * Imported again, they are a rating file like any other: `client_reported`, the provenance in the file only claimed
 * (a record keeps the provider its provenance names, which a cloud save stores as `claimedSource`).
 */
export const CLOUD_EXPORT_FORMAT = 'dxrating-cloud-save-export'

const CloudExportRecordSchema = z.looseObject({
  sheetId: z.string().min(1),
  achievement: z.number().int().min(ACHIEVEMENT_INT_MIN).max(ACHIEVEMENT_INT_MAX).optional().catch(undefined),
  achievementRate: z.number(),
  comboFlag: optionalDropped(z.enum(COMBO_FLAGS).nullable()),
  syncFlag: optionalDropped(z.enum(SYNC_FLAGS).nullable()),
  dxScore: optionalDropped(z.number().int().nonnegative().nullable()),
  best50Bucket: optionalDropped(z.enum(['b15', 'b35']).nullable()),
  providerRecordId: optionalDropped(z.string().nullable()),
  provenance: optionalDropped(
    z.looseObject({
      source: z.string(),
      claimedSource: z.string().nullable().optional(),
      fetchedBy: z.string().optional(),
    }),
  ),
})

const CloudExportSchema = z.looseObject({
  format: z.literal(CLOUD_EXPORT_FORMAT),
  version: z.number().int().positive(),
  saves: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      region: z.string(),
      deletedAt: z.string().nullable().optional(),
      records: z.array(z.unknown()),
    }),
  ),
})

/** One save of a "Download my data" file */
export interface CloudExportSave {
  id: string
  name: string
  region: string
  entries: PlayEntry[]
}

const IMPORT_PROVIDERS: readonly string[] = ['lxns', 'maimai-net', 'diving-fish', 'aqua-dx', 'mu-net', 'aqua-sqlite']

/** The provider a file record claims: the provider of its source, else the provider its provenance claimed */
function claimedProviderOf(provenance: { source: string; claimedSource?: string | null } | undefined) {
  if (!provenance) return undefined
  for (const candidate of [provenance.source, provenance.claimedSource]) {
    if (!candidate) continue
    const source = ScoreSourceSchema.safeParse(candidate)
    const provider = source.success ? providerOfSource(source.data) : undefined
    if (provider) return provider
    if (IMPORT_PROVIDERS.includes(candidate)) return candidate as ImportProvider
  }
  return undefined
}

/** A rating file entry of an exported record; the provenance becomes a claimed provider, nothing else of it is kept */
function exportRecordToEntry(record: z.output<typeof CloudExportRecordSchema>): PlayEntry {
  const entry: PlayEntry = {
    sheetId: record.sheetId,
    // The integer is exact; the percentage is what older files carry
    achievementRate: record.achievement !== undefined ? fromAchievementInt(record.achievement) : record.achievementRate,
    comboFlag: record.comboFlag ?? null,
    syncFlag: record.syncFlag ?? null,
  }
  if (typeof record.dxScore === 'number') entry.dxScore = record.dxScore
  const provider = claimedProviderOf(record.provenance)
  if (provider) {
    entry.source = { provider }
    if (record.providerRecordId) entry.source.providerId = record.providerRecordId
    if (record.best50Bucket) entry.source.best50Bucket = record.best50Bucket
  }
  // The calculator reads the best 50 hint from `providerConfig` (as `cloudRecordToPlayEntry` writes it): a
  // Diving-Fish record, or one a client uploaded (a backup, a rating file) that kept its device's hint without
  // claiming a provider
  const hint = record.provenance
  if (
    record.best50Bucket &&
    (hint?.source === 'diving-fish' || hint?.source === 'legacy-local' || hint?.fetchedBy === 'client')
  ) {
    entry.providerConfig = { divingFish: { ratingEligibility: record.best50Bucket } }
  }
  return entry
}

/** The saves of a "Download my data" file with records (deleted saves left out); `null` for any other JSON */
export function parseCloudExport(json: unknown): CloudExportSave[] | null {
  const parsed = CloudExportSchema.safeParse(json)
  if (!parsed.success) return null
  return parsed.data.saves
    .filter((save) => !save.deletedAt)
    .map((save) => ({
      id: save.id,
      name: save.name,
      region: save.region,
      entries: save.records.flatMap((record) => {
        const result = CloudExportRecordSchema.safeParse(record)
        return result.success ? [exportRecordToEntry(result.data)] : []
      }),
    }))
    .filter((save) => save.entries.length > 0)
}

export type RatingFileParseResult =
  | { success: true; entries: PlayEntry[] }
  /** A "Download my data" file: the caller picks a save (`saves` has at least one) */
  | { success: true; cloudExport: CloudExportSave[] }
  | { success: false; reason: 'invalid-json' | 'invalid-structure'; error: unknown }

/** Parses the text of a rating file. Nothing of an invalid file is used */
export function parseRatingFile(text: string): RatingFileParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { success: false, reason: 'invalid-json', error }
  }

  const cloudExport = parseCloudExport(json)
  if (cloudExport) {
    if (cloudExport.length === 0) return { success: false, reason: 'invalid-structure', error: 'empty export' }
    return { success: true, cloudExport }
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