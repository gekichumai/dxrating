import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { handlerGen } from '@orpc/experimental-effect'
import { Clock, Effect } from 'effect'
import { log } from 'evlog'
import { appContract } from './contract'
import { Database } from './db/index'
import { rateLimit, requireFeature, requireSession, writeConcurrency } from './orpc-middleware'
import type { ApiContext } from './router'
import { listRecordEvents, pullChanges } from './services/cloud-save/changes'
import {
  CloudSaveBadRequest,
  CloudSaveBusy,
  CloudSaveLimitReached,
  CloudSaveNotFound,
  ImportInProgress,
  RevisionPreconditionFailed,
} from './services/cloud-save/errors'
import { exportChunks, exportHeaders } from './services/cloud-save/export'
import { getImportJob, listImportJobs } from './services/cloud-save/jobs'
import { applyMutations } from './services/cloud-save/mutations'
import { replaceRecords } from './services/cloud-save/replace'
import {
  createSave,
  createSnapshot,
  deleteSave,
  findSave,
  listSaves,
  listSnapshots,
  updateSave,
} from './services/cloud-save/saves'
import { cloudSaveRateLimits } from './services/rate-limit'
import { applyClientImportChunk } from './services/cloud-save/client-imports'
import {
  beginServerImport,
  failInterruptedImport,
  replayOutcome,
  runServerImport,
  type ServerImportFailure,
  type UpstreamFetch,
} from './services/cloud-save/server-imports'
import { fetchDivingFishImport, fetchLxnsImport } from './services/cloud-save/upstream-imports'
import { withViewer } from './proofs/viewer-is'

const os = implement(appContract).$context<ApiContext>()

/** Write requests one user may have in flight across the cloud save write routes (§7.1, §11.4) */
export const CLOUD_SAVE_WRITE_CONCURRENCY = 2
const SAVE_BUSY_RETRY_AFTER_SECONDS = 1
const cloudSave = os.cloudSave

/** Maps the cloud save failures to the contract's errors (design §5.1); other errors pass through */
type CloudSaveFailure =
  | CloudSaveNotFound
  | CloudSaveLimitReached
  | ImportInProgress
  | RevisionPreconditionFailed
  | CloudSaveBadRequest
  | CloudSaveBusy

export function toCloudSaveApiError<E>(error: E): Exclude<E, CloudSaveFailure> | ORPCError<string, unknown> {
  if (error instanceof CloudSaveNotFound) return new ORPCError('NOT_FOUND')
  if (error instanceof CloudSaveLimitReached) {
    return new ORPCError('CONFLICT', {
      message: 'Save limit reached',
      data: { reason: 'SAVE_LIMIT', limit: error.limit },
    })
  }
  if (error instanceof ImportInProgress) {
    return new ORPCError('CONFLICT', {
      message: 'An import of this source is already running',
      data: { reason: 'IMPORT_IN_PROGRESS', jobId: error.jobId },
    })
  }
  if (error instanceof RevisionPreconditionFailed) {
    return new ORPCError('PRECONDITION_FAILED', { message: 'The save changed', data: { revision: error.revision } })
  }
  if (error instanceof CloudSaveBadRequest) return new ORPCError('BAD_REQUEST', { message: error.message })
  if (error instanceof CloudSaveBusy) {
    // retryable like a rate limit; `writeConcurrency` adds the Retry-After header
    return new ORPCError('TOO_MANY_REQUESTS', {
      message: 'The save is busy. Retry shortly.',
      data: { retryAfterSeconds: SAVE_BUSY_RETRY_AFTER_SECONDS },
    })
  }
  return error as Exclude<E, CloudSaveFailure>
}

const apiErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError(toCloudSaveApiError))

// Every route: session -> cloud_save flag (404 when off) -> per-user rate limit (§5.1, §11.4)
const session = requireSession
const feature = requireFeature('cloud_save')
const limit = (name: keyof typeof cloudSaveRateLimits) => rateLimit(cloudSaveRateLimits[name])
// Write routes also run at most CLOUD_SAVE_WRITE_CONCURRENCY at a time per user (a waiting writer holds a connection)
const writes = writeConcurrency(CLOUD_SAVE_WRITE_CONCURRENCY)

const savesHandler = {
  list: cloudSave.saves.list
    .use(session)
    .use(feature)
    .use(limit('default'))
    .handler(
      handlerGen(function* ({ context }) {
        const database = yield* Database
        return { saves: yield* listSaves(database, context.user.id) }
      }),
    ),
  create: cloudSave.saves.create
    .use(session)
    .use(feature)
    .use(limit('createSave'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(createSave(database, context.user.id, input))
      }),
    ),
  update: cloudSave.saves.update
    .use(session)
    .use(feature)
    .use(limit('default'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(
          updateSave(database, context.user.id, input.id, { name: input.name, gameVersion: input.gameVersion }),
        )
      }),
    ),
  delete: cloudSave.saves.delete
    .use(session)
    .use(feature)
    .use(limit('default'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(deleteSave(database, context.user.id, input.id))
      }),
    ),
}

const recordsHandler = {
  changes: cloudSave.records.changes
    .use(session)
    .use(feature)
    .use(limit('changes'))
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(pullChanges(database, context.user.id, input.id, input.since, input.limit, input.mode))
      }),
    ),
  mutate: cloudSave.records.mutate
    .use(session)
    .use(feature)
    .use(limit('mutations'))
    .use(rateLimit(cloudSaveRateLimits.mutationItems, (input: { mutations: unknown[] }) => input.mutations.length))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        const startedAt = yield* Clock.currentTimeMillis
        const { result, stats } = yield* apiErrors(
          applyMutations(database, context.user.id, input.id, input.mutations),
        ).pipe(
          Effect.withSpan('cloudsave.mutations', { attributes: { 'cloudsave.mutations': input.mutations.length } }),
        )
        const finishedAt = yield* Clock.currentTimeMillis
        yield* Effect.sync(() => {
          for (const [status, count] of Object.entries(stats.statuses)) {
            if (count > 0) Sentry.metrics.count('cloudsave.mutation.result', count, { attributes: { status } })
          }
          if (stats.replayed > 0) {
            Sentry.metrics.count('cloudsave.mutation.result', stats.replayed, { attributes: { status: 'replayed' } })
          }
          if (stats.statuses.superseded > 0) Sentry.metrics.count('cloudsave.superseded', stats.statuses.superseded)
          // One line per batch; no user, save or provider account IDs (§12.3)
          log.info({
            action: 'cloudsave.mutations',
            mutations: input.mutations.length,
            ...stats.statuses,
            replayed: stats.replayed,
            revision: result.revision,
            durationMs: finishedAt - startedAt,
          })
        })
        return result
      }),
    ),
  events: cloudSave.records.events
    .use(session)
    .use(feature)
    .use(limit('default'))
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(listRecordEvents(database, context.user.id, input.id, input.sheetId))
      }),
    ),
  replace: cloudSave.records.replace
    .use(session)
    .use(feature)
    .use(limit('replace'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(
          replaceRecords(database, context.user.id, input.id, {
            ifRevision: input.ifRevision,
            idempotencyKey: input.idempotencyKey,
            source: input.source,
            records: input.records,
          }),
        )
      }),
    ),
}

/** Server imports (LXNS and Diving-Fish) one user may run at a time (§11.4) */
export const SERVER_IMPORT_CONCURRENCY = 1
// LXNS and Diving-Fish share one slot per user; they hold no write slot while they wait for the upstream
const serverImportSlot = writeConcurrency(SERVER_IMPORT_CONCURRENCY)
const serverImports = requireFeature('server_imports')

/** How long an LXNS or Diving-Fish fetch may take before the job fails (`timeout`) */
const API_IMPORT_TIMEOUT = '2 minutes'

/**
 * A server job (LXNS, Diving-Fish): replays answer the job as it is; otherwise the job runs to its end and the
 * answer is the job, succeeded or failed (`errorCode` tells why; a failed job wrote nothing).
 */
const serverImport = <R>(
  context: { user: { id: string }; refundRateLimit: () => void },
  input: { id: string; idempotencyKey: string; trigger: 'user' | 'auto' },
  source: 'lxns' | 'diving-fish',
  fetch: Effect.Effect<UpstreamFetch, ServerImportFailure, R>,
) =>
  // Starting and handing over are one unit: an interruption in between fails the new job (`interrupted`) instead of
  // leaving it running
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const database = yield* Database
      const started = yield* apiErrors(
        beginServerImport(database, {
          userId: context.user.id,
          saveId: input.id,
          source,
          trigger: input.trigger,
          idempotencyKey: input.idempotencyKey,
        }),
      )
      if (started.replayed) {
        // nothing was fetched: the request gives its rate limit unit back, as the NET route does
        context.refundRateLimit()
        const { job, revision } = replayOutcome(started)
        return { job, revision }
      }
      const { job, revision } = yield* restore(
        runServerImport(database, started, fetch, { timeout: API_IMPORT_TIMEOUT }),
      ).pipe(Effect.onInterrupt(() => failInterruptedImport(database, started.job.id)))
      return { job, revision }
    }),
  )

const importsHandler = {
  client: cloudSave.imports.client
    .use(session)
    .use(feature)
    .use(limit('clientImports'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        const startedAt = yield* Clock.currentTimeMillis
        const { id, ...chunk } = input
        const { result, replayed, hashMismatch } = yield* apiErrors(
          applyClientImportChunk(database, context.user.id, id, chunk),
        ).pipe(
          Effect.withSpan('import.job', {
            attributes: { 'import.source': input.source, 'import.fetched_by': 'client' },
          }),
        )
        // a replayed chunk wrote nothing: it gives its rate limit unit back
        if (replayed) context.refundRateLimit()
        const durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* Effect.sync(() => {
          if (hashMismatch)
            Sentry.metrics.count('import.client_hash_mismatch', 1, { attributes: { source: input.source } })
          // One line per chunk; no user, save or account IDs (§12.3)
          log.info({
            action: 'import.job',
            jobId: result.job.id,
            source: result.job.source,
            fetchedBy: 'client',
            trigger: result.job.trigger,
            status: result.job.status,
            chunkIndex: input.chunkIndex,
            chunkCount: input.chunkCount,
            replayed,
            hashMismatch,
            ...result.job.counts,
            durationMs,
          })
        })
        return result
      }),
    ),
  lxns: cloudSave.imports.lxns
    .use(session)
    .use(feature)
    .use(serverImports)
    .use(limit('serverImports'))
    .use(serverImportSlot)
    .handler(
      handlerGen(function* ({ context, input }) {
        // The LXNS tokens are read for the signed-in viewer only (gdp-ts `ViewerIs`)
        const viewer = context.viewer
        if (!viewer) return yield* Effect.fail(new ORPCError('UNAUTHORIZED'))
        return yield* serverImport(
          context,
          input,
          'lxns',
          withViewer(viewer, (named, proof) => fetchLxnsImport(named, proof)),
        )
      }),
    ),
  divingFish: cloudSave.imports.divingFish
    .use(session)
    .use(feature)
    .use(serverImports)
    .use(limit('serverImports'))
    .use(serverImportSlot)
    .handler(
      handlerGen(function* ({ context, input }) {
        const query = input.username !== undefined ? { username: input.username } : { qq: input.qq! }
        return yield* serverImport(context, input, 'diving-fish', fetchDivingFishImport(query))
      }),
    ),
  get: cloudSave.imports.get
    .use(session)
    .use(feature)
    .use(limit('default'))
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(getImportJob(database, context.user.id, input.jobId))
      }),
    ),
  list: cloudSave.imports.list
    .use(session)
    .use(feature)
    .use(limit('default'))
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        yield* apiErrors(findSave(database, context.user.id, input.id))
        return yield* listImportJobs(database, context.user.id, input.id, input.limit)
      }),
    ),
}

const snapshotsHandler = {
  create: cloudSave.snapshots.create
    .use(session)
    .use(feature)
    .use(limit('default'))
    .use(writes)
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        const { id, ...snapshot } = input
        return yield* apiErrors(createSnapshot(database, context.user.id, id, snapshot))
      }),
    ),
  list: cloudSave.snapshots.list
    .use(session)
    .use(feature)
    .use(limit('default'))
    .handler(
      handlerGen(function* ({ context, input }) {
        const database = yield* Database
        return yield* apiErrors(listSnapshots(database, context.user.id, input.id, input.limit))
      }),
    ),
}

/**
 * `GET /me/export` is served as a stream by a direct Hono route in `app.ts` (registered ahead of the oRPC handler);
 * this procedure builds the same document in memory for in-process callers.
 */
const exportHandler = cloudSave.export
  .use(session)
  .use(feature)
  .use(limit('export'))
  .handler(
    handlerGen(function* ({ context }) {
      const database = yield* Database
      const exportedAt = new Date(yield* Clock.currentTimeMillis)
      const parts = yield* Effect.promise(async () => {
        const chunks: string[] = []
        for await (const chunk of exportChunks(Effect.runPromise, database, context.user.id, exportedAt)) {
          chunks.push(chunk)
        }
        return chunks
      })
      return { headers: exportHeaders(exportedAt), body: new Blob(parts, { type: 'application/json' }) }
    }),
  )

export const cloudSaveHandler = {
  saves: savesHandler,
  records: recordsHandler,
  imports: importsHandler,
  snapshots: snapshotsHandler,
  export: exportHandler,
}