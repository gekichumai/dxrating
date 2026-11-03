import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { handlerGen } from '@orpc/experimental-effect'
import { Clock, Effect } from 'effect'
import { log } from 'evlog'
import { appContract } from './contract'
import { Database } from './db/index'
import { rateLimit, requireFeature, requireSession } from './orpc-middleware'
import type { ApiContext } from './router'
import { listRecordEvents, pullChanges } from './services/cloud-save/changes'
import {
  CloudSaveBadRequest,
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

const os = implement(appContract).$context<ApiContext>()
const cloudSave = os.cloudSave

/** Maps the cloud save failures to the contract's errors (design §5.1); other errors pass through */
type CloudSaveFailure =
  | CloudSaveNotFound
  | CloudSaveLimitReached
  | ImportInProgress
  | RevisionPreconditionFailed
  | CloudSaveBadRequest

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
  return error as Exclude<E, CloudSaveFailure>
}

const apiErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError(toCloudSaveApiError))

// Every route: session -> cloud_save flag (404 when off) -> per-user rate limit (§5.1, §11.4)
const session = requireSession
const feature = requireFeature('cloud_save')
const limit = (name: keyof typeof cloudSaveRateLimits) => rateLimit(cloudSaveRateLimits[name])

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
        return yield* apiErrors(pullChanges(database, context.user.id, input.id, input.since, input.limit))
      }),
    ),
  mutate: cloudSave.records.mutate
    .use(session)
    .use(feature)
    .use(limit('mutations'))
    .use(rateLimit(cloudSaveRateLimits.mutationItems, (input: { mutations: unknown[] }) => input.mutations.length))
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

// Server imports and chunked client imports arrive with design PR 6; until then the routes exist (behind the
// flag) and answer 501.
const notYet = function* () {
  return yield* Effect.fail(new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented yet' }))
}

const importsHandler = {
  client: cloudSave.imports.client.use(session).use(feature).handler(handlerGen(notYet)),
  lxns: cloudSave.imports.lxns.use(session).use(feature).handler(handlerGen(notYet)),
  divingFish: cloudSave.imports.divingFish.use(session).use(feature).handler(handlerGen(notYet)),
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