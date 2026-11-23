import { best50HintOf, collapsePlaysBySheet, type CollapsedPlay, type VersionedSheet } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'

export interface UserRecord {
  sheetId: string
  /** The catalog sheet of the record; null while the catalog lacks it */
  sheet: VersionedSheet | null
  best: CollapsedPlay
}

/** One record per sheet, from every stored entry of it */
export function groupUserRecords(
  entries: readonly PlayEntry[],
  getSheet: (sheetId: string) => VersionedSheet | null,
): Map<string, UserRecord> {
  const collapsed = collapsePlaysBySheet(
    entries,
    (entry) => ({ ...entry, best50Bucket: best50HintOf(entry) }),
    (sheetId) => getSheet(sheetId)?.internalLevelValue,
  )
  return new Map([...collapsed].map(([sheetId, { best }]) => [sheetId, { sheetId, sheet: getSheet(sheetId), best }]))
}