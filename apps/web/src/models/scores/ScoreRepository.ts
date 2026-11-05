import type {
  Best50Bucket,
  ComboFlag,
  ImportProvider,
  ManualEntryMethod,
  Provenance,
  SheetIdentity,
  SyncFlag,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'

/**
 * The scores of the visitor, behind one interface for the local save (localStorage) and, later, cloud saves
 * (meta#17, design §8.1). Everything that writes scores calls an explicit method here; everything that reads them
 * goes through `useScoreRepository()`.
 */

/** One chart's best score, the shape bot parity and other readers consume */
export interface ScoreRecord {
  sheetId: string
  /** Filled in from the catalog when the saved entry has none */
  identity: SheetIdentity
  /** Integer in 1/10000 % (`100.5432%` → `1005432`) */
  achievement: number
  /** Percentage, for display */
  achievementRate: number
  comboFlag: ComboFlag | null
  syncFlag: SyncFlag | null
  dxScore: number | null
  best50Bucket: Best50Bucket | null
  /** `null` in the local save, which keeps no provenance */
  provenance: Provenance | null
}

/** A score the visitor entered by hand */
export type ManualEntry = Pick<PlayEntry, 'sheetId' | 'achievementRate' | 'comboFlag' | 'syncFlag' | 'dxScore'>

/** Where the entries of a file or provider import come from */
export type ImportEntrySource = ImportProvider | 'dxrating-json'

export interface ImportMeta {
  source: ImportEntrySource
  /**
   * `replace`: the imported entries become the save. `merge`: each imported entry is added, or replaces the saved
   * values of its chart when its achievement is higher (the maimai NET merge).
   */
  mode: 'replace' | 'merge'
}

export interface ImportResult {
  /** Entries in the import */
  count: number
}

export type ServerImportKind = 'maimai-net' | 'lxns' | 'diving-fish'

export interface ImportProgress {
  stage: string
  /** 0 to 1 */
  progress: number
}

export interface SyncIssue {
  sheetId: string
  reason: string
}

export interface ScoreRepositoryStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  pendingCount: number
  lastSyncedRevision: number
  issues: readonly SyncIssue[]
}

export interface ScoreRepository {
  readonly kind: 'local' | 'cloud'
  /**
   * Whether the save has loaded (the local save: always, it is read when the repository is created; a cloud save:
   * after its first fetch). Readers in components use `useScoreReadState()`, which also waits for hydration.
   */
  readonly ready: boolean
  /**
   * Exactly one record per chart (sheet ID), each field at its best across the saved entries of the chart. Stable
   * between changes, so it can be a `useSyncExternalStore` snapshot.
   */
  list(): readonly ScoreRecord[]
  /** The record of a chart, the same one `list()` holds */
  get(sheetId: string): ScoreRecord | undefined
  subscribe(cb: () => void): () => void
  setManual(entry: ManualEntry, method: ManualEntryMethod): void
  delete(sheetIds: string[]): void
  /** Cloud saves: a revision-guarded batch delete */
  clear(): void
  /** File and browser-side provider imports */
  applyImport(entries: PlayEntry[], meta: ImportMeta): Promise<ImportResult>
  /** Imports the server fetches into a cloud save; the local save cannot run them */
  runServerImport(kind: ServerImportKind, args: Record<string, unknown>): AsyncIterable<ImportProgress>
  readonly status: ScoreRepositoryStatus
}

/**
 * The entries as the web has always kept them (`PlayEntry`, the format of the localStorage key and of JSON exports),
 * for the rating calculator and the export. Records `list()` cannot represent (no identity, or an achievement out of
 * range) are still here.
 */
export interface PlayEntrySource {
  entries(): readonly PlayEntry[]
}

export type WebScoreRepository = ScoreRepository & PlayEntrySource

export class UnsupportedScoreOperationError extends Error {
  constructor(operation: string, kind: ScoreRepository['kind']) {
    super(`${operation} is not supported by the ${kind} score repository`)
    this.name = 'UnsupportedScoreOperationError'
  }
}