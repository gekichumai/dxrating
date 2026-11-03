import { Clock, Duration, Effect, Schedule } from 'effect'
import { log } from 'evlog'
import { Database } from '../../db/index'
import { RECORD_EVENTS_KEPT } from './changes'
import { sweepAbandonedImportJobs } from './jobs'
import { trimSnapshots } from './saves'

type DatabaseService = typeof Database.Service

const DAY_MS = 24 * 60 * 60_000

/** Retention (design §4.6, §5.6, §11.2) */
export const CLOUD_SAVE_RETENTION = {
  tombstoneMs: 90 * DAY_MS,
  mutationLedgerMs: 30 * DAY_MS,
  deletedSaveMs: 30 * DAY_MS,
  eventsPerRecord: RECORD_EVENTS_KEPT,
} as const

/** Saves whose tombstones are purged per transaction (each locked `FOR UPDATE` while it runs) */
const SAVES_PER_TRANSACTION = 50
/** Rows deleted per statement by the bulk steps */
const DELETE_BATCH = 10_000
/** Saves hard-deleted per statement (each cascades to all its rows, so far fewer per transaction) */
const SAVE_DELETE_BATCH = 100

/** `pg_try_advisory_xact_lock` key of the cleanup; one instance runs it at a time */
export const CLOUD_SAVE_CLEANUP_LOCK = 0x0d5a7e01

export interface CleanupReport {
  /** `false` when another instance held the lock and nothing was done */
  ran: boolean
  tombstonesPurged: number
  eventsPurged: number
  mutationsPurged: number
  savesPurged: number
  snapshotsPurged: number
  /** Import jobs still running after 15 minutes, failed as `abandoned` */
  jobsAbandoned: number
}

/**
 * One pass of the cloud save cleanup, idempotent and safe to run from several instances at once: each transaction
 * first takes a transaction-scoped advisory lock, and a pass that does not get it stops (another instance is
 * running). Times are relative to `now`, so tests pass a fake clock.
 *
 * 1. Tombstones deleted more than 90 days ago are hard-deleted, save by save: the save is locked `FOR UPDATE` like
 *    any writer (writers lock the save before its records, so the order cannot deadlock), its tombstones are deleted
 *    and `tombstone_horizon` moves to the highest purged revision. A client whose cursor is older then gets
 *    `resetRequired`. Known limitation of the design (§4.6, §5.3 rule 2): once a tombstone is purged, the next
 *    import that still carries the chart inserts it again, whatever its trigger, so a deletion only stays sticky
 *    against automatic imports for the 90 days.
 * 2. Events beyond the newest 20 per (save, sheet) are deleted.
 * 3. `score_mutations` ledger rows older than 30 days are deleted.
 * 4. Saves soft-deleted more than 30 days ago are hard-deleted (their rows cascade).
 * 5. Snapshots beyond the newest 100 per save are deleted.
 * 6. Import jobs still running 15 minutes after they started are failed (`abandoned`, design §7.1).
 */
export const runCloudSaveCleanup = (database: DatabaseService, now: Date) =>
  Effect.gen(function* () {
    const report: CleanupReport = {
      ran: false,
      tombstonesPurged: 0,
      eventsPurged: 0,
      mutationsPurged: 0,
      savesPurged: 0,
      snapshotsPurged: 0,
      jobsAbandoned: 0,
    }
    const tombstoneCutoff = new Date(now.getTime() - CLOUD_SAVE_RETENTION.tombstoneMs)

    // Each step runs in its own short transaction under the lock; losing the lock between steps ends the pass.
    const step = <A, E, R>(work: Effect.Effect<A, E, R>) =>
      database.transaction(() =>
        Effect.gen(function* () {
          const { rows } = yield* database.raw<{ locked: boolean }>(
            'CloudSave.cleanupLock',
            'SELECT pg_try_advisory_xact_lock($1) AS locked',
            [CLOUD_SAVE_CLEANUP_LOCK],
          )
          if (!rows[0]?.locked) return { locked: false as const }
          return { locked: true as const, value: yield* work }
        }),
      )

    // 1. Tombstones, a few saves per transaction
    let afterSave = ''
    for (;;) {
      const batch = yield* step(
        Effect.gen(function* () {
          const { rows: saves } = yield* database.raw<{ id: string }>(
            'CloudSave.cleanupLockSaves',
            `SELECT id FROM score_saves WHERE id IN (
               SELECT DISTINCT save_id FROM score_records WHERE deleted_at < $1 AND save_id > $2
               ORDER BY save_id LIMIT ${SAVES_PER_TRANSACTION}
             ) ORDER BY id FOR UPDATE`,
            [tombstoneCutoff, afterSave],
          )
          if (saves.length === 0) return { last: null, purged: 0 }
          const ids = saves.map((save) => save.id)
          const { rows } = yield* database.raw<{ purged: number }>(
            'CloudSave.purgeTombstones',
            `WITH purged AS (
               DELETE FROM score_records WHERE save_id = ANY($1::text[]) AND deleted_at < $2
               RETURNING save_id, revision
             ), horizons AS (
               SELECT save_id, max(revision) AS horizon, count(*) AS purged FROM purged GROUP BY save_id
             ), moved AS (
               UPDATE score_saves s SET tombstone_horizon = GREATEST(s.tombstone_horizon, h.horizon)
               FROM horizons h WHERE s.id = h.save_id RETURNING h.purged
             )
             SELECT coalesce(sum(purged), 0)::integer AS purged FROM moved`,
            [ids, tombstoneCutoff],
          )
          return { last: ids[ids.length - 1]!, purged: rows[0]?.purged ?? 0 }
        }),
      )
      if (!batch.locked) return report
      report.ran = true
      report.tombstonesPurged += batch.value.purged
      if (batch.value.last === null) break
      afterSave = batch.value.last
    }

    // 2-5. Bulk deletes, in bounded statements of at most `batchSize` rows each; a full batch means there may be more
    const repeat = (operation: string, batchSize: number, text: string, values: readonly unknown[]) =>
      Effect.gen(function* () {
        let total = 0
        for (;;) {
          const result = yield* step(
            Effect.map(database.raw<{ n: number }>(operation, text, values), ({ rows }) => rows[0]?.n ?? 0),
          )
          if (!result.locked) return { locked: false, total }
          total += result.value
          if (result.value < batchSize) return { locked: true, total }
        }
      })

    const events = yield* repeat(
      'CloudSave.purgeEvents',
      DELETE_BATCH,
      `WITH doomed AS (
         SELECT id FROM (
           SELECT id, row_number() OVER (PARTITION BY save_id, sheet_id ORDER BY id DESC) AS position
           FROM score_record_events
         ) ranked WHERE position > $1 LIMIT ${DELETE_BATCH}
       ), deleted AS (DELETE FROM score_record_events WHERE id IN (SELECT id FROM doomed) RETURNING 1)
       SELECT count(*)::integer AS n FROM deleted`,
      [CLOUD_SAVE_RETENTION.eventsPerRecord],
    )
    report.eventsPurged = events.total
    if (!events.locked) return report

    const mutations = yield* repeat(
      'CloudSave.purgeMutations',
      DELETE_BATCH,
      `WITH deleted AS (
         DELETE FROM score_mutations WHERE ctid IN (
           SELECT ctid FROM score_mutations WHERE created_at < $1 LIMIT ${DELETE_BATCH}
         ) RETURNING 1
       ) SELECT count(*)::integer AS n FROM deleted`,
      [new Date(now.getTime() - CLOUD_SAVE_RETENTION.mutationLedgerMs)],
    )
    report.mutationsPurged = mutations.total
    if (!mutations.locked) return report

    const saves = yield* repeat(
      'CloudSave.purgeDeletedSaves',
      SAVE_DELETE_BATCH,
      `WITH deleted AS (
         DELETE FROM score_saves WHERE id IN (
           SELECT id FROM score_saves WHERE deleted_at < $1 ORDER BY id LIMIT ${SAVE_DELETE_BATCH}
         ) RETURNING 1
       ) SELECT count(*)::integer AS n FROM deleted`,
      [new Date(now.getTime() - CLOUD_SAVE_RETENTION.deletedSaveMs)],
    )
    report.savesPurged = saves.total
    if (!saves.locked) return report

    const snapshots = yield* step(trimSnapshots(database, null))
    if (!snapshots.locked) return report
    report.snapshotsPurged = snapshots.value

    const abandoned = yield* step(sweepAbandonedImportJobs(database, now))
    if (abandoned.locked) report.jobsAbandoned = abandoned.value
    return report
  })

/** How often the cleanup runs, and how long after start the first pass waits */
export const CLEANUP_INTERVAL = Duration.hours(24)
export const CLEANUP_INITIAL_DELAY = Duration.minutes(5)

/**
 * Runs `pass` after {@link CLEANUP_INITIAL_DELAY}, then every {@link CLEANUP_INTERVAL}, forever. A failed pass is
 * logged and retried at the next interval. Interrupting the fiber (application shutdown) stops it; a pass in
 * progress rolls back its open transaction.
 */
export const scheduleCleanup = <E, R>(pass: Effect.Effect<CleanupReport, E, R>) =>
  Effect.sleep(CLEANUP_INITIAL_DELAY).pipe(
    Effect.andThen(
      pass.pipe(
        Effect.tap((report) => Effect.sync(() => log.info({ action: 'cloudsave.cleanup', ...report }))),
        Effect.catchCause((cause) => Effect.logError('Cloud save cleanup failed', cause)),
        Effect.repeat(Schedule.spaced(CLEANUP_INTERVAL)),
      ),
    ),
    Effect.asVoid,
  )

/** The cleanup loop of the running application (started by `index.ts` while `CLOUD_SAVE_MODE` is not `off`) */
export const cloudSaveCleanupLoop = scheduleCleanup(
  Effect.gen(function* () {
    const database = yield* Database
    const now = yield* Clock.currentTimeMillis
    return yield* runCloudSaveCleanup(database, new Date(now))
  }),
)
/**
 * The startup sweeper (design §7.1): no job of a previous process can still be running, so every job running for
 * more than 15 minutes is failed (`abandoned`) before the server accepts requests' imports.
 */
export const sweepAbandonedImportJobsAtStartup = Effect.gen(function* () {
  const database = yield* Database
  const swept = yield* sweepAbandonedImportJobs(database)
  if (swept > 0) yield* Effect.sync(() => log.info({ action: 'import.sweep', jobsAbandoned: swept }))
  return swept
})