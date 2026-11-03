import type { ImportJobDTO } from '@gekichumai/api-contract'
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
  /**
   * Cloud saves: the account ID the file claims (e.g. the Aqua user of an SQLite file). Stored as claimed, never
   * shown beyond a short prefix
   */
  claimedAccountId?: string
}

export interface ImportResult {
  /** Entries in the import */
  count: number
  /** Cloud saves: the import job the server recorded */
  job?: ImportJobDTO
}

export type ServerImportKind = 'maimai-net' | 'lxns' | 'diving-fish'

/** What every server import accepts */
interface ServerImportCommonArgs {
  /**
   * One key per user action (§5.5): a retry of the same action reuses it, so the server never runs it twice. A
   * fresh UUID when omitted
   */
  idempotencyKey?: string
  /** `user` (default): the user asked for it; `auto`: the automatic maimai NET import */
  trigger?: 'user' | 'auto'
}

export interface ServerImportArgs {
  'maimai-net': ServerImportCommonArgs & { region: 'jp' | 'intl'; id: string; password: string }
  lxns: ServerImportCommonArgs
  'diving-fish': ServerImportCommonArgs & ({ username: string; qq?: never } | { qq: string; username?: never })
}

export interface ImportProgress {
  /**
   * maimai NET: the upstream state (`auth:in-progress`, `fetch:music:in-progress:master`…); every import: `waiting`
   * (attached to a job that is already running), `pulling` (the job is done, its records are being pulled), `done`
   */
  stage: string
  /** 0 to 1 */
  progress: number
  /** Set on the last progress (`done`): the finished job */
  job?: ImportJobDTO
}

/**
 * A change the server did not take (cloud saves, design §5.4). The user's intent is kept so it can be applied again
 * on purpose, over the record the server kept.
 */
export interface SyncIssue {
  /** The ID of the mutation that carried the intent */
  id: string
  /** The save the intent was made on: an issue is shown and applied again only there (§5.4, §8.1) */
  saveId: string
  sheetId: string
  /**
   * `superseded`: the server kept a newer verified record, returned with the result. `rejected`: the server refused
   * the value (`reason` says why).
   */
  kind: 'superseded' | 'rejected'
  reason: string
  intent: {
    op: 'set' | 'delete'
    value?: { achievement: number; comboFlag: ComboFlag | null; syncFlag: SyncFlag | null; dxScore?: number | null }
    entryMethod: ManualEntryMethod
    /** Device clock, when the user made the change (it may have been sent much later) */
    clientEditedAt?: string
  }
  /** Device clock, when the issue was recorded */
  createdAt: string
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
  runServerImport<K extends ServerImportKind>(kind: K, args: ServerImportArgs[K]): AsyncIterable<ImportProgress>
  readonly status: ScoreRepositoryStatus
  /**
   * Cloud saves: whether the server runs maimai NET, LXNS and Diving-Fish imports for the user (`serverImports`).
   * `false` is the §7.4 fallback, where the browser fetches them and uploads them as `client_reported`
   */
  readonly serverImportsEnabled?: boolean
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