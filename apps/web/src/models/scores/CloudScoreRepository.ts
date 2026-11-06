import {
  CLOUD_SAVE_MAX_CHANGES_LIMIT,
  CLOUD_SAVE_MAX_MUTATIONS,
  type ChangesDTO,
  type ImportJobDTO,
  type ImportRecordInput,
  type ImportResultDTO,
  type MutationItemInput,
  type MutationsResultDTO,
  type RecordDTO,
} from '@gekichumai/api-contract'
import { decideManualMutation, type ManualEntryMethod } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { FETCH_STATE_PROGRESS, isFetchNetRecordProgressState } from '../../components/rating/io/import/netImportStages'
import {
  chunkImportRecords,
  clientImportBody,
  chunkPayloadSha256,
  CloudClearNotSentError,
  clientImportPlan,
  entriesToImportRecords,
  ImportAlreadyRunningError,
  importedCount,
  importInProgressJobId,
  isRetryableImportError,
  isSameServerImport,
  newIdempotencyKey,
  NothingToImportError,
  ServerImportFailedError,
  type ServerImportIdentity,
  ServerImportsDisabledError,
  sha256Hex,
} from './cloudImports'
import type { NetImportStreamEvent, NetImportTransport } from './cloudNetImport'
import { CloudScoreDatabase, type CloudScoreMeta, type OutboxEntry } from './cloudScoreDatabase'
import {
  checksumOf,
  type CloudRecord,
  cloudRecordToPlayEntry,
  cloudRecordToScoreRecord,
  manualEntryToSetValue,
  recordFromDTO,
} from './cloudScoreMapping'
import type { SheetIdentityResolver } from './LocalScoreRepository'
import {
  type ImportMeta,
  type ImportProgress,
  type ImportResult,
  type ManualEntry,
  type ScoreRecord,
  type ScoreRepositoryStatus,
  type ServerImportArgs,
  type ServerImportKind,
  type SyncIssue,
  UnsupportedScoreOperationError,
  type WebScoreRepository,
} from './ScoreRepository'
import { uuidv7 } from './uuidv7'

/**
 * A cloud save (meta#17, design §5.7, §8.1): the server's records cached in IndexedDB, with local changes applied
 * optimistically and queued in a persistent outbox until the server acknowledges them.
 *
 * Sync cycle (one at a time, and one tab at a time through the `dxr-scores-sync` Web Lock):
 * 1. push the outbox of this save in creation order, at most 500 mutations a request, each with the revision of
 *    the record the user saw (`basedOnRevision`) and its persisted UUIDv7 `mutationId` (retries are idempotent);
 * 2. apply the results: `applied`/`noop` take the returned record; `superseded` keeps the server's record and turns
 *    the user's intent into a {@link SyncIssue} that can be applied again with a new baseline
 *    ({@link CloudScoreRepository.reapplyIssue}); `rejected` becomes an issue;
 * 3. pull the changes since `lastSyncedRevision` until `hasMore` is false; `resetRequired` (the cursor is older than
 *    the tombstone horizon, §5.6) refetches everything from 0 and rebuilds the cache. A full pull (a first sync, a
 *    reset, a checksum mismatch) asks for `mode: 'full'` on every page, so its later pages, whose cursor is routinely
 *    below the horizon, are never reset; it commits only once its last page is in;
 * 4. lay the outbox entries still pending over the pulled records again;
 * 5. compare the last page's checksum with the cache; a mismatch refetches everything once and is reported.
 *
 * Triggers: 2 s after the last write, coming back online, the page becoming visible or focused, the repository
 * starting (sign-in), {@link CloudScoreRepository.notifyImportJobCompleted}, and every 60 s while visible.
 * Failures back off exponentially from 2 s to 5 min; a 429 waits for its `retryAfterSeconds`. A 404 (cloud save
 * turned off, save deleted) or 401 (signed out) stops syncing and keeps the outbox.
 *
 * The outbox is never dropped: not on sign-out, not when cloud save is turned off. It lives in the user's own
 * database (`dxr-cloud-v1-<userId>`), so another user signing in on this browser never sends it.
 *
 * Imports (§7, §8.3): maimai NET, LXNS and Diving-Fish run on the server ({@link runServerImport}); the client only
 * starts the job and then pulls what it wrote, so it never uploads a record it pulled or a server fetched. Files
 * (AquaDX, mu-net, Aqua SQLite, DXRating JSON) are read here and uploaded to `client-imports` ({@link applyImport}),
 * as `client_reported`. The one exception is the §7.4 fallback: with server imports turned off for the user, records
 * the browser fetched from those providers the old way upload as `legacy-local`, claiming the provider; they stay
 * `client_reported` and are never shown as verified.
 */

/**
 * `incremental`: the changes after `since`, reset when `since` is older than the tombstone horizon. `full`: a page of
 * a full pull, never reset by the horizon (§5.6)
 */
export type ChangesMode = 'incremental' | 'full'

/** The import routes this repository calls, the shape of `privateApiClient.cloudSave.imports` */
export interface CloudSaveImportsApi {
  client(input: {
    id: string
    idempotencyKey: string
    source: string
    trigger: 'user' | 'auto' | 'migration'
    sourceAccountId?: string | null
    fetchedAt?: string | null
    rawPayloadSha256?: string | null
    chunkIndex: number
    chunkCount: number
    records: ImportRecordInput[]
  }): Promise<ImportResultDTO>
  lxns(input: { id: string; idempotencyKey: string; trigger: 'user' | 'auto' }): Promise<ImportResultDTO>
  divingFish(input: {
    id: string
    idempotencyKey: string
    trigger: 'user' | 'auto'
    username?: string
    qq?: string
  }): Promise<ImportResultDTO>
  get(input: { jobId: string }): Promise<ImportJobDTO>
  list(input: { id: string; limit: number }): Promise<ImportJobDTO[]>
}

/** The cloud save routes this repository calls, the shape of `privateApiClient.cloudSave.records` */
export interface CloudSaveRecordsApi {
  changes(input: { id: string; since: number; limit: number; mode?: ChangesMode }): Promise<ChangesDTO>
  mutate(input: { id: string; mutations: MutationItemInput[] }): Promise<MutationsResultDTO>
}

export interface ChecksumMismatchReport {
  expectedCount: number
  expectedSumAchievement: number
  actualCount: number
  actualSumAchievement: number
}

/** The parts of `BroadcastChannel` this repository uses */
export interface ScoreBroadcastChannel {
  postMessage(message: unknown): void
  onmessage: ((event: MessageEvent) => void) | null
  close(): void
}

/** The parts of `navigator.locks` this repository uses */
export interface ScoreSyncLocks {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => Promise<T>): Promise<T>
}

export interface CloudScoreRepositoryOptions {
  userId: string
  saveId: string
  api: CloudSaveRecordsApi
  /** `indexedDB` by default */
  indexedDB?: IDBFactory
  /** `navigator.locks` by default; without it every tab syncs on its own (pushes stay idempotent) */
  locks?: ScoreSyncLocks | null
  /** `new BroadcastChannel(name)` by default; without it other tabs see changes on their next sync */
  createChannel?: ((name: string) => ScoreBroadcastChannel) | null
  reportChecksumMismatch?: (report: ChecksumMismatchReport) => void
  /** Called when syncing stops for good (404 or 401) */
  onStopped?: (reason: CloudSyncStopReason) => void
  /** The page whose events trigger syncs; the current `window` by default */
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
  /** Where `visibilitychange` fires; the current `document` by default */
  visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'> | null
  /** Whether the page is visible; `document.visibilityState` by default */
  isVisible?: () => boolean
  /** The import routes; without them imports fail */
  imports?: CloudSaveImportsApi
  /** The maimai NET import stream */
  netImport?: NetImportTransport
  /** `serverImports` of `/me/features`: `false` turns on the §7.4 fallback */
  serverImports?: boolean
  /** How often a running import job is polled; 2 s by default */
  importPollIntervalMs?: number
  /**
   * Called once an import of this save has ended, with its source and who fetched it only (analytics, §12.3).
   * Not called for imports that never reached the server (nothing to upload, server imports off)
   */
  onImportJobFinished?: (report: ImportJobReport) => void
  /** The first wait before an import request is sent again; doubles each time, 1 s by default */
  importRetryDelayMs?: number
}

export type CloudSyncStopReason = 'not-found' | 'unauthorized'

export interface ImportJobReport {
  status: 'succeeded' | 'failed'
  /** The job's source (`maimai-net-jp`, `lxns`, `dxrating-json`…) */
  source: string
  fetchedBy: 'server' | 'client'
}

export const SCORE_SYNC_LOCK_NAME = 'dxr-scores-sync'
export const SCORE_BROADCAST_CHANNEL_NAME = 'dxr-scores'
export const SYNC_DEBOUNCE_MS = 2_000
export const SYNC_INTERVAL_MS = 60_000
export const SYNC_BACKOFF_MIN_MS = 2_000
export const SYNC_BACKOFF_MAX_MS = 5 * 60_000
/** How many times a full pull starts over from 0 after a reset before the cycle fails (and backs off) */
export const FULL_PULL_MAX_ATTEMPTS = 3
/** How long signing out or turning cloud save off waits for the outbox to flush */
export const FLUSH_TIMEOUT_MS = 3_000
/** How long "clear, then import" waits for the clear to reach the server */
export const CLEAR_BEFORE_IMPORT_TIMEOUT_MS = 15_000
/** Attempts of one import request (the same idempotency key each time) */
export const IMPORT_MAX_ATTEMPTS = 3
/** How soon "clear first" asks again for a pull another tab was running */
const PULL_NOW_RETRY_MS = 250
/** A running job is given up on after this long (the server marks it abandoned after 15 min, §7.1) */
export const IMPORT_POLL_TIMEOUT_MS = 16 * 60_000

interface BroadcastMessage {
  type: 'changed'
  userId: string
  saveId: string
}

type SyncFailure =
  | { kind: 'stop'; reason: CloudSyncStopReason }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'retry'; offline: boolean }

/** Sorts a failed request into stop (404, 401), rate limited (429) and retry (anything else) */
export function classifySyncError(error: unknown): SyncFailure {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  if (status === 404 || code === 'NOT_FOUND') return { kind: 'stop', reason: 'not-found' }
  if (status === 401 || code === 'UNAUTHORIZED') return { kind: 'stop', reason: 'unauthorized' }
  if (status === 429 || code === 'TOO_MANY_REQUESTS') {
    const data = typeof error === 'object' && error !== null && 'data' in error ? error.data : undefined
    const seconds =
      typeof data === 'object' && data !== null && 'retryAfterSeconds' in data ? Number(data.retryAfterSeconds) : NaN
    return { kind: 'rate-limited', retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : NaN }
  }
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return { kind: 'retry', offline: offline || error instanceof TypeError }
}

export function backoffDelay(failures: number): number {
  return Math.min(SYNC_BACKOFF_MIN_MS * 2 ** Math.max(0, failures - 1), SYNC_BACKOFF_MAX_MS)
}

const EMPTY_ISSUES: readonly SyncIssue[] = Object.freeze([])

function defaultLocks(): ScoreSyncLocks | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) return null
  return navigator.locks as unknown as ScoreSyncLocks
}

function defaultChannel(name: string): ScoreBroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(name)
}

function upsertNewer(records: Map<string, RecordDTO>, record: RecordDTO) {
  const existing = records.get(record.sheetId)
  if (!existing || record.revision >= existing.revision) records.set(record.sheetId, record)
}

export class CloudScoreRepository implements WebScoreRepository {
  readonly kind = 'cloud' as const
  readonly userId: string
  readonly saveId: string

  private serverRecords = new Map<string, RecordDTO>()
  private outbox: OutboxEntry[] = []
  /** Outbox entries of this tab not written to IndexedDB yet, by mutation ID */
  private readonly unsaved = new Map<string, OutboxEntry>()
  /** Issues applied again whose deletion is written with their outbox entry */
  private readonly unsavedIssueDeletions = new Set<string>()
  private issues: SyncIssue[] = []
  private meta: CloudScoreMeta

  private view = new Map<string, CloudRecord>()
  private records: readonly ScoreRecord[] | null = null
  private recordsBySheetId: Map<string, ScoreRecord> | null = null
  private playEntries: readonly PlayEntry[] | null = null
  private resolveIdentity: SheetIdentityResolver | null = null

  private currentStatus: ScoreRepositoryStatus
  private state: ScoreRepositoryStatus['state'] = 'idle'
  private isReady = false
  private readonly listeners = new Set<() => void>()

  private queue: Promise<unknown> = Promise.resolve()
  private running: Promise<void> | null = null
  private rerun = false
  /** This cycle acknowledged an outbox entry or pulled a record: only then does it tell the other tabs */
  private cycleChanged = false
  private failures = 0
  /** The last failure was a 429: its wait is honoured even when the page comes back online */
  private rateLimited = false
  private backoffUntil = 0
  /** Sync cycles this tab ran to the end (pushed and pulled) */
  private completedCycles = 0
  private stopReason: CloudSyncStopReason | null = null
  private disposed = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private intervalTimer: ReturnType<typeof setInterval> | null = null
  private channel: ScoreBroadcastChannel | null = null
  private removeListeners: (() => void) | null = null

  private readonly api: CloudSaveRecordsApi
  private readonly locks: ScoreSyncLocks | null
  private readonly reportMismatch: (report: ChecksumMismatchReport) => void
  private readonly onStopped: ((reason: CloudSyncStopReason) => void) | undefined
  private readonly isVisible: () => boolean

  private constructor(
    private readonly database: CloudScoreDatabase,
    private readonly options: CloudScoreRepositoryOptions,
  ) {
    this.userId = options.userId
    this.saveId = options.saveId
    this.api = options.api
    this.locks = options.locks === undefined ? defaultLocks() : options.locks
    this.reportMismatch = options.reportChecksumMismatch ?? (() => {})
    this.onStopped = options.onStopped
    this.isVisible =
      options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
    this.meta = { saveId: options.saveId, lastSyncedRevision: 0 }
    this.currentStatus = this.buildStatus()
  }

  /** Opens the user's database and loads the cached save; call {@link start} to begin syncing */
  static async open(options: CloudScoreRepositoryOptions): Promise<CloudScoreRepository> {
    const database = await CloudScoreDatabase.open(options.userId, options.saveId, options.indexedDB)
    const repository = new CloudScoreRepository(database, options)
    await repository.reload()
    return repository
  }

  // --- Reads ---

  get ready(): boolean {
    return this.isReady
  }

  get status(): ScoreRepositoryStatus {
    return this.currentStatus
  }

  /** Why syncing stopped, or `null` while it runs */
  get stoppedReason(): CloudSyncStopReason | null {
    return this.stopReason
  }

  list(): readonly ScoreRecord[] {
    if (!this.records) {
      const bySheetId = new Map<string, ScoreRecord>()
      for (const record of this.view.values()) {
        if (record.deletedAt !== null) continue
        const identity = this.resolveIdentity?.(record.sheetId)
        if (identity) bySheetId.set(record.sheetId, cloudRecordToScoreRecord(record, identity))
      }
      this.records = Object.freeze([...bySheetId.values()])
      this.recordsBySheetId = bySheetId
    }
    return this.records
  }

  get(sheetId: string): ScoreRecord | undefined {
    this.list()
    return this.recordsBySheetId!.get(sheetId)
  }

  /** Every live record as a calculator entry, including charts the catalog does not know (yet) */
  entries(): readonly PlayEntry[] {
    if (!this.playEntries) {
      const entries: PlayEntry[] = []
      for (const record of this.view.values()) {
        if (record.deletedAt === null) {
          entries.push(cloudRecordToPlayEntry(record, this.resolveIdentity?.(record.sheetId)))
        }
      }
      this.playEntries = Object.freeze(entries)
    }
    return this.playEntries
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  setIdentityResolver(resolveIdentity: SheetIdentityResolver | null) {
    if (this.resolveIdentity === resolveIdentity) return
    this.resolveIdentity = resolveIdentity
    this.invalidateDerived()
    this.notify()
  }

  /** A cloud save holds one record per chart, so there are no duplicates to rank; kept for interface parity */
  setInternalLevelResolver(_resolveInternalLevel: unknown) {}

  // --- Writes ---

  setManual(entry: ManualEntry, method: ManualEntryMethod): void {
    const value = manualEntryToSetValue(entry)
    this.enqueue([{ op: 'set', sheetId: entry.sheetId, value, entryMethod: method }])
  }

  delete(sheetIds: string[]): void {
    const live = sheetIds.filter((sheetId) => this.view.get(sheetId)?.deletedAt === null)
    this.enqueue(live.map((sheetId) => ({ op: 'delete', sheetId, entryMethod: 'typed' })))
  }

  /**
   * Deletes every record, each guarded by the revision this device has of it: a record the server has since
   * verified anew is kept and reported as a superseded issue instead (§5.4). Nothing is deleted locally only.
   */
  clear(): void {
    this.delete([...this.view.keys()])
  }

  /** Whether the server runs imports for the user (`serverImports`); `false` is the §7.4 fallback */
  get serverImportsEnabled(): boolean {
    return this.options.serverImports ?? true
  }

  /**
   * Uploads entries read from a file to `client-imports` (§7.3) as one job: `trigger: 'user'`, one idempotency key
   * for every chunk and every retry, each chunk's canonical SHA-256 as a cross-check. Chunks hold at most 5000 records
   * and a body under the route's 2 MiB limit; all of them are built before anything is cleared
   * ({@link chunkImportRecords} throws `ImportTooLargeError` for an upload that cannot fit). Then pulls what the job
   * wrote. A `replace` import clears the save first (§5.3 rule 5): the revision-guarded deletes of {@link clear}
   * must reach the server before the upload starts, or nothing is imported.
   *
   * Every record is validated with the server's strict `ImportRecordSchema` first: those it would reject are never
   * sent, and an import where none passes throws {@link NothingToImportError} before anything is cleared. The result
   * counts what the server did (`count`: the records the save now holds from this import), not what was sent.
   *
   * Records of maimai NET, LXNS and Diving-Fish are refused unless server imports are off (§7.4): the server fetches
   * those itself ({@link runServerImport}).
   */
  async applyImport(entries: PlayEntry[], meta: ImportMeta): Promise<ImportResult> {
    const source = clientImportPlan(meta.source, this.serverImportsEnabled, meta.claimedSource)?.source
    try {
      const result = await this.applyClientImport(entries, meta)
      if (source && result.job) this.reportImportJob('succeeded', result.job.source ?? source, 'client')
      return result
    } catch (error) {
      if (source && !(error instanceof NothingToImportError) && !(error instanceof CloudClearNotSentError)) {
        this.reportImportJob('failed', source, 'client')
      }
      throw error
    }
  }

  private reportImportJob(status: ImportJobReport['status'], source: string, fetchedBy: ImportJobReport['fetchedBy']) {
    try {
      this.options.onImportJobFinished?.({ status, source, fetchedBy })
    } catch {
      // Analytics never breaks an import
    }
  }

  private async applyClientImport(entries: PlayEntry[], meta: ImportMeta): Promise<ImportResult> {
    const plan = clientImportPlan(meta.source, this.serverImportsEnabled, meta.claimedSource)
    if (!plan) throw new UnsupportedScoreOperationError(`Uploading records from ${meta.source}`, this.kind)
    const imports = this.requireImports()
    const { records, skipped, rejected } = entriesToImportRecords(entries, plan)
    // Checked before the clear: an import none of whose records the server accepts never empties the save
    if (records.length === 0) {
      if (entries.length > 0) throw new NothingToImportError(skipped, rejected)
      return { count: 0, skipped, rejected }
    }
    // `auto` (the automatic maimai NET import of the §7.4 fallback) never brings back what the user deleted (§5.3)
    const trigger = meta.trigger ?? 'user'
    const idempotencyKey = meta.idempotencyKey ?? newIdempotencyKey()
    const envelope = {
      id: this.saveId,
      idempotencyKey,
      source: plan.source,
      trigger,
      sourceAccountId: meta.claimedAccountId ?? null,
    }
    // Every chunk is built and size-checked before the clear: an upload that cannot be sent never empties the save
    const chunks = chunkImportRecords(records, envelope)
    if (meta.mode === 'replace') await this.clearBeforeImport()

    let result: ImportResultDTO | null = null
    for (const [chunkIndex, chunk] of chunks.entries()) {
      // What the server hashes for this chunk: its accepted records, which are all of them
      const rawPayloadSha256 = await chunkPayloadSha256(chunk)
      const send = () =>
        this.withImportRetries(() =>
          imports.client(
            clientImportBody(
              { ...envelope, rawPayloadSha256 },
              { chunkIndex, chunkCount: chunks.length, records: chunk },
            ),
          ),
        )
      for (let attempt = 1; ; attempt++) {
        try {
          result = await send()
          break
        } catch (error) {
          // Another import of the save is running (another tab, another device): wait for it, then send this one.
          // Its job is never reported as this one's
          const running = importInProgressJobId(error)
          if (!running || attempt >= IMPORT_MAX_ATTEMPTS || this.disposed) throw error
          await this.waitForJob(running)
        }
      }
    }
    let job = result!.job
    if (job.status === 'running') job = await this.waitForJob(job.id)
    await this.notifyImportJobCompleted()
    if (job.status === 'failed') throw new ServerImportFailedError(job.errorCode ?? 'failed', job)
    return {
      count: importedCount(job.counts),
      skipped: skipped + job.counts.skippedUnknownSheet,
      rejected: rejected + job.counts.rejected,
      job,
    }
  }

  /**
   * Runs an import on the server and yields its progress (§7.1, §8.3). One idempotency key for the whole action
   * (`args.idempotencyKey`, or a fresh UUID): a dropped connection, a 5xx or a 429 sends the request again with it,
   * so the server never runs the import twice. When the job is done the save is pulled (the records come from the
   * server, never from this client); the last progress (`done`) carries the job. A failed job throws
   * {@link ServerImportFailedError}.
   *
   * A 409 `IMPORT_IN_PROGRESS` names another job of the same source on the save. It is waited for, and adopted only
   * when it is the same import: the same trigger and source account ({@link isSameServerImport}); an LXNS job never
   * is, since the linked account may have changed while it ran. Otherwise it is
   * never reported as this import: the request is sent once more with the same key, and a second 409 throws
   * {@link ImportAlreadyRunningError}.
   */
  async *runServerImport<K extends ServerImportKind>(
    kind: K,
    args: ServerImportArgs[K],
  ): AsyncGenerator<ImportProgress> {
    if (!this.serverImportsEnabled) throw new ServerImportsDisabledError()
    const fallbackSource =
      kind === 'maimai-net' ? `maimai-net-${(args as ServerImportArgs['maimai-net']).region}` : (kind as string)
    let finished = false
    try {
      for await (const progress of this.runServerImportJob(kind, args)) {
        if (progress.stage === 'done' && progress.job && !finished) {
          finished = true
          this.reportImportJob('succeeded', progress.job.source ?? fallbackSource, 'server')
        }
        yield progress
      }
    } catch (error) {
      if (!finished) {
        finished = true
        const job = error instanceof ServerImportFailedError ? error.job : null
        this.reportImportJob('failed', job?.source ?? fallbackSource, 'server')
      }
      throw error
    }
  }

  private async *runServerImportJob<K extends ServerImportKind>(
    kind: K,
    args: ServerImportArgs[K],
  ): AsyncGenerator<ImportProgress> {
    const imports = this.requireImports()
    const idempotencyKey = args.idempotencyKey ?? newIdempotencyKey()
    const trigger = args.trigger ?? 'user'
    const identity = await serverImportIdentity(kind, args, trigger)

    const start = (): Promise<StartedImport> | AsyncGenerator<ImportProgress, StartedImport> => {
      if (kind === 'maimai-net') {
        const netArgs = args as ServerImportArgs['maimai-net']
        return this.runNetImport({
          idempotencyKey,
          trigger,
          region: netArgs.region,
          id: netArgs.id,
          password: netArgs.password,
        })
      }
      return this.withImportRetries(() => {
        if (kind === 'lxns') return imports.lxns({ id: this.saveId, idempotencyKey, trigger })
        const dfArgs = args as ServerImportArgs['diving-fish']
        return imports.divingFish({
          id: this.saveId,
          idempotencyKey,
          trigger,
          ...(dfArgs.username ? { username: dfArgs.username } : { qq: dfArgs.qq }),
        })
      }).then(
        (result): StartedImport => ({ job: result.job }),
        (error: unknown): StartedImport => {
          const running = importInProgressJobId(error)
          if (!running) throw error
          return { runningJobId: running }
        },
      )
    }

    let job: ImportJobDTO
    for (let sent = 1; ; sent++) {
      const pending = start()
      const started = pending instanceof Promise ? await pending : yield* pending
      if ('job' in started) {
        job = started.job
        break
      }
      // A second 409 after waiting once: another import keeps the source busy
      if (sent > 1) throw new ImportAlreadyRunningError(null)
      yield { stage: 'waiting', progress: 0.5 }
      const other = await this.waitForJob(started.runningJobId)
      if (isSameServerImport(other, identity)) {
        job = other
        break
      }
      // Another account's or trigger's job, finished now: this import has not run yet, so it is sent once more
    }

    if (job.status === 'running') {
      yield { stage: 'waiting', progress: 0.5 }
      job = await this.waitForJob(job.id)
    }
    if (job.status === 'failed') throw new ServerImportFailedError(job.errorCode ?? 'failed', job)
    yield { stage: 'pulling', progress: 1, job }
    await this.notifyImportJobCompleted()
    yield { stage: 'done', progress: 1, job }
  }

  /** The save's recent import jobs, newest first (`GET /saves/{id}/imports`) */
  listImportJobs(limit = 20): Promise<ImportJobDTO[]> {
    return this.requireImports().list({ id: this.saveId, limit })
  }

  private requireImports(): CloudSaveImportsApi {
    if (!this.options.imports) throw new UnsupportedScoreOperationError('Import', this.kind)
    return this.options.imports
  }

  /** The NET stream, sent again with the same key when it drops; a 409 names the running job */
  private async *runNetImport(body: {
    idempotencyKey: string
    trigger: 'user' | 'auto'
    region: 'jp' | 'intl'
    id: string
    password: string
  }): AsyncGenerator<ImportProgress, StartedImport> {
    const transport = this.options.netImport
    if (!transport) throw new UnsupportedScoreOperationError('maimai NET import', this.kind)
    for (let attempt = 1; ; attempt++) {
      try {
        for await (const event of transport({ saveId: this.saveId, body }) as AsyncIterable<NetImportStreamEvent>) {
          if (event.type === 'progress') {
            yield {
              stage: event.state,
              // The job is not done when the fetch is: merging and pulling still follow
              progress: Math.min(
                isFetchNetRecordProgressState(event.state) ? FETCH_STATE_PROGRESS[event.state] : 0.5,
                0.95,
              ),
            }
          } else if (event.type === 'done') {
            return { job: event.result.job }
          } else {
            throw new ServerImportFailedError(event.code, null, event.message)
          }
        }
        throw new TypeError('The import stream closed early')
      } catch (error) {
        if (error instanceof ServerImportFailedError) throw error
        const running = importInProgressJobId(error)
        if (running) return { runningJobId: running }
        const retry = isRetryableImportError(error)
        if (!retry.retry || attempt >= IMPORT_MAX_ATTEMPTS || this.disposed) throw error
        await delay(retry.afterMs ?? this.retryDelay(attempt))
      }
    }
  }

  /** Sends an import request again with the same key on a dropped connection, a 5xx or a 429 */
  private async withImportRetries<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await request()
      } catch (error) {
        const retry = isRetryableImportError(error)
        if (!retry.retry || attempt >= IMPORT_MAX_ATTEMPTS || this.disposed) throw error
        await delay(retry.afterMs ?? this.retryDelay(attempt))
      }
    }
  }

  private retryDelay(attempt: number) {
    return (this.options.importRetryDelayMs ?? 1_000) * 2 ** (attempt - 1)
  }

  /** Polls a running job (`GET /imports/{jobId}`) until it has finished */
  private async waitForJob(jobId: string): Promise<ImportJobDTO> {
    const imports = this.requireImports()
    const interval = this.options.importPollIntervalMs ?? 2_000
    const deadline = Date.now() + IMPORT_POLL_TIMEOUT_MS
    for (;;) {
      const job = await this.withImportRetries(() => imports.get({ jobId }))
      if (job.status !== 'running') return job
      if (Date.now() > deadline || this.disposed) throw new ServerImportFailedError('abandoned', job)
      await delay(interval)
    }
  }

  /** The "clear" half of a cloud "replace" import: every delete must reach the server before the upload */
  private async clearBeforeImport() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudClearNotSentError()
    const deadline = Date.now() + CLEAR_BEFORE_IMPORT_TIMEOUT_MS
    // What to delete is what the server has now: before the first pull this device knows nothing of the save, and
    // other devices may have written since the last one
    if (!(await this.pullNow(deadline))) throw new CloudClearNotSentError()
    this.clear()
    const sent = await this.flush(Math.max(0, deadline - Date.now()))
    if (!sent) throw new CloudClearNotSentError()
  }

  /**
   * Runs sync cycles until one has pulled to the latest revision, by `deadline`. `false` when none could: offline,
   * a failure waiting out its backoff, syncing stopped. Another tab holding the sync lock is waited for.
   */
  private async pullNow(deadline: number): Promise<boolean> {
    // A cycle already running may have pulled before the call: the one after it counts
    const target = this.completedCycles + (this.running ? 2 : 1)
    if (!this.rateLimited) this.backoffUntil = 0
    while (this.completedCycles < target) {
      if (this.disposed || this.stopReason || this.backoffUntil > Date.now()) return false
      const remaining = deadline - Date.now()
      if (remaining <= 0) return false
      let timeout: ReturnType<typeof setTimeout> | undefined
      const cycle = this.sync()
      const finished = await Promise.race([
        cycle.then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), remaining)
        }),
      ])
      clearTimeout(timeout)
      if (!finished) return false
      // The cycle ran in another tab (the lock was taken): try again shortly, with the lock free
      if (this.completedCycles < target) await delay(Math.min(PULL_NOW_RETRY_MS, Math.max(0, deadline - Date.now())))
    }
    return true
  }

  /**
   * @internal The `modifyEntries` compatibility adapter: the difference to `entries` as manual changes (sets of the
   * changed charts, deletes of the removed ones)
   */
  replaceEntries(entries: readonly PlayEntry[]) {
    const current = new Map(this.entries().map((entry) => [entry.sheetId, entry]))
    const next = new Map(entries.map((entry) => [entry.sheetId, entry]))
    const changes: PendingChange[] = []
    for (const [sheetId, entry] of next) {
      const existing = current.get(sheetId)
      if (
        existing &&
        existing.achievementRate === entry.achievementRate &&
        (existing.comboFlag ?? null) === (entry.comboFlag ?? null) &&
        (existing.syncFlag ?? null) === (entry.syncFlag ?? null) &&
        (existing.dxScore ?? null) === (entry.dxScore ?? null)
      ) {
        continue
      }
      changes.push({ op: 'set', sheetId, value: manualEntryToSetValue(entry), entryMethod: 'typed' })
    }
    for (const sheetId of current.keys()) {
      if (!next.has(sheetId)) changes.push({ op: 'delete', sheetId, entryMethod: 'typed' })
    }
    this.enqueue(changes)
  }

  /**
   * Applies the intent of an issue again, on purpose: over the record the server has now (a new baseline), so a
   * `set` overrides even a verified record and makes it `user_edited` (§5.4)
   */
  reapplyIssue(issueId: string): void {
    const issue = this.saveIssues().find((candidate) => candidate.id === issueId)
    if (!issue) return
    const { intent } = issue
    const change: PendingChange | null =
      intent.op === 'set' && intent.value
        ? { op: 'set', sheetId: issue.sheetId, value: intent.value, entryMethod: intent.entryMethod }
        : intent.op === 'delete'
          ? { op: 'delete', sheetId: issue.sheetId, entryMethod: intent.entryMethod }
          : null
    this.issues = this.issues.filter((candidate) => candidate.id !== issueId)
    if (change) {
      this.enqueue([change], [issueId])
    } else {
      this.forgetIssue(issueId)
    }
  }

  /** Forgets an issue, keeping the server's record */
  dismissIssue(issueId: string): void {
    if (!this.saveIssues().some((issue) => issue.id === issueId)) return
    this.issues = this.issues.filter((issue) => issue.id !== issueId)
    this.forgetIssue(issueId)
  }

  /** Deletes an issue the way an issue applied again is: a reload that read it before the write never brings it back */
  private forgetIssue(issueId: string) {
    this.unsavedIssueDeletions.add(issueId)
    this.refresh()
    this.persistUnsaved().catch((error: unknown) => {
      console.warn('[cloud-save] Could not forget the issue, retrying with the next sync', error)
    })
  }

  // --- Sync ---

  /** Starts listening to the sync triggers and runs the first sync (the sign-in trigger) */
  start() {
    if (this.disposed || this.removeListeners) return
    const createChannel = this.options.createChannel === undefined ? defaultChannel : this.options.createChannel
    this.channel = createChannel?.(SCORE_BROADCAST_CHANNEL_NAME) ?? null
    if (this.channel) {
      this.channel.onmessage = (event) => this.onBroadcast(event.data)
    }

    const target = this.options.eventTarget === undefined ? globalThis.window : this.options.eventTarget
    const onOnline = () => {
      // Back online: retry now, unless the server asked to wait (429)
      if (!this.rateLimited) {
        this.failures = 0
        this.backoffUntil = 0
        if (this.retryTimer) clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
      void this.sync()
    }
    const onVisible = () => {
      if (this.isVisible()) void this.sync()
    }
    if (target) {
      target.addEventListener('online', onOnline)
      target.addEventListener('focus', onVisible)
    }
    const visibilityTarget =
      this.options.visibilityTarget === undefined
        ? typeof document === 'undefined'
          ? null
          : document
        : this.options.visibilityTarget
    visibilityTarget?.addEventListener('visibilitychange', onVisible)
    this.intervalTimer = setInterval(() => {
      if (this.isVisible()) void this.sync()
    }, SYNC_INTERVAL_MS)

    this.removeListeners = () => {
      if (target) {
        target.removeEventListener('online', onOnline)
        target.removeEventListener('focus', onVisible)
      }
      visibilityTarget?.removeEventListener('visibilitychange', onVisible)
    }

    void this.sync()
  }

  /** Resolves once no sync cycle runs (tests, and callers that want the result of a write) */
  async idle(): Promise<void> {
    while (this.running) await this.running
  }

  /** The hook for import jobs: pull what a finished job wrote */
  notifyImportJobCompleted(): Promise<void> {
    return this.sync()
  }

  /**
   * Runs a sync cycle now (or joins the running one, which then runs once more). Resolves when done; never
   * rejects. Waits out a backoff: the retry timer runs the cycle then.
   */
  sync(): Promise<void> {
    if (this.disposed || this.stopReason) return Promise.resolve()
    if (this.backoffUntil > Date.now()) return Promise.resolve()
    if (this.running) {
      this.rerun = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.rerun = false
        await this.runLockedCycle()
      } while (this.rerun && !this.disposed && !this.stopReason && this.backoffUntil <= Date.now())
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  /**
   * Tries to send the outbox now, waiting at most `timeoutMs` (signing out, cloud save turned off). Resolves `true`
   * when nothing of this save is left in the outbox. A pending 429 wait is honoured.
   */
  async flush(timeoutMs: number = FLUSH_TIMEOUT_MS): Promise<boolean> {
    if (this.pendingEntries().length === 0) return true
    if (this.disposed || this.stopReason) return false
    if (!this.rateLimited) this.backoffUntil = 0
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.sync(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs)
      }),
    ])
    clearTimeout(timeout)
    return this.pendingEntries().length === 0
  }

  /**
   * Stops syncing and closes the database: signing out, cloud save turned off, another save chosen. Tries to send
   * the outbox first, for at most `flushTimeoutMs`; what is not sent stays in the outbox for the next sign-in of
   * the same user.
   */
  async dispose({ flushTimeoutMs = FLUSH_TIMEOUT_MS }: { flushTimeoutMs?: number } = {}): Promise<void> {
    if (this.disposed) return
    if (flushTimeoutMs > 0) await this.flush(flushTimeoutMs)
    this.disposed = true
    this.clearTimers()
    this.removeListeners?.()
    this.removeListeners = null
    if (this.channel) {
      this.channel.onmessage = null
      this.channel.close()
      this.channel = null
    }
    this.listeners.clear()
    // A cycle cut off by the timeout fails on the closed database; its writes are idempotent on the next start
    await this.queue.catch(() => {})
    this.database.close()
  }

  private async runLockedCycle() {
    if (!this.locks) return this.runCycle()
    await this.locks.request(SCORE_SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      // Another tab is syncing: it pushes this tab's outbox too (it is shared) and broadcasts the result. This tab
      // shows the shared cache as it is, and is ready even when the save is empty (no revision to wait for)
      if (!lock) {
        try {
          await this.reload()
        } catch (error) {
          console.warn('[cloud-save] Could not read the cache', error)
        }
        this.markReady()
        return
      }
      await this.runCycle()
    })
  }

  private async runCycle() {
    this.setState('syncing')
    this.cycleChanged = false
    try {
      // Changes other tabs made since the last broadcast
      await this.reload()
      // A change IndexedDB refused earlier is stored before anything is sent
      await this.persistUnsaved()
      await this.push()
      await this.pull()
      this.completedCycles++
      // The outbox entries added while this cycle ran stay on top of the pulled records
      await this.reload()
      this.failures = 0
      this.rateLimited = false
      this.setState('idle')
      // An unchanged cycle stays quiet: its broadcast would make a syncing peer run once more, and two tabs would
      // keep each other syncing (without Web Locks) though nothing changes
      if (this.cycleChanged) this.broadcast()
    } catch (error) {
      this.handleFailure(error)
    } finally {
      this.markReady()
    }
  }

  private markReady() {
    if (this.isReady || this.disposed) return
    this.isReady = true
    this.notify()
  }

  private handleFailure(error: unknown) {
    if (this.disposed) return
    const failure = classifySyncError(error)
    switch (failure.kind) {
      case 'stop':
        this.stopReason = failure.reason
        this.clearTimers()
        this.setState('error')
        this.onStopped?.(failure.reason)
        return
      case 'rate-limited': {
        this.failures++
        this.rateLimited = true
        const delay = Number.isNaN(failure.retryAfterMs) ? backoffDelay(this.failures) : failure.retryAfterMs
        this.scheduleRetry(delay)
        // Not an error (§5.7): the pending changes wait
        this.setState('idle')
        return
      }
      case 'retry':
        this.failures++
        this.scheduleRetry(backoffDelay(this.failures))
        this.setState(failure.offline ? 'offline' : 'error')
        if (!failure.offline) console.warn('[cloud-save] Sync failed, retrying', error)
        return
    }
  }

  private scheduleRetry(delay: number) {
    this.backoffUntil = Date.now() + delay
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.backoffUntil = 0
      void this.sync()
    }, delay)
  }

  private scheduleDebouncedSync() {
    if (this.disposed || this.stopReason) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.sync()
    }, SYNC_DEBOUNCE_MS)
  }

  private clearTimers() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.intervalTimer) clearInterval(this.intervalTimer)
    this.debounceTimer = null
    this.retryTimer = null
    this.intervalTimer = null
  }

  private async push() {
    const pending = this.pendingEntries()
    for (let start = 0; start < pending.length; start += CLOUD_SAVE_MAX_MUTATIONS) {
      if (this.disposed) return
      const batch = pending.slice(start, start + CLOUD_SAVE_MAX_MUTATIONS)
      const response = await this.api.mutate({ id: this.saveId, mutations: batch.map(toWireMutation) })
      const results = new Map(response.results.map((result) => [result.mutationId, result]))

      const putRecords: RecordDTO[] = []
      const issues: SyncIssue[] = []
      const acknowledged: string[] = []
      for (const entry of batch) {
        const result = results.get(entry.mutationId)
        // No answer for it: it stays in the outbox and goes out again with the next push
        if (!result) continue
        acknowledged.push(entry.mutationId)
        if (result.record) {
          putRecords.push(result.record)
          upsertNewer(this.serverRecords, result.record)
        }
        if (result.status === 'superseded' || result.status === 'rejected') {
          issues.push(issueOf(entry, result.status, result.reason))
        }
      }

      const done = new Set(acknowledged)
      if (done.size > 0) this.cycleChanged = true
      this.outbox = this.outbox.filter((entry) => !done.has(entry.mutationId))
      const written = await this.persist(async (database) => {
        // Run in the write queue, so a write of this tab's unsaved entries has landed or not started. An entry only
        // this tab holds gets its issue as is (and is never written to the outbox now); a stored entry gets it only
        // if this transaction removes it, so a duplicate acknowledgement of an entry another tab also sent cannot
        // bring back an issue that tab's user dismissed or applied again
        const ownIssues = issues.filter((issue) => this.unsaved.has(issue.id))
        const sharedIssues = issues.filter((issue) => !this.unsaved.has(issue.id))
        for (const mutationId of acknowledged) this.unsaved.delete(mutationId)
        const { acknowledgedIssues } = await database.write({
          putRecords,
          putIssues: ownIssues,
          acknowledgeIssues: sharedIssues,
          deleteOutbox: acknowledged,
        })
        return [...ownIssues, ...acknowledgedIssues]
      })
      this.issues = [...this.issues, ...written]
      this.refresh()
    }
  }

  private async pull() {
    // Nothing synced yet: a full pull, so its later pages are never reset by the horizon
    if (this.meta.lastSyncedRevision === 0) {
      const outcome = await this.pullFull()
      if (outcome.kind === 'mismatch') {
        this.reportMismatch(outcome.report)
        await this.pullFull()
      }
      return
    }
    const outcome = await this.pullIncremental(this.meta.lastSyncedRevision)
    if (outcome.kind === 'reset') {
      await this.pullFull()
      return
    }
    if (outcome.kind === 'mismatch') {
      this.reportMismatch(outcome.report)
      // One full refetch; a mismatch after it is not chased further this cycle
      await this.pullFull()
    }
  }

  /**
   * The changes after `since`, each page kept as it comes (revisions are unique per row and strictly increasing,
   * §5.2). A reset, on any page, hands over to a full pull.
   */
  private async pullIncremental(since: number): Promise<PullOutcome | { kind: 'reset' }> {
    let cursor = since
    for (;;) {
      if (this.disposed) return { kind: 'ok' }
      const page = await this.api.changes({
        id: this.saveId,
        since: cursor,
        limit: CLOUD_SAVE_MAX_CHANGES_LIMIT,
        mode: 'incremental',
      })
      if (page.resetRequired) return { kind: 'reset' }
      for (const record of page.records) upsertNewer(this.serverRecords, record)
      if (page.records.length > 0) this.cycleChanged = true
      const advanced = page.nextSince > cursor
      cursor = Math.max(cursor, page.nextSince)
      this.meta = { saveId: this.saveId, lastSyncedRevision: cursor }
      const meta = this.meta
      await this.persist((database) => database.write({ putRecords: page.records, meta }))
      if (!page.hasMore || !advanced) {
        this.refresh()
        return this.compareChecksum(page.checksum, this.serverRecords.values())
      }
    }
  }

  /**
   * Every live record, from 0, with `mode: 'full'` on every page. Nothing is committed (records or cursor) until the
   * last page is in: a reset in the middle (the server should never send one in full mode) starts over from 0, and
   * after {@link FULL_PULL_MAX_ATTEMPTS} the cycle fails and backs off rather than keep a partial save.
   */
  private async pullFull(): Promise<PullOutcome> {
    for (let attempt = 1; ; attempt++) {
      const collected = new Map<string, RecordDTO>()
      let cursor = 0
      let checksum: ChangesDTO['checksum'] = null
      let reset = false
      for (;;) {
        if (this.disposed) return { kind: 'ok' }
        const page = await this.api.changes({
          id: this.saveId,
          since: cursor,
          limit: CLOUD_SAVE_MAX_CHANGES_LIMIT,
          mode: 'full',
        })
        if (page.resetRequired) {
          reset = true
          break
        }
        for (const record of page.records) upsertNewer(collected, record)
        const advanced = page.nextSince > cursor
        cursor = Math.max(cursor, page.nextSince)
        if (!page.hasMore || !advanced) {
          checksum = page.checksum
          break
        }
      }
      if (reset) {
        if (attempt >= FULL_PULL_MAX_ATTEMPTS) throw new Error('The server kept resetting a full pull')
        continue
      }

      if (cursor !== this.meta.lastSyncedRevision || !sameRevisions(this.serverRecords, collected)) {
        this.cycleChanged = true
      }
      this.serverRecords = collected
      this.meta = { saveId: this.saveId, lastSyncedRevision: cursor }
      const meta = this.meta
      const records = [...collected.values()]
      await this.persist((database) =>
        database.write({ replaceRecords: { throughRevision: cursor }, putRecords: records, meta }),
      )
      this.refresh()
      return this.compareChecksum(checksum, collected.values())
    }
  }

  private compareChecksum(checksum: ChangesDTO['checksum'], records: Iterable<RecordDTO>): PullOutcome {
    if (!checksum) return { kind: 'ok' }
    const actual = checksumOf(records)
    if (actual.count === checksum.count && actual.sumAchievement === checksum.sumAchievement) return { kind: 'ok' }
    return {
      kind: 'mismatch',
      report: {
        expectedCount: checksum.count,
        expectedSumAchievement: checksum.sumAchievement,
        actualCount: actual.count,
        actualSumAchievement: actual.sumAchievement,
      },
    }
  }

  // --- Local state ---

  private enqueue(changes: PendingChange[], deleteIssues: readonly string[] = []) {
    if (changes.length === 0) return
    const clientEditedAt = new Date().toISOString()
    const entries: OutboxEntry[] = changes.map((change) => ({
      mutationId: uuidv7(),
      saveId: this.saveId,
      op: change.op,
      sheetId: change.sheetId,
      // The revision of the record as the user saw it, from the published view: the server rebases on it (§5.4).
      // Not `serverRecords`, which a multi-page pull advances before the view shows the new pages: a baseline the
      // user never saw would let a stale edit overwrite a newer verified record without a `superseded` issue
      basedOnRevision: this.view.get(change.sheetId)?.revision ?? 0,
      ...(change.op === 'set' ? { value: change.value } : {}),
      entryMethod: change.entryMethod,
      clientEditedAt,
    }))
    this.outbox = [...this.outbox, ...entries]
    for (const entry of entries) this.unsaved.set(entry.mutationId, entry)
    for (const issueId of deleteIssues) this.unsavedIssueDeletions.add(issueId)
    this.refresh()
    this.persistUnsaved().then(
      () => this.broadcast(),
      (error: unknown) => {
        // Kept in memory (and on screen) until a write succeeds: the next sync cycle writes it first, and fails,
        // showing the error state, while IndexedDB refuses it
        console.warn('[cloud-save] Could not queue the change, retrying with the next sync', error)
        if (!this.disposed) this.setState('error')
      },
    )
    this.scheduleDebouncedSync()
  }

  /**
   * Writes the outbox entries not in IndexedDB yet, with the issues they replace, in one transaction: an intent
   * applied again is never gone from both the issues and the outbox (§5.4)
   */
  private persistUnsaved(): Promise<void> {
    return this.persist(async (database) => {
      const pending = [...this.unsaved.values()]
      const deleteIssues = [...this.unsavedIssueDeletions]
      if (pending.length === 0 && deleteIssues.length === 0) return
      const { added } = await database.write({ addOutbox: pending, deleteIssues })
      for (const entry of pending) this.unsaved.delete(entry.mutationId)
      for (const issueId of deleteIssues) this.unsavedIssueDeletions.delete(issueId)
      // Keep the creation order IndexedDB assigned, so a reload sorts them the same way
      const seqById = new Map(added.map((entry) => [entry.mutationId, entry.seq]))
      this.outbox = this.outbox.map((entry) =>
        seqById.has(entry.mutationId) ? { ...entry, seq: seqById.get(entry.mutationId) } : entry,
      )
    })
  }

  /** Reads everything back from IndexedDB (other tabs write there too) */
  private reload(): Promise<void> {
    return this.persist(async (database) => {
      // The cache of this save only: another tab on another save of the same user keeps its own
      const snapshot = await database.read()
      this.serverRecords = new Map(snapshot.records.map((record) => [record.sheetId, record]))
      this.meta = snapshot.meta
      // Changes queued in this tab whose write has not landed yet stay on top (after the stored ones)
      const stored = new Set(snapshot.outbox.map((entry) => entry.mutationId))
      const unsaved = this.outbox.filter((entry) => this.unsaved.has(entry.mutationId) && !stored.has(entry.mutationId))
      this.outbox = [...snapshot.outbox, ...unsaved]
      this.issues = snapshot.issues.filter((issue) => !this.unsavedIssueDeletions.has(issue.id))
      // A save synced before shows its cache right away; a new one waits for its first sync
      if (!this.isReady && this.meta.lastSyncedRevision > 0) this.isReady = true
      this.refresh()
    })
  }

  private persist<T>(task: (database: CloudScoreDatabase) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => task(this.database))
    this.queue = run.catch(() => {})
    return run
  }

  private onBroadcast(message: unknown) {
    const data = message as Partial<BroadcastMessage> | null
    if (!data || data.type !== 'changed' || data.userId !== this.userId || data.saveId !== this.saveId) return
    // A cycle is running: a reload now would swap the records it is pulling into (and bring back entries it is
    // acknowledging). Run once more instead; the next cycle starts with a reload
    if (this.running) {
      this.rerun = true
      return
    }
    void this.reload()
      .then(() => {
        // Another tab queued changes and may not hold the lock: the lock holder pushes them
        if (this.pendingEntries().length > 0) this.scheduleDebouncedSync()
      })
      .catch(() => {})
  }

  private broadcast() {
    if (this.disposed) return
    const message: BroadcastMessage = { type: 'changed', userId: this.userId, saveId: this.saveId }
    try {
      this.channel?.postMessage(message)
    } catch {
      // A closed channel: other tabs catch up on their next sync
    }
  }

  private pendingEntries(): OutboxEntry[] {
    return this.outbox.filter((entry) => entry.saveId === this.saveId)
  }

  /** The issues of this save; other saves' issues stay in the database for when they are active again */
  private saveIssues(): SyncIssue[] {
    return this.issues.filter((issue) => issue.saveId === this.saveId)
  }

  /** The server's records with the pending outbox entries laid over them, as the server would apply them */
  private rebuildView() {
    const view = new Map<string, CloudRecord>()
    // In revision order, so every tab and every reload lists the records the same way
    const byRevision = [...this.serverRecords.values()].sort((a, b) => a.revision - b.revision)
    for (const record of byRevision) view.set(record.sheetId, recordFromDTO(record))
    for (const entry of this.pendingEntries()) {
      const existing = view.get(entry.sheetId) ?? null
      // Optimistic: over the record this device has, so nothing is superseded locally
      const decision = decideManualMutation(
        existing,
        entry.op === 'set' && entry.value
          ? {
              op: 'set',
              basedOnRevision: existing?.revision ?? 0,
              value: entry.value,
              entryMethod: entry.entryMethod,
            }
          : { op: 'delete', basedOnRevision: existing?.revision ?? 0 },
      )
      if (decision.status !== 'applied' || !decision.next) continue
      const { deleted, ...fields } = decision.next
      view.set(entry.sheetId, {
        ...fields,
        sheetId: entry.sheetId,
        revision: existing?.revision ?? 0,
        deletedAt: deleted ? entry.clientEditedAt : null,
        pending: true,
      })
    }
    this.view = view
  }

  private refresh() {
    this.rebuildView()
    this.invalidateDerived()
    this.currentStatus = this.buildStatus()
    this.notify()
  }

  private setState(state: ScoreRepositoryStatus['state']) {
    if (this.state === state) return
    this.state = state
    this.currentStatus = this.buildStatus()
    this.notify()
  }

  private buildStatus(): ScoreRepositoryStatus {
    return Object.freeze({
      state: this.state,
      pendingCount: this.pendingEntries().length,
      lastSyncedRevision: this.meta.lastSyncedRevision,
      issues: (() => {
        const issues = this.saveIssues()
        return issues.length ? Object.freeze(issues) : EMPTY_ISSUES
      })(),
    })
  }

  private invalidateDerived() {
    this.records = null
    this.recordsBySheetId = null
    this.playEntries = null
  }

  private notify() {
    if (this.disposed) return
    for (const listener of [...this.listeners]) listener()
  }
}

type PullOutcome = { kind: 'ok' } | { kind: 'mismatch'; report: ChecksumMismatchReport }

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A server import request's answer: its own job, or the other job of the source a 409 named */
type StartedImport = { job: ImportJobDTO } | { runningJobId: string }

/**
 * The trigger and source account the server will record on the job of this request, as far as the client knows
 * them: the Diving-Fish username (trimmed, as the server does) or QQ; LXNS never (its job of another request is
 * waited for, never adopted);
 * a maimai NET job records the SEGA ID hash only when it cannot read the friend code, which the client never knows,
 * so a NET job of another request is adopted only when it recorded this SEGA ID's hash.
 */
async function serverImportIdentity<K extends ServerImportKind>(
  kind: K,
  args: ServerImportArgs[K],
  trigger: 'user' | 'auto',
): Promise<ServerImportIdentity> {
  // The linked LXNS account may have been relinked while another job ran: the client cannot know whose that job is
  if (kind === 'lxns') return { trigger, account: null }
  if (kind === 'diving-fish') {
    const dfArgs = args as ServerImportArgs['diving-fish']
    return {
      trigger,
      account: dfArgs.username
        ? { kind: 'df_username', id: dfArgs.username.trim() }
        : { kind: 'df_qq', id: dfArgs.qq ?? '' },
    }
  }
  const netArgs = args as ServerImportArgs['maimai-net']
  const hash = await sha256Hex(`${netArgs.region}:${netArgs.id}`)
  return { trigger, account: hash ? { kind: 'segaid_hash', id: hash } : null }
}

type PendingChange =
  | { op: 'set'; sheetId: string; value: NonNullable<OutboxEntry['value']>; entryMethod: ManualEntryMethod }
  | { op: 'delete'; sheetId: string; entryMethod: ManualEntryMethod }

/** Whether two sets of server records hold the same charts at the same revisions (a revision names one value) */
function sameRevisions(a: ReadonlyMap<string, RecordDTO>, b: ReadonlyMap<string, RecordDTO>): boolean {
  if (a.size !== b.size) return false
  for (const [sheetId, record] of a) {
    if (b.get(sheetId)?.revision !== record.revision) return false
  }
  return true
}

function toWireMutation(entry: OutboxEntry): MutationItemInput {
  return {
    mutationId: entry.mutationId,
    op: entry.op,
    sheetId: entry.sheetId,
    basedOnRevision: entry.basedOnRevision,
    clientEditedAt: entry.clientEditedAt,
    entryMethod: entry.entryMethod,
    ...(entry.op === 'set' && entry.value ? { value: entry.value } : {}),
  }
}

function issueOf(entry: OutboxEntry, kind: SyncIssue['kind'], reason: string | null): SyncIssue {
  return {
    id: entry.mutationId,
    saveId: entry.saveId,
    sheetId: entry.sheetId,
    kind,
    reason: reason ?? (kind === 'superseded' ? 'newer-verified-record' : 'rejected'),
    intent: {
      op: entry.op,
      ...(entry.value ? { value: entry.value } : {}),
      entryMethod: entry.entryMethod,
      clientEditedAt: entry.clientEditedAt,
    },
    createdAt: new Date().toISOString(),
  }
}