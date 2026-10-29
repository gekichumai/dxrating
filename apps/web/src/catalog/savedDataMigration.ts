import { VersionEnum, type SongCatalogDocument } from '@gekichumai/dxdata'
import {
  getSongCatalog,
  isLegacySheetId,
  migrateLegacySheetIds,
  type LegacyMigrationResult,
  type SheetReferencingRecord,
} from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/tanstackstart-react'
import { FAVORITE_SHEETS_STORAGE_KEY, writeFavoriteSheetIds } from '@/models/favorite'
import { loadLegacySongIds } from './legacySongIds'

// Saved data from before public sheet IDs names sheets by legacy sheet ID (`<legacy song ID>__dxrt__<type>__dxrt__
// <difficulty>`): rating entries, favorites, and rating files exported back then. It is moved to public sheet IDs as
// it is read. Nothing is ever dropped: a record no sheet matches keeps its legacy ID, and the first migration of a
// key leaves a copy of the original value under `<key>.legacy-backup`.

export const RATING_ENTRIES_STORAGE_KEY = 'rating-calculator-entries'
export { FAVORITE_SHEETS_STORAGE_KEY }
export const LEGACY_BACKUP_SUFFIX = '.legacy-backup'

/** Whether any record still names its sheet by a legacy sheet ID */
export const hasLegacySheetRecords = (records: readonly SheetReferencingRecord[]): boolean =>
  records.some((record) => typeof record?.sheetId === 'string' && isLegacySheetId(record.sheetId))

// Sheet identity does not depend on the game version, so any version's catalog resolves the same sheets
export const getMigrationCatalog = (document: SongCatalogDocument) => getSongCatalog(document, VersionEnum.MAGiCAL)

/** Moves the favorites saved in localStorage to public sheet IDs */
export async function migrateStoredFavoriteSheetIds(storage: Storage, document: SongCatalogDocument) {
  const original = storage.getItem(FAVORITE_SHEETS_STORAGE_KEY)
  if (!original) return
  let sheetIds: unknown
  try {
    sheetIds = JSON.parse(original)
  } catch {
    return
  }
  if (!Array.isArray(sheetIds) || !sheetIds.every((id): id is string => typeof id === 'string')) return
  if (!sheetIds.some(isLegacySheetId)) return

  const result = migrateLegacySheetIds(sheetIds, getMigrationCatalog(document), await loadLegacySongIds())
  if (result.migrated === 0) return
  // favorites saved meanwhile are kept: migrate what the key holds now
  const current = storage.getItem(FAVORITE_SHEETS_STORAGE_KEY)
  if (current !== original) return migrateStoredFavoriteSheetIds(storage, document)
  backUpBeforeMigration(storage, FAVORITE_SHEETS_STORAGE_KEY, original)
  // through the favorites store, so mounted favorite controls see the migrated IDs
  writeFavoriteSheetIds(result.records, storage)
  reportMigration('favorites', result)
}

/** Keeps the value a key held before its first migration, once */
export function backUpBeforeMigration(storage: Storage, key: string, original: string | null) {
  if (original === null) return
  try {
    if (storage.getItem(key + LEGACY_BACKUP_SUFFIX) === null) storage.setItem(key + LEGACY_BACKUP_SUFFIX, original)
  } catch {
    // A full storage must not block the migration; the original stays in the key until the migrated value replaces it
  }
}

export function reportMigration(kind: 'rating-entries' | 'favorites', result: LegacyMigrationResult<unknown>) {
  Sentry.logger?.info?.('Migrated saved data to public sheet IDs', {
    kind,
    migrated: result.migrated,
    unresolved: result.unresolved,
    total: result.records.length,
  })
}