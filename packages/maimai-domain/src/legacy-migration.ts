import { isPublicSheetId, parseLegacySheetId } from './sheet-identity.ts'
import type { SongCatalog } from './song-catalog'
import type { LegacySongIdMap, SheetIdentity } from './types'

/** What saved data needs to name a sheet: its ID, and the identity some records keep next to it */
export interface SheetReferencingRecord {
  sheetId: string
  identity?: SheetIdentity | { songId: string; type: string; difficulty: string }
}

export interface LegacyMigrationResult<T> {
  /** Every record, in order: migrated ones with public sheet IDs, the rest unchanged */
  records: T[]
  /** How many records moved from a legacy to a public sheet ID */
  migrated: number
  /** Legacy records no sheet of the catalog matched; they are kept as they are, so a later catalog can still match */
  unresolved: number
}

/** Whether a sheet ID is one DXRating used before public sheet IDs */
export const isLegacySheetId = (sheetId: string): boolean => !isPublicSheetId(sheetId) && !!parseLegacySheetId(sheetId)

/** The public sheet ID of a sheet ID: itself if it is one, the sheet a legacy ID names, or null */
export function resolveLegacySheetId(
  catalog: SongCatalog,
  sheetId: string,
  legacySongIds: LegacySongIdMap,
): string | null {
  if (isPublicSheetId(sheetId)) return sheetId
  const identity = parseLegacySheetId(sheetId)
  if (!identity) return null
  return catalog.resolveReference({ kind: 'legacy', identity, legacySongIds })?.id ?? null
}

/**
 * Moves records keyed by legacy sheet IDs (`<legacy song ID>__dxrt__<type>__dxrt__<difficulty>`) to public sheet
 * IDs. Records are never dropped: one that cannot be matched stays as it is.
 */
export function migrateLegacySheetRecords<T extends SheetReferencingRecord>(
  records: readonly T[],
  catalog: SongCatalog,
  legacySongIds: LegacySongIdMap,
): LegacyMigrationResult<T> {
  let migrated = 0
  let unresolved = 0
  const result = records.map((record) => {
    if (isPublicSheetId(record.sheetId)) return record
    const identity = parseLegacySheetId(record.sheetId)
    if (!identity) return record
    const sheet = catalog.resolveReference({ kind: 'legacy', identity, legacySongIds })
    if (!sheet) {
      unresolved += 1
      return record
    }
    migrated += 1
    return { ...record, sheetId: sheet.id, ...(record.identity ? { identity: sheet.identity } : {}) }
  })
  return { records: result, migrated, unresolved }
}

/** Moves a list of sheet IDs (favorites) to public sheet IDs, keeping the ones that cannot be matched */
export function migrateLegacySheetIds(
  sheetIds: readonly string[],
  catalog: SongCatalog,
  legacySongIds: LegacySongIdMap,
): LegacyMigrationResult<string> {
  const { records, migrated, unresolved } = migrateLegacySheetRecords(
    sheetIds.map((sheetId) => ({ sheetId })),
    catalog,
    legacySongIds,
  )
  const seen = new Set<string>()
  return {
    records: records.map((record) => record.sheetId).filter((sheetId) => !seen.has(sheetId) && !!seen.add(sheetId)),
    migrated,
    unresolved,
  }
}