import {
  type Best50Bucket,
  type ComboFlag,
  calculateRatingAward,
  preferBest50Hint,
  type RatingEntry,
  type SongCatalog,
  type SyncFlag,
  type VersionedSheet,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'

export interface UserRecord {
  /** The highest-achievement stored entry of the sheet */
  entry: PlayEntry
  /** The catalog sheet of the record; null while the catalog lacks it */
  sheet: VersionedSheet | null
  /**
   * Best result of every field across all stored entries of the sheet (a lower score can carry the AP / FDX, or the
   * higher DX score); `dxScore` is null when no entry reports one
   */
  best: { achievementRate: number; comboFlag: ComboFlag; syncFlag: SyncFlag; dxScore: number | null }
  /** Import metadata (CN Diving Fish bucket hint), from any stored entry of the sheet */
  source: RatingEntry['source']
}

const COMBO_RANK: readonly ComboFlag[] = [null, 'fc', 'fcp', 'ap', 'app']
const SYNC_RANK: readonly SyncFlag[] = [null, 'sync', 'fs', 'fsp', 'fsd', 'fsdp']

const dxScoreOf = (entry: PlayEntry): number | null =>
  typeof entry.dxScore === 'number' && Number.isFinite(entry.dxScore) ? entry.dxScore : null

const higherDxScore = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b))

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

const hintOf = (source: RatingEntry['source']) =>
  source?.provider === 'diving-fish' && source.best50Bucket !== undefined ? source.best50Bucket : null

/**
 * The source a grouped record keeps: among duplicates carrying an authoritative bucket hint, the one
 * `calculateBest50` would pick (`preferBest50Hint`); without any hint, the preferred entry's source.
 */
function chooseSource(
  preferred: { source: RatingEntry['source']; entry: PlayEntry },
  other: { source: RatingEntry['source']; entry: PlayEntry },
  sheet: VersionedSheet | null,
): RatingEntry['source'] {
  const a = hintOf(preferred.source)
  const b = hintOf(other.source)
  if (a && b) {
    const candidate = (bucket: Best50Bucket, entry: PlayEntry) => ({
      bucket,
      achievementRate: entry.achievementRate,
      ratingAwardValue: sheet
        ? calculateRatingAward(sheet.internalLevelValue, entry.achievementRate, entry.comboFlag).ratingAwardValue
        : 0,
    })
    return preferBest50Hint(candidate(a, preferred.entry), candidate(b, other.entry)) === 'a'
      ? preferred.source
      : other.source
  }
  if (a) return preferred.source
  if (b) return other.source
  return preferred.source ?? other.source
}

/** One record per sheet: the highest-achievement entry, with each flag aggregated independently */
export function groupUserRecords(
  entries: readonly PlayEntry[],
  getSheet: (sheetId: string) => VersionedSheet | null,
): Map<string, UserRecord> {
  const bySheetId = new Map<string, UserRecord>()
  // The entry each record's source came from, to rank conflicting hints by its rating
  const sourceEntry = new Map<string, PlayEntry>()
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
          dxScore: dxScoreOf(entry),
        },
        source: playEntrySource(entry),
      })
      sourceEntry.set(entry.sheetId, entry)
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
        dxScore: higherDxScore(existing.best.dxScore, dxScoreOf(entry)),
      },
      source: undefined,
    })
    const current = { source: existing.source, entry: sourceEntry.get(entry.sheetId)! }
    const incoming = { source: playEntrySource(entry), entry }
    const chosen = higher
      ? chooseSource(incoming, current, existing.sheet)
      : chooseSource(current, incoming, existing.sheet)
    bySheetId.get(entry.sheetId)!.source = chosen
    sourceEntry.set(entry.sheetId, chosen === incoming.source ? entry : current.entry)
  }
  return bySheetId
}