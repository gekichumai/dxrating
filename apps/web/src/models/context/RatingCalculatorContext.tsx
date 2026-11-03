import { migrateLegacySheetRecords } from '@gekichumai/maimai-domain'
import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { useCatalogDocument, useCompleteCatalogDocument, useSongCatalog } from '../../catalog/CatalogContext'
import { loadLegacySongIds } from '../../catalog/legacySongIds'
import {
  backUpBeforeMigration,
  getMigrationCatalog,
  hasLegacySheetRecords,
  migrateStoredFavoriteSheetIds,
  RATING_ENTRIES_STORAGE_KEY,
  reportMigration,
} from '../../catalog/savedDataMigration'
import { LocalScoreRepository } from '../scores/LocalScoreRepository'
import { ScoreRepositoryContext } from '../scores/useScoreRepository'

/**
 * The rating calculator's view of the score repository, kept source compatible: `entries` are the saved entries and
 * `modifyEntries` the list actions they always had. New code reads through `useScoreRepository()` and writes with
 * its explicit methods (`setManual`, `delete`, `clear`, `applyImport`); `modifyEntries` remains for compatibility.
 */
export interface RatingCalculatorContext {
  entries: PlayEntry[]
  /** @deprecated Write through the explicit methods of `useScoreRepository()` */
  modifyEntries: ListActions<PlayEntry>
}

/** The browser's localStorage, or nothing on the server and where the browser refuses it */
function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** `react-use` `useList` actions over the repository, each a wholesale replacement of the saved entries */
function createListActions(
  repository: Pick<LocalScoreRepository, 'entries' | 'replaceEntries'>,
  initialEntries: readonly PlayEntry[],
): ListActions<PlayEntry> {
  const set: ListActions<PlayEntry>['set'] = (next) => {
    const current = repository.entries() as PlayEntry[]
    repository.replaceEntries(typeof next === 'function' ? next(current) : next)
  }
  const updateAt = (index: number, item: PlayEntry) =>
    set((current) => {
      const next = current.slice()
      next[index] = item
      return next
    })
  const removeAt = (index: number) =>
    set((current) => {
      const next = current.slice()
      next.splice(index, 1)
      return next
    })
  const push = (...items: PlayEntry[]) => {
    if (items.length) set((current) => current.concat(items))
  }

  return {
    set,
    push,
    updateAt,
    insertAt: (index, item) =>
      set((current) => {
        const next = current.slice()
        if (index > next.length) next[index] = item
        else next.splice(index, 0, item)
        return next
      }),
    update: (predicate, newItem) =>
      set((current) => current.map((item) => (predicate(item, newItem) ? newItem : item))),
    updateFirst: (predicate, newItem) => {
      const index = repository.entries().findIndex((item) => predicate(item, newItem))
      if (index >= 0) updateAt(index, newItem)
    },
    upsert: (predicate, newItem) => {
      const index = repository.entries().findIndex((item) => predicate(item, newItem))
      if (index >= 0) updateAt(index, newItem)
      else push(newItem)
    },
    sort: (compareFn) => set((current) => current.slice().sort(compareFn)),
    filter: (callbackFn, thisArg) => set((current) => current.slice().filter(callbackFn, thisArg)),
    removeAt,
    remove: removeAt,
    clear: () => set([]),
    reset: () => set(initialEntries.slice()),
  }
}

export const RatingCalculatorContext = createContext<RatingCalculatorContext>({
  entries: [],
  modifyEntries: {} as ListActions<PlayEntry>,
})

export const RatingCalculatorContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  // The visitor's save is read in the browser only: on the server the repository is empty (no scores in SSR)
  const [repository] = useState(() => new LocalScoreRepository(getBrowserStorage()))
  const [initialEntries] = useState(() => repository.entries())
  const modifyEntries = useMemo(() => createListActions(repository, initialEntries), [repository, initialEntries])
  const subscribe = useCallback((onChange: () => void) => repository.subscribe(onChange), [repository])
  const getEntries = useCallback(() => repository.entries() as PlayEntry[], [repository])
  const entries = useSyncExternalStore(subscribe, getEntries, getEntries)

  // Records name their chart by identity: the catalog fills it in for entries saved without one
  const catalogDocument = useCatalogDocument()
  useEffect(() => {
    const catalog = getMigrationCatalog(catalogDocument)
    repository.setIdentityResolver((sheetId) => catalog.getById(sheetId)?.identity)
  }, [repository, catalogDocument])

  // Duplicate entries of a chart keep the best 50 hint the calculator keeps: ranked by rating, under the selected version
  const songCatalog = useSongCatalog()
  useEffect(() => {
    repository.setInternalLevelResolver((sheetId) => songCatalog.getById(sheetId)?.internalLevelValue)
  }, [repository, songCatalog])

  // Migrations resolve saved sheet IDs against the catalog: they wait for the complete one
  const completeCatalogDocument = useCompleteCatalogDocument()

  // Entries saved (or imported from a rating file) before public sheet IDs are moved to them as they are read.
  // Re-runs on every change of the entries, so a later import is migrated too; a pass that matches nothing changes
  // nothing, and a change while the legacy map loads cancels the pass in favor of the one for the new entries.
  useEffect(() => {
    if (!completeCatalogDocument || !hasLegacySheetRecords(entries)) return
    let cancelled = false
    void loadLegacySongIds().then((legacySongIds) => {
      if (cancelled) return
      const result = migrateLegacySheetRecords(entries, getMigrationCatalog(completeCatalogDocument), legacySongIds)
      if (result.migrated === 0) return
      backUpBeforeMigration(window.localStorage, RATING_ENTRIES_STORAGE_KEY, JSON.stringify(entries))
      repository.applyMigration(result.records)
      reportMigration('rating-entries', result)
    })
    return () => {
      cancelled = true
    }
  }, [entries, completeCatalogDocument, repository])

  useEffect(() => {
    if (!completeCatalogDocument) return
    void migrateStoredFavoriteSheetIds(window.localStorage, completeCatalogDocument)
  }, [completeCatalogDocument])

  const value = useMemo(() => ({ entries, modifyEntries }), [entries, modifyEntries])

  return (
    <ScoreRepositoryContext.Provider value={repository}>
      <RatingCalculatorContext.Provider value={value}>{children}</RatingCalculatorContext.Provider>
    </ScoreRepositoryContext.Provider>
  )
}

export const useRatingCalculatorContext = () => {
  const context = useContext(RatingCalculatorContext)
  if (!context) {
    throw new Error('Missing RatingCalculatorContextProvider')
  }
  return context
}