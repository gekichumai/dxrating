import type { ComboFlag, RatingEntry, SongCatalog, SyncFlag, VersionedSheet } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'

export interface UserRecord {
  /** The highest-achievement stored entry of the sheet */
  entry: PlayEntry
  /** The catalog sheet of the record; null while the catalog lacks it */
  sheet: VersionedSheet | null
  /** Best result of every field across all stored entries of the sheet (a lower score can carry the AP / FDX) */
  best: { achievementRate: number; comboFlag: ComboFlag; syncFlag: SyncFlag }
  /** Import metadata (CN Diving Fish bucket hint), from any stored entry of the sheet */
  source: RatingEntry['source']
}

const COMBO_RANK: readonly ComboFlag[] = [null, 'fc', 'fcp', 'ap', 'app']
const SYNC_RANK: readonly SyncFlag[] = [null, 'sync', 'fs', 'fsp', 'fsd', 'fsdp']

function strongest<T>(rank: readonly T[], a: T, b: T): T {
  return rank.indexOf(b) > rank.indexOf(a) ? b : a
}

/**
 * The import metadata of a stored entry, as the rating calculator reads it: the persisted Diving Fish
 * `providerConfig` wins, then an explicit `source`.
 */
export function playEntrySource(entry: PlayEntry): RatingEntry['source'] {
  const bucket = entry.providerConfig?.divingFish?.ratingEligibility
  return bucket ? { provider: 'diving-fish', best50Bucket: bucket } : entry.source
}

/** Every stored entry (duplicates included: B50 deduplicates by rating) as the domain input of `calculateBest50` */
export function toRatingEntries(entries: readonly PlayEntry[], catalog: SongCatalog): RatingEntry[] {
  return entries.flatMap((entry): RatingEntry[] => {
    const identity = entry.identity ?? catalog.getById(entry.sheetId)?.identity
    if (!identity) return []
    return [
      {
        sheetId: entry.sheetId,
        identity,
        achievementRate: entry.achievementRate,
        comboFlag: entry.comboFlag,
        syncFlag: entry.syncFlag,
        source: playEntrySource(entry),
      },
    ]
  })
}

const hasBucketHint = (source: RatingEntry['source']) =>
  source?.provider === 'diving-fish' && source.best50Bucket !== undefined

/** An authoritative bucket hint from any duplicate wins (as in calculateBest50), then the preferred entry's source */
function chooseSource(preferred: RatingEntry['source'], other: RatingEntry['source']): RatingEntry['source'] {
  if (hasBucketHint(preferred)) return preferred
  if (hasBucketHint(other)) return other
  return preferred ?? other
}

/** One record per sheet: the highest-achievement entry, with each flag aggregated independently */
export function groupUserRecords(
  entries: readonly PlayEntry[],
  getSheet: (sheetId: string) => VersionedSheet | null,
): Map<string, UserRecord> {
  const bySheetId = new Map<string, UserRecord>()
  for (const entry of entries) {
    const existing = bySheetId.get(entry.sheetId)
    if (!existing) {
      bySheetId.set(entry.sheetId, {
        entry,
        sheet: getSheet(entry.sheetId),
        best: {
          achievementRate: entry.achievementRate,
          comboFlag: entry.comboFlag ?? null,
          syncFlag: entry.syncFlag ?? null,
        },
        source: playEntrySource(entry),
      })
      continue
    }
    const higher = entry.achievementRate > existing.entry.achievementRate
    bySheetId.set(entry.sheetId, {
      entry: higher ? entry : existing.entry,
      sheet: existing.sheet,
      best: {
        achievementRate: Math.max(existing.best.achievementRate, entry.achievementRate),
        comboFlag: strongest(COMBO_RANK, existing.best.comboFlag, entry.comboFlag ?? null),
        syncFlag: strongest(SYNC_RANK, existing.best.syncFlag, entry.syncFlag ?? null),
      },
      source: chooseSource(
        higher ? playEntrySource(entry) : existing.source,
        higher ? existing.source : playEntrySource(entry),
      ),
    })
  }
  return bySheetId
}