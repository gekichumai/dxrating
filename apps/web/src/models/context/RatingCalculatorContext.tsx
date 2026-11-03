import { migrateLegacySheetRecords } from '@gekichumai/maimai-domain'
import { createContext, type FC, type PropsWithChildren, useContext, useEffect } from 'react'
import { useList, useLocalStorage } from 'react-use'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { useCompleteCatalogDocument } from '../../catalog/CatalogContext'
import { loadLegacySongIds } from '../../catalog/legacySongIds'
import {
  backUpBeforeMigration,
  getMigrationCatalog,
  hasLegacySheetRecords,
  migrateStoredFavoriteSheetIds,
  RATING_ENTRIES_STORAGE_KEY,
  reportMigration,
} from '../../catalog/savedDataMigration'

export interface RatingCalculatorContext {
  entries: PlayEntry[]
  modifyEntries: ListActions<PlayEntry>
}

export const RatingCalculatorContext = createContext<RatingCalculatorContext>({
  entries: [],
  modifyEntries: {} as ListActions<PlayEntry>,
})

export const RatingCalculatorContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<PlayEntry[]>(RATING_ENTRIES_STORAGE_KEY, [])
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries)
  // Migrations resolve saved sheet IDs against the catalog: they wait for the complete one
  const catalogDocument = useCompleteCatalogDocument()

  useEffect(() => {
    setLocalStorageEntries(entries)
  }, [entries, setLocalStorageEntries])

  // Entries saved (or imported from a rating file) before public sheet IDs are moved to them as they are read.
  // Re-runs on every change of the entries, so a later import is migrated too; a pass that matches nothing changes
  // nothing, and a change while the legacy map loads cancels the pass in favor of the one for the new entries.
  useEffect(() => {
    if (!catalogDocument || !hasLegacySheetRecords(entries)) return
    let cancelled = false
    void loadLegacySongIds().then((legacySongIds) => {
      if (cancelled) return
      const result = migrateLegacySheetRecords(entries, getMigrationCatalog(catalogDocument), legacySongIds)
      if (result.migrated === 0) return
      backUpBeforeMigration(window.localStorage, RATING_ENTRIES_STORAGE_KEY, JSON.stringify(entries))
      modifyEntries.set(result.records)
      reportMigration('rating-entries', result)
    })
    return () => {
      cancelled = true
    }
  }, [entries, catalogDocument, modifyEntries])

  useEffect(() => {
    if (!catalogDocument) return
    void migrateStoredFavoriteSheetIds(window.localStorage, catalogDocument)
  }, [catalogDocument])

  return (
    <RatingCalculatorContext.Provider value={{ entries, modifyEntries }}>{children}</RatingCalculatorContext.Provider>
  )
}

export const useRatingCalculatorContext = () => {
  const context = useContext(RatingCalculatorContext)
  if (!context) {
    throw new Error('Missing RatingCalculatorContextProvider')
  }
  return context
}