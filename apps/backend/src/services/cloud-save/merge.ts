import type { ImportCountsDTO } from '@gekichumai/api-contract'
import {
  decideImportMerge,
  isPublicSheetId,
  type IncomingScoreRecord,
  type ScoreImportJob,
} from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import { CloudSaveNotFound } from './errors'
import {
  EMPTY_COUNTS,
  finishImportJob,
  IMPORT_JOB_COLUMNS,
  toImportJobDTO,
  toMergeJob,
  type ImportJobRow,
} from './jobs'
import { RecordWriter, toExistingRecord, WRITE_BATCH_SIZE, type LockedSave } from './records'
import { lockSave, saveTransaction } from './saves'

type DatabaseService = typeof Database.Service

/** One record of an import, already normalized and validated (`ImportRecordSchema`) */
export interface MergeRecord extends IncomingScoreRecord {
  sheetId: string
}

export interface MergeResult {
  counts: ImportCountsDTO
  /** The save's revision after the merge */
  revision: number
}

/**
 * Merges import records into a save (§5.3), the shared engine of server jobs, client jobs (PR 6) and migration.
 *
 * Runs inside the caller's transaction, which must hold the save `FOR UPDATE` ({@link lockSave}); `job` must be a
 * job of that save. Records are decided with `decideImportMerge` in payload order (a sheet listed twice is merged
 * twice: the second is decided against the first's result) and written in batches of at most 1000 rows per
 * statement, each bump taking the next revision. Events are written for effective changes only.
 *
 * Counts: `fetched` is the number of records; each record adds one to the key of its decision. A sheet ID that is not
 * a public sheet ID counts as `rejected` (normalizers should have dropped it), and so does a record of a new chart
 * once the save stores `CLOUD_SAVE_MAX_RECORDS_PER_SAVE` records.
 */
export const applyImportRecords = (
  database: DatabaseService,
  save: LockedSave,
  job: ScoreImportJob,
  records: readonly MergeRecord[],
) =>
  Effect.gen(function* () {
    const counts: ImportCountsDTO = { ...EMPTY_COUNTS, fetched: records.length }
    const writer = new RecordWriter(database, save)
    yield* writer.loadStoredCount()
    for (let offset = 0; offset < records.length; offset += WRITE_BATCH_SIZE) {
      const batch = records.slice(offset, offset + WRITE_BATCH_SIZE)
      const valid = batch.filter((record) => isPublicSheetId(record.sheetId))
      counts.rejected += batch.length - valid.length
      yield* writer.load(valid.map((record) => record.sheetId))
      for (const record of valid) {
        const before = writer.get(record.sheetId)
        const decision = decideImportMerge(before === null ? null : toExistingRecord(before), record, job)
        if (before === null && decision.next !== null && writer.remainingCapacity() === 0) {
          // the save is full (CLOUD_SAVE_MAX_RECORDS_PER_SAVE): a new chart is refused
          counts.rejected += 1
          continue
        }
        counts[decision.countKey] += 1
        if (decision.next === null) continue
        writer.apply(record.sheetId, {
          before,
          next: decision.next,
          bumpRevision: decision.bumpRevision,
          valueChanged: decision.valueChanged,
          liveDelta: decision.liveDelta,
          eventKind: decision.eventKind,
        })
      }
      yield* writer.flush()
    }
    yield* writer.finish()
    return { counts, revision: writer.revision } satisfies MergeResult
  })

/**
 * The content short-circuit (§5.5): whether the latest succeeded job of the same save, source and source account
 * has the same payload hash, and the save has not changed since that job completed (its revision is still the one
 * the job recorded, `counts.saveRevision`). Any later write (a manual edit, another import) makes the full merge
 * run, as the domain rules may decide differently against the changed records. The cleanup's tombstone purge drops
 * `counts.saveRevision` from the save's jobs for the same reason. Only automatic and migration jobs
 * take it: a user-started import still merges, so it can revive records deleted since (§5.3 deletion rule 2).
 *
 * A server job resolves the upstream payload through the catalog, so the same payload can resolve to more charts
 * once the catalog learns a new one. It passes `skippedUnknownSheet` (the records it could not resolve this time):
 * the short-circuit also needs the previous job to have skipped exactly as many, otherwise the job merges and the
 * newly known charts land in the save.
 */
export const shouldShortCircuit = (
  database: DatabaseService,
  job: ImportJobRow,
  saveRevision: number,
  options: { skippedUnknownSheet?: number } = {},
) =>
  Effect.gen(function* () {
    if (job.trigger === 'user' || job.raw_payload_sha256 === null) return false
    const { rows } = yield* database.raw<{
      raw_payload_sha256: string | null
      save_revision: string | null
      skipped_unknown_sheet: number | null
    }>(
      'CloudSave.previousJobHash',
      `SELECT raw_payload_sha256, counts->>'saveRevision' AS save_revision,
         (counts->>'skippedUnknownSheet')::integer AS skipped_unknown_sheet
       FROM score_import_jobs
       WHERE save_id = $1 AND source = $2 AND source_account_id IS NOT DISTINCT FROM $3
         AND status = 'succeeded' AND id <> $4
       ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`,
      [job.save_id, job.source, job.source_account_id, job.id],
    )
    const previous = rows[0]
    return (
      previous !== undefined &&
      previous.raw_payload_sha256 === job.raw_payload_sha256 &&
      previous.save_revision !== null &&
      previous.save_revision === String(saveRevision) &&
      (options.skippedUnknownSheet === undefined ||
        (previous.skipped_unknown_sheet ?? 0) === options.skippedUnknownSheet)
    )
  })

/** Whether any of `sheetIds` is a tombstone deleted at or after `since` (a deletion made while a job ran) */
export const hasDeletionSince = (database: DatabaseService, saveId: string, since: Date, sheetIds: readonly string[]) =>
  Effect.map(
    database.raw<{ found: boolean }>(
      'CloudSave.deletionSinceJobStart',
      `SELECT EXISTS (SELECT 1 FROM score_records
         WHERE save_id = $1 AND deleted_at >= $2 AND sheet_id = ANY($3::text[])) AS found`,
      [saveId, since, [...sheetIds]],
    ),
    ({ rows }) => rows[0]?.found === true,
  )

/**
 * Completes a running import job: in one transaction, locks the save, merges `records` (or short-circuits an
 * unchanged payload on an unchanged save, which writes no record, event or revision) and marks the job `succeeded` with its counts.
 * `extraCounts` adds what the caller counted before merging (`skippedUnknownSheet`, `rejected`, and their share of
 * `fetched`).
 */
export const completeImportJob = (
  database: DatabaseService,
  input: {
    userId: string
    saveId: string
    jobId: string
    records: readonly MergeRecord[]
    extraCounts?: Partial<ImportCountsDTO>
  },
) =>
  saveTransaction(database, () =>
    Effect.gen(function* () {
      const save = yield* lockSave(database, input.userId, input.saveId)
      const { rows } = yield* database.raw<ImportJobRow>(
        'CloudSave.loadRunningJob',
        `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs
         WHERE id = $1 AND save_id = $2 AND user_id = $3 AND status = 'running' FOR UPDATE`,
        [input.jobId, save.id, save.userId],
      )
      const jobRow = rows[0]
      if (!jobRow) return yield* new CloudSaveNotFound()

      let counts: ImportCountsDTO
      // Whether the merge's decisions hold for a later identical job: not when it kept a deletion only because the
      // deletion is newer than this job (§5.3 rule 2), since a job that starts after it decides by score instead
      let reusable = true
      if (
        yield* shouldShortCircuit(database, jobRow, save.revision, {
          skippedUnknownSheet: input.extraCounts?.skippedUnknownSheet,
        })
      ) {
        counts = { ...EMPTY_COUNTS, fetched: input.records.length, unchanged: input.records.length }
      } else {
        counts = (yield* applyImportRecords(database, save, toMergeJob(jobRow), input.records)).counts
        if (counts.skippedDeleted > 0) {
          reusable = !(yield* hasDeletionSince(
            database,
            save.id,
            jobRow.started_at,
            input.records.map((record) => record.sheetId),
          ))
        }
      }
      for (const [key, value] of Object.entries(input.extraCounts ?? {})) {
        counts[key as keyof ImportCountsDTO] += value ?? 0
      }
      const finished = yield* finishImportJob(database, jobRow.id, {
        status: 'succeeded',
        counts,
        // Without it, the next identical job runs the merge (see shouldShortCircuit)
        saveRevision: reusable ? save.revision : null,
      })
      return { job: toImportJobDTO(finished!), revision: save.revision }
    }),
  )