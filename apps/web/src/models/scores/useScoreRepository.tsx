import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { LocalScoreRepository } from './LocalScoreRepository'
import type { ScoreRecord, WebScoreRepository } from './ScoreRepository'

// Outside a provider (isolated component tests): an empty save that is never persisted
const DETACHED_REPOSITORY = new LocalScoreRepository(null)

export const ScoreRepositoryContext = createContext<WebScoreRepository>(DETACHED_REPOSITORY)

/** The score repository of the visitor: the single entry point for reading and writing scores */
export const useScoreRepository = (): WebScoreRepository => useContext(ScoreRepositoryContext)

/**
 * The score records, updated on every change. Never rendered on the server: the repository there is an empty one,
 * and the visitor's scores are only read in the browser.
 */
export const useScoreRecords = (): readonly ScoreRecord[] => {
  const repository = useScoreRepository()
  const subscribe = useCallback((onChange: () => void) => repository.subscribe(onChange), [repository])
  const getSnapshot = useCallback(() => repository.list(), [repository])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The saved entries in their stored form (`PlayEntry`), updated on every change */
export const useScoreEntries = (): readonly PlayEntry[] => {
  const repository = useScoreRepository()
  const subscribe = useCallback((onChange: () => void) => repository.subscribe(onChange), [repository])
  const getSnapshot = useCallback(() => repository.entries(), [repository])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}