import type { ImportCountsDTO, ImportJobDTO } from '@gekichumai/api-contract'
import {
  withAchievementInt,
  type ImportWarning,
  type RatingImportResult,
  type ServerImportSource,
  type SongCatalog,
  type SourceAccountKind,
} from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/node'
import { Cause, Clock, Data, Duration, Effect, Exit } from 'effect'
import { log } from 'evlog'
import type { Database } from '../../db/index'
import { CloudSaveBadRequest, CloudSaveBusy, CloudSaveNotFound } from './errors'
import { importCatalog } from './import-catalog'
import {
  canonicalSha256,
  EMPTY_COUNTS,
  finishImportJob,
  IMPORT_JOB_COLUMNS,
  recordJobFetch,
  startImportJob,
  toImportJobDTO,
  type ImportJobRow,
} from './jobs'
import { completeImportJob, type MergeRecord } from './merge'
import { findSave } from './saves'

type DatabaseService = typeof Database.Service

/**
 * `score_import_jobs.error_code` of a failed server job. Codes only: no upstream text, so no credential or account
 * ID can end up in the row (design §7.2).
 */
export type ServerImportErrorCode =
  | 'invalid_credentials'
  | 'net_maintenance'
  | 'aime_card_unavailable'
  | 'token_error'
  | 'not_connected'
  | 'connection_expired'
  | 'not_configured'
  | 'not_found'
  | 'forbidden'
  | 'upstream_error'
  | 'invalid_response'
  | 'timeout'
  | 'catalog_unavailable'
  | 'save_not_found'
  | 'save_busy'
  | 'merge_failed'
  | 'interrupted'
  | 'abandoned'
  | 'internal_error'

/** An upstream fetch failed; the job fails with `code` and writes no record */
export class ServerImportFailure extends Data.TaggedError('ServerImportFailure')<{
  readonly code: ServerImportErrorCode
  readonly cause?: unknown
}> {}

/** What a server job fetched from its upstream, before normalization */
export interface UpstreamFetch {
  /** The upstream payload that backs the records; its canonical JSON is hashed into `raw_payload_sha256` */
  payload: unknown
  /** Normalizes the payload with the shared `import-normalizers` */
  normalize: (catalog: SongCatalog) => RatingImportResult
  sourceAccountId: string | null
  sourceAccountKind: SourceAccountKind | null
}

export interface ServerImportStart {
  userId: string
  job: ImportJobRow
  /** The key named an existing job: nothing is fetched, the job is answered as it is */
  replayed: boolean
  /** The save's revision when the job started */
  revision: number
}

/**
 * Starts a server job (design §7.1): the save must be the user's (404 otherwise); a job with the same idempotency
 * key is a replay, and a key that names a job of another save or source is `CloudSaveBadRequest` (400); a running job
 * of the same source on the save is `ImportInProgress` (409).
 */
export const beginServerImport = (
  database: DatabaseService,
  input: {
    userId: string
    saveId: string
    source: ServerImportSource
    trigger: 'user' | 'auto'
    idempotencyKey: string
  },
) =>
  Effect.gen(function* () {
    const save = yield* findSave(database, input.userId, input.saveId)
    const started = yield* startImportJob(database, {
      userId: input.userId,
      saveId: save.id,
      source: input.source,
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
    })
    // a key is the user's: one that already names an import of another save or source is a client bug, not a replay
    if (started.job.save_id !== save.id || started.job.source !== input.source) {
      return yield* new CloudSaveBadRequest({ message: 'The idempotency key belongs to another import' })
    }
    return {
      userId: input.userId,
      job: started.job,
      replayed: started.replayed,
      revision: Number(save.revision),
    } satisfies ServerImportStart
  })

/** The import counts of normalizer warnings: unknown charts (and UTAGE, which no save stores) vs. invalid values */
export function warningCounts(warnings: readonly ImportWarning[]) {
  let skippedUnknownSheet = 0
  let rejected = 0
  for (const warning of warnings) {
    if (warning.code === 'invalid-achievement') rejected += 1
    else skippedUnknownSheet += 1
  }
  return { skippedUnknownSheet, rejected }
}

/** The merge records of a normalized import */
export function toMergeRecords(result: RatingImportResult): { records: MergeRecord[]; warnings: ImportWarning[] } {
  const withInts = withAchievementInt(result)
  return {
    records: withInts.entries.map((entry) => ({
      sheetId: entry.sheetId,
      achievement: entry.achievementInt,
      comboFlag: entry.comboFlag ?? null,
      syncFlag: entry.syncFlag ?? null,
      dxScore: entry.dxScore ?? null,
      best50Bucket: entry.source?.best50Bucket ?? null,
    })),
    warnings: withInts.warnings,
  }
}

export interface ServerImportOutcome {
  job: ImportJobDTO
  /** The save's revision after the job */
  revision: number
  /** Set when the job failed */
  errorCode: ServerImportErrorCode | null
}

const failureCodeOf = (error: unknown): ServerImportErrorCode => {
  if (error instanceof ServerImportFailure) return error.code
  if (error instanceof CloudSaveNotFound) return 'save_not_found'
  if (error instanceof CloudSaveBusy) return 'save_busy'
  return 'merge_failed'
}

const loadJob = (database: DatabaseService, jobId: string) =>
  Effect.map(
    database.raw<ImportJobRow>(
      'CloudSave.loadJob',
      `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE id = $1`,
      [jobId],
    ),
    ({ rows }) => rows[0]!,
  )

/**
 * Runs a started server job to its end (design §7.1):
 * 1. `fetch` reads the upstream; it holds no database connection while it waits (LXNS reads its token first).
 * 2. `fetched_at` is the server clock when the upstream answered.
 * 3. The payload is normalized with the shared normalizers and resolved to `dsht_` IDs through the published catalog;
 *    records it cannot resolve count as `skippedUnknownSheet`, invalid values as `rejected`.
 * 4. `raw_payload_sha256` is the sha256 of the payload's canonical (key-sorted) JSON.
 * 5. One transaction merges the records (§5.3, at most 1000 rows per statement) and marks the job `succeeded`.
 *
 * All or nothing: if anything fails (the fetch, after its own retries; the catalog; the merge transaction, which
 * rolls back), the job is marked `failed` with an error code and no record is written. An interrupted job (server
 * shutdown) is marked `failed` (`interrupted`) too.
 *
 * Observability (§12.3): a span `import.job` (source, status, duration), the metric `import.skipped_unknown_sheet`,
 * and one evlog line per job with its ID, source and counts (never an account ID).
 */
export const runServerImport = <R>(
  database: DatabaseService,
  started: ServerImportStart,
  fetch: Effect.Effect<UpstreamFetch, ServerImportFailure, R>,
  options: { timeout: Duration.Input },
) => {
  const job = started.job
  const work = Effect.gen(function* () {
    const fetched = yield* fetch.pipe(
      Effect.timeoutOrElse({
        duration: options.timeout,
        orElse: () => Effect.fail(new ServerImportFailure({ code: 'timeout' })),
      }),
    )
    const fetchedAt = new Date(yield* Clock.currentTimeMillis)
    const catalog = yield* importCatalog.pipe(
      Effect.mapError((cause) => new ServerImportFailure({ code: 'catalog_unavailable', cause })),
    )
    const { records, warnings } = toMergeRecords(fetched.normalize(catalog))
    const skipped = warningCounts(warnings)
    if (skipped.skippedUnknownSheet > 0) {
      yield* Effect.sync(() =>
        Sentry.metrics.count('import.skipped_unknown_sheet', skipped.skippedUnknownSheet, {
          attributes: { source: job.source },
        }),
      )
    }
    const recorded = yield* recordJobFetch(database, job.id, {
      fetchedAt,
      rawPayloadSha256: canonicalSha256(fetched.payload),
      sourceAccountId: fetched.sourceAccountId,
      sourceAccountKind: fetched.sourceAccountKind,
    })
    // the sweeper failed the job meanwhile
    if (!recorded) return yield* new ServerImportFailure({ code: 'abandoned' })
    const extraCounts: Partial<ImportCountsDTO> = {
      fetched: skipped.skippedUnknownSheet + skipped.rejected,
      skippedUnknownSheet: skipped.skippedUnknownSheet,
      rejected: skipped.rejected,
    }
    return yield* completeImportJob(database, {
      userId: started.userId,
      saveId: job.save_id,
      jobId: job.id,
      records,
      extraCounts,
    })
  })

  const fail = (code: ServerImportErrorCode) =>
    Effect.gen(function* () {
      const failed = yield* finishImportJob(database, job.id, { status: 'failed', counts: {}, errorCode: code })
      return {
        job: toImportJobDTO(failed ?? (yield* loadJob(database, job.id))),
        revision: started.revision,
        errorCode: code,
      } satisfies ServerImportOutcome
    })

  return Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const exit = yield* Effect.exit(work)
    let outcome: ServerImportOutcome
    if (Exit.isSuccess(exit)) {
      outcome = { ...exit.value, errorCode: null }
    } else if (Cause.hasInterruptsOnly(exit.cause)) {
      // shutdown: leave no job running, then let the interruption through
      yield* Effect.uninterruptible(fail('interrupted').pipe(Effect.ignore))
      return yield* Effect.failCause(exit.cause)
    } else {
      const error = Cause.squash(exit.cause)
      const code = failureCodeOf(error)
      if (code === 'merge_failed' || code === 'internal_error') {
        yield* Effect.sync(() => Sentry.captureException(error, { tags: { 'import.source': job.source } }))
      }
      outcome = yield* fail(code)
    }
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    yield* Effect.annotateCurrentSpan({ 'import.status': outcome.job.status, 'import.duration_ms': durationMs })
    yield* Effect.sync(() =>
      // One line per job; no user, save or source account IDs (§12.3)
      log.info({
        action: 'import.job',
        jobId: outcome.job.id,
        source: outcome.job.source,
        fetchedBy: 'server',
        trigger: outcome.job.trigger,
        status: outcome.job.status,
        errorCode: outcome.errorCode,
        ...outcome.job.counts,
        durationMs,
      }),
    )
    return outcome
  }).pipe(Effect.withSpan('import.job', { attributes: { 'import.source': job.source } }))
}

/**
 * Fails a started job as `interrupted` if it is still running: the request was interrupted (client disconnect,
 * shutdown) after the job row was committed but before {@link runServerImport} took it over, which would otherwise
 * leave it running, and blocking its source on the save, until the sweeper fails it 15 minutes later.
 */
export const failInterruptedImport = (database: DatabaseService, jobId: string) =>
  finishImportJob(database, jobId, { status: 'failed', counts: {}, errorCode: 'interrupted' }).pipe(
    Effect.ignore,
    Effect.uninterruptible,
  )

/** The answer of a replayed job: the job as it is now and the save's revision */
export const replayOutcome = (started: ServerImportStart): ServerImportOutcome => ({
  job: toImportJobDTO(started.job),
  revision: started.revision,
  errorCode: (started.job.error_code as ServerImportErrorCode | null) ?? null,
})

export { EMPTY_COUNTS }