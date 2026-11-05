import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { detectAnalyticsDeployment, detectAnalyticsPlatform } from '../../lib/analytics'
import { LocalScoreRepository } from './LocalScoreRepository'
import type { ScoreRecord, WebScoreRepository } from './ScoreRepository'

// Outside a provider (isolated component tests): an empty save that is never persisted
const DETACHED_REPOSITORY = new LocalScoreRepository(null)

export const ScoreRepositoryContext = createContext<WebScoreRepository>(DETACHED_REPOSITORY)

const ScoreRepositoryOverriddenContext = createContext(false)

/** The score repository of the visitor: the single entry point for reading and writing scores */
export const useScoreRepository = (): WebScoreRepository => useContext(ScoreRepositoryContext)

const EMPTY_RECORDS: readonly ScoreRecord[] = Object.freeze([])
const noopSubscribe = () => () => {}

/**
 * `false` on the server and during hydration, `true` in every client render after it (including components that
 * mount later, which then read the save on their first render)
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )

export interface ScoreReadState {
  /** One record per chart; empty until `ready` */
  records: readonly ScoreRecord[]
  /** The page has hydrated and the repository has loaded the save */
  ready: boolean
}

/**
 * The score records and whether they have loaded. Empty and not ready on the server and in the hydration render, so
 * server-rendered (and edge-cached) HTML never holds the visitor's scores and the first client render matches it.
 */
export const useScoreReadState = (): ScoreReadState => {
  const repository = useScoreRepository()
  const hydrated = useHydrated()
  const subscribe = useCallback((onChange: () => void) => repository.subscribe(onChange), [repository])
  const getSnapshot = useCallback(() => repository.list(), [repository])
  const getServerSnapshot = useCallback(() => EMPTY_RECORDS, [])
  const records = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const getReady = useCallback(() => repository.ready, [repository])
  const repositoryReady = useSyncExternalStore(subscribe, getReady, () => false)
  const ready = hydrated && repositoryReady
  return useMemo(() => ({ records: ready ? records : EMPTY_RECORDS, ready }), [ready, records])
}

/** The score records (one per chart), updated on every change; `[]` until mounted and loaded (see `useScoreReadState`) */
export const useScoreRecords = (): readonly ScoreRecord[] => useScoreReadState().records

/** The saved entries in their stored form (`PlayEntry`), updated on every change */
export const useScoreEntries = (): readonly PlayEntry[] => {
  const repository = useScoreRepository()
  const subscribe = useCallback((onChange: () => void) => repository.subscribe(onChange), [repository])
  const getSnapshot = useCallback(() => repository.entries(), [repository])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Whether a page URL may replace the visitor's repository with a fixture: dev and preview hosts only, never the
 * production host or the native shell (the host check of `?demoScores=1`)
 */
export function isScoreRepositoryOverrideAllowed(url: string): boolean {
  return detectAnalyticsDeployment(url, detectAnalyticsPlatform(url)) !== 'production'
}

const currentPageUrl = () => (typeof window === 'undefined' ? null : window.location.href)

export interface ScoreRepositoryOverrideProviderProps {
  /** The repository readers below see instead of the visitor's, e.g. `LocalScoreRepository.inMemory(fixture)` */
  repository: WebScoreRepository | null | undefined
  /** The page URL the host check runs on; the current page by default */
  url?: string
}

/**
 * Dev and preview demos: readers and writers below see `repository` instead of the visitor's save. Ignored on
 * production hosts and on the server; applied after hydration, so the server and hydration renders stay the same.
 */
export const ScoreRepositoryOverrideProvider: FC<PropsWithChildren<ScoreRepositoryOverrideProviderProps>> = ({
  repository,
  url,
  children,
}) => {
  const parent = useScoreRepository()
  const parentOverridden = useIsScoreRepositoryOverridden()
  const hydrated = useHydrated()
  const pageUrl = url ?? (hydrated ? currentPageUrl() : null)
  const override = repository && hydrated && pageUrl && isScoreRepositoryOverrideAllowed(pageUrl) ? repository : null
  // The same tree either way, so applying the override after hydration does not remount the children
  return (
    <ScoreRepositoryContext.Provider value={override ?? parent}>
      <ScoreRepositoryOverriddenContext.Provider value={override ? true : parentOverridden}>
        {children}
      </ScoreRepositoryOverriddenContext.Provider>
    </ScoreRepositoryContext.Provider>
  )
}

/** Whether `ScoreRepositoryOverrideProvider` has replaced the visitor's repository (a demo is shown) */
export const useIsScoreRepositoryOverridden = (): boolean => useContext(ScoreRepositoryOverriddenContext)